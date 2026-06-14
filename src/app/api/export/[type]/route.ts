import { NextResponse } from "next/server";
import { formatDateTimeMx } from "@/lib/format";
import { requireApiPermission } from "@/lib/server/auth-store";
import {
  buildInventoryReport,
  buildProfitReport,
  buildSalesReport,
} from "@/lib/server/reports";
import { buildStoreDashboard } from "@/lib/server/dashboard-store";
import { buildRestockReport } from "@/lib/server/restock-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExportRouteProps = {
  params: Promise<{ type: string }>;
};

export async function GET(request: Request, { params }: ExportRouteProps) {
  const auth = await requireApiPermission("reports.export");
  if (auth.response) {
    return auth.response;
  }

  const { type } = await params;
  const searchParams = new URL(request.url).searchParams;
  const csv = await buildCsv(type, searchParams);
  const filename = `control-total-${type}-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}

async function buildCsv(type: string, searchParams = new URLSearchParams()) {
  if (type === "inventario") {
    const report = await buildInventoryReport();
    return toCsv(
      [
        "sku_maestro",
        "producto",
        "stock_fisico",
        "disponible",
        "costo_promedio",
        "valor_inventario",
        "bodegas",
      ],
      report.rows.map((row) => [
        row.masterSku,
        row.name,
        row.physicalQuantity,
        row.sellableQuantity,
        row.averageUnitCost,
        row.inventoryValue,
        row.balances
          .map((balance) => `${balance.warehouseName}:${balance.physicalQuantity}`)
          .join(" | "),
      ]),
    );
  }

  if (type === "ventas") {
    const report = await buildSalesReport({
      includeProductSummary: false,
      orderLimit: getExportOrderLimit(),
      orderDateRange: {
        orderedFrom: normalizeDateOnly(searchParams.get("from")),
        orderedTo: normalizeDateOnly(searchParams.get("to")),
      },
      query: searchParams.get("q"),
      status: searchParams.get("status"),
    });
    return toCsv(
      [
        "orden",
        "fecha",
        "cuenta",
        "estado",
        "venta_bruta",
        "recibido",
        "cargos",
        "items",
      ],
      report.orders.map((order) => [
        order.externalOrderId,
        formatDateTimeMx(order.orderedAt),
        order.accountAlias,
        order.status,
        order.grossAmount,
        order.isReceivedPending ? "PENDIENTE_BILLING" : order.estimatedReceived,
        order.totalCharges,
        order.items
          .map(
            (item) =>
              `${item.externalSku} x ${item.quantity} -> ${item.masterSku ?? "SIN_MAPEAR"}`,
          )
          .join(" | "),
      ]),
    );
  }

  if (type === "utilidad") {
    const report = await buildProfitReport({
      orderLimit: getExportOrderLimit(),
      orderDateFrom: normalizeDateOnly(searchParams.get("from")),
      orderDateTo: normalizeDateOnly(searchParams.get("to")),
    });
    return toCsv(
      [
        "orden",
        "fecha",
        "venta_bruta",
        "recibido",
        "cargos",
        "costos_full_fifo",
        "costo_producto",
        "utilidad",
        "margen",
        "estado",
      ],
      report.settledOrders.map((order) => {
        const incomplete = order.missingCostItems > 0 || order.unmappedItems > 0;
        const pendingBilling = order.isReceivedPending;

        return [
          order.externalOrderId,
          formatDateTimeMx(order.orderedAt),
          order.grossAmount,
          pendingBilling ? "PENDIENTE_BILLING" : order.estimatedReceived,
          order.totalCharges,
          order.additionalCosts,
          order.productCost,
          pendingBilling ? "PENDIENTE_BILLING" : order.netProfit,
          pendingBilling ? "PENDIENTE_BILLING" : order.marginPercent,
          incomplete || pendingBilling ? "INCOMPLETO" : "COMPLETO",
        ];
      }),
    );
  }

  if (type === "alertas") {
    const dashboard = await buildStoreDashboard();
    return toCsv(
      ["tipo", "referencia", "descripcion", "valor"],
      [
        ...dashboard.negativeStock.map((product) => [
          "stock_negativo",
          product.masterSku,
          product.name,
          product.currentStock,
        ]),
        ...dashboard.lowStock.map((product) => [
          "stock_bajo",
          product.masterSku,
          product.name,
          product.currentStock,
        ]),
        ...dashboard.unmappedItems.map((item) => [
          "sku_sin_mapear",
          item.externalSku,
          item.title,
          item.orderId,
        ]),
        ...dashboard.stuckProducts.map((product) => [
          "producto_atorado",
          product.masterSku,
          product.name,
          product.currentStock,
        ]),
        ...dashboard.lossOrders.map((order) => [
          "venta_perdida",
          order.externalOrderId,
          order.status,
          order.netProfit ?? 0,
        ]),
      ],
    );
  }

  if (type === "skus") {
    const report = await buildInventoryReport();
    return toCsv(
      ["sku_maestro", "producto", "skus_online", "bodegas", "costo_promedio"],
      report.rows.map((row) => [
        row.masterSku,
        row.name,
        row.onlineSkuCount,
        row.balances
          .map((balance) => `${balance.warehouseName}:${balance.physicalQuantity}`)
          .join(" | "),
        row.averageUnitCost,
      ]),
    );
  }

  if (type === "resurtido") {
    const report = await buildRestockReport();
    return toCsv(
      [
        "sku_maestro",
        "producto",
        "stock",
        "vendido_90d",
        "dias_restantes",
        "sugerido_90d",
        "prioridad",
        "costo_promedio",
        "valor_inventario",
      ],
      report.rows.map((row) => [
        row.masterSku,
        row.name,
        row.physicalQuantity,
        row.sold90,
        row.daysLeft === null ? "SIN_VENTAS" : Math.ceil(row.daysLeft),
        row.suggestedQuantity,
        row.priority,
        row.averageUnitCost,
        row.inventoryValue,
      ]),
    );
  }

  return toCsv(["error"], [["Tipo de exportacion no soportado"]]);
}

function toCsv(headers: string[], rows: Array<Array<string | number | null>>) {
  return [
    headers.map(escapeCsv).join(","),
    ...rows.map((row) => row.map(escapeCsv).join(",")),
  ].join("\n");
}

function getExportOrderLimit() {
  const value = Number(process.env.EXPORT_MAX_ORDERS ?? 100_000);
  return Number.isFinite(value) && value > 0
    ? Math.min(Math.floor(value), 100_000)
    : 100_000;
}

function normalizeDateOnly(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return null;
  }

  return value;
}

function escapeCsv(value: string | number | null) {
  const text =
    typeof value === "number" ? String(value) : sanitizeSpreadsheetText(String(value ?? ""));
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function sanitizeSpreadsheetText(text: string) {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}
