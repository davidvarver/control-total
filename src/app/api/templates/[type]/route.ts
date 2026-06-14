import ExcelJS from "exceljs";
import { requireApiPermission } from "@/lib/server/auth-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TemplateRouteProps = {
  params: Promise<{ type: string }>;
};

const templates: Record<
  string,
  {
    sheet: string;
    filename: string;
    columns: Array<{ header: string; key: string; width?: number }>;
    rows: Array<Record<string, string | number>>;
  }
> = {
  inventario: {
    sheet: "INVENTARIO",
    filename: "plantilla-inventario.xlsx",
    columns: [
      { header: "SKU Maestro", key: "masterSku", width: 26 },
      { header: "Stock Actual", key: "stock", width: 16 },
    ],
    rows: [
      { masterSku: "SILLA.02", stock: 120 },
      { masterSku: "MESA.01", stock: 35 },
    ],
  },
  equivalencias: {
    sheet: "CATALOGO",
    filename: "plantilla-equivalencias.xlsx",
    columns: [
      { header: "SKU Online", key: "onlineSku", width: 32 },
      { header: "Titulo", key: "title", width: 42 },
      { header: "SKU Maestro", key: "masterSku", width: 26 },
      { header: "Multiplicador", key: "quantityRequired", width: 18 },
      { header: "Canal", key: "channel", width: 18 },
      { header: "Cuenta", key: "account", width: 20 },
    ],
    rows: [
      {
        onlineSku: "SILLA.02-10PZ",
        title: "Silla modelo 02 set de 10",
        masterSku: "SILLA.02",
        quantityRequired: 10,
        channel: "mercado_libre",
        account: "Cuenta Meli",
      },
    ],
  },
  costos: {
    sheet: "COSTOS",
    filename: "plantilla-costos.xlsx",
    columns: [
      { header: "SKU Maestro", key: "masterSku", width: 26 },
      { header: "Costo Promedio", key: "averageUnitCost", width: 18 },
    ],
    rows: [
      { masterSku: "SILLA.02", averageUnitCost: 180 },
      { masterSku: "MESA.01", averageUnitCost: 420 },
    ],
  },
  full: {
    sheet: "FULL_FIFO",
    filename: "plantilla-full-fifo.xlsx",
    columns: [
      { header: "SKU Maestro", key: "masterSku", width: 26 },
      { header: "Piezas", key: "quantity", width: 14 },
      { header: "Volumen total", key: "totalVolume", width: 18 },
      { header: "Unidad volumen", key: "volumeUnit", width: 18 },
      { header: "Costo envio del embarque", key: "shipmentFreightCostTotal", width: 28 },
      { header: "Almacenaje por pieza por dia", key: "storageCostPerUnitPerDay", width: 28 },
      { header: "Fecha recibido", key: "dateReceived", width: 18 },
      { header: "Folio/nota Full", key: "note", width: 28 },
    ],
    rows: [
      {
        masterSku: "SILLA.02",
        quantity: 100,
        totalVolume: 4000000,
        volumeUnit: "cm3",
        shipmentFreightCostTotal: 1800,
        storageCostPerUnitPerDay: 0.12,
        dateReceived: "2026-05-21",
        note: "FULL-MAYO-001",
      },
      {
        masterSku: "MESA.01",
        quantity: 40,
        totalVolume: 6000000,
        volumeUnit: "cm3",
        shipmentFreightCostTotal: 1800,
        storageCostPerUnitPerDay: 0.12,
        dateReceived: "2026-05-21",
        note: "FULL-MAYO-001",
      },
    ],
  },
  ventas_externas: {
    sheet: "VENTAS_EXTERNAS",
    filename: "plantilla-ventas-externas.xlsx",
    columns: [
      { header: "Referencia", key: "reference", width: 24 },
      { header: "Canal", key: "channel", width: 18 },
      { header: "Fecha", key: "date", width: 18 },
      { header: "Cliente", key: "customer", width: 28 },
      { header: "Bodega", key: "warehouse", width: 18 },
      { header: "SKU Maestro", key: "masterSku", width: 26 },
      { header: "Cantidad", key: "quantity", width: 14 },
      { header: "Precio Unitario", key: "unitPrice", width: 18 },
      { header: "Recibido Real", key: "netReceived", width: 18 },
      { header: "Cargo", key: "charge", width: 14 },
      { header: "Tipo Cargo", key: "chargeType", width: 18 },
      { header: "Nota", key: "note", width: 32 },
    ],
    rows: [
      {
        reference: "MOSTRADOR-001",
        channel: "manual",
        date: "2026-05-28",
        customer: "Cliente mostrador",
        warehouse: "wh_main",
        masterSku: "SILLA.02",
        quantity: 1,
        unitPrice: 349,
        netReceived: 349,
        charge: 0,
        chargeType: "other",
        note: "Venta en bodega",
      },
      {
        reference: "TIKTOK-001",
        channel: "tiktok",
        date: "2026-05-28",
        customer: "Cliente TikTok",
        warehouse: "wh_main",
        masterSku: "MESA.01",
        quantity: 2,
        unitPrice: 599,
        netReceived: 1120,
        charge: 78,
        chargeType: "marketplace_commission",
        note: "Misma referencia agrupa varias filas",
      },
    ],
  },
};

export async function GET(_request: Request, { params }: TemplateRouteProps) {
  const auth = await requireApiPermission("imports.write");
  if (auth.response) {
    return auth.response;
  }

  const { type } = await params;
  const template = templates[type];
  if (!template) {
    return new Response("Plantilla no soportada", { status: 404 });
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(template.sheet);
  worksheet.columns = template.columns;
  worksheet.addRows(template.rows);
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE5E7EB" },
  };
  worksheet.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(buffer, {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${template.filename}"`,
    },
  });
}
