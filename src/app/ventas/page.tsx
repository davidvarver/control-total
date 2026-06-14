export const dynamic = "force-dynamic";

import Link from "next/link";
import { Suspense } from "react";
import { BadgeDollarSign, Coins, Package, Plus, ReceiptText, ShoppingCart } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ProductThumbnail } from "@/components/product-thumbnail";
import { formatDateTimeMx } from "@/lib/format";
import { requirePermission, userHasPermission } from "@/lib/server/auth-store";
import { buildSalesReport } from "@/lib/server/reports";

const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});
const number = new Intl.NumberFormat("es-MX");
const chargeLabels: Record<string, string> = {
  marketplace_commission: "Comision Mercado Libre",
  shipping: "Envio base Meli",
  fulfillment: "Cobro Full no explicado",
  advertising: "Publicidad",
  promotion: "Promocion",
  financing: "Financiamiento",
  storage: "Almacenaje",
  return_cost: "Devolucion",
  tax_withholding: "Impuestos retenidos",
  other: "Otro cargo",
};

type SalesPageProps = {
  searchParams: Promise<{
    q?: string;
    page?: string;
    status?: string;
    warehouse?: string;
    pending?: string;
    from?: string;
    to?: string;
    billing_checked?: string;
    billing_updated?: string;
    billing_pending?: string;
    repair_checked?: string;
    repair_repaired?: string;
    repair_failed?: string;
    repair_after?: string;
    manual_imported?: string;
    error?: string;
  }>;
};

export default async function SalesPage({ searchParams }: SalesPageProps) {
  const user = await requirePermission("sales.view");
  return (
    <AppShell
      active="ventas"
      title="Ventas"
      subtitle="Ventas de Mercado Libre y canales externos, cobros detectados y dinero recibido."
      organization={user.organizationName}
      userEmail={user.email}
      actions={<SalesActions canExport={userHasPermission(user, "reports.export")} />}
    >
      <Suspense fallback={<SalesPageSkeleton />}>
        <SalesContent searchParams={searchParams} />
      </Suspense>
    </AppShell>
  );
}

async function SalesContent({ searchParams }: SalesPageProps) {
  const params = await searchParams;
  const query = (params.q ?? "").trim().toLowerCase();
  const dateRange = normalizeDateRange(params.from, params.to);
  const hasActiveFilters = Boolean(
    query ||
      params.status ||
      params.warehouse ||
      params.pending ||
      dateRange.from ||
      dateRange.to,
  );
  const salesOrderLimit = getSalesPageOrderLimit({
    needsWideScan: hasActiveFilters,
  });
  const report = await buildSalesReport({
    includeProductSummary: false,
    orderLimit: salesOrderLimit,
    orderDateRange: {
      orderedFrom: dateRange.from,
      orderedTo: dateRange.to,
    },
    query,
    status: params.status,
  });
  const filteredOrders = report.orders.filter((order) => {
    const externalOrderIds = order.externalOrderIds ?? [order.externalOrderId];
    const searchableIds = [
      order.marketplaceSaleId,
      order.realSaleKey,
      ...externalOrderIds,
    ].filter(Boolean);
    const matchesQuery =
      !query ||
      searchableIds.some((id) => id.toLowerCase().includes(query)) ||
      order.items.some(
        (item) =>
          item.externalSku.toLowerCase().includes(query) ||
          item.title.toLowerCase().includes(query) ||
          (item.masterSku ?? "").toLowerCase().includes(query),
      );
    const matchesStatus = !params.status || order.status === params.status;
    const matchesWarehouse =
      !params.warehouse ||
      order.items.some((item) => item.warehouseId === params.warehouse);
    const matchesPending =
      !params.pending ||
      (params.pending === "unmapped" &&
        order.items.some((item) => !item.masterSku)) ||
      (params.pending === "charges" && order.charges.length === 0) ||
      (params.pending === "billing" && order.isReceivedPending) ||
      (params.pending === "cancelled_review" &&
        order.needsCancelledBillingReview);
    const matchesDate = isWithinDateRange(order.orderedAt, dateRange);

    return (
      matchesQuery &&
      matchesStatus &&
      matchesWarehouse &&
      matchesPending &&
      matchesDate
    );
  });
  const filteredTotals = calculateSalesTotals(filteredOrders);
  const pageSize = 100;
  const currentPage = normalizePage(params.page);
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const orders = filteredOrders.slice((safePage - 1) * pageSize, safePage * pageSize);
  const statuses = [...new Set(report.orders.map((order) => order.status))].sort();
  const warehouses = [
    ...new Map(
      report.orders.flatMap((order) =>
        order.items.map((item) => [
          item.warehouseId,
          { id: item.warehouseId, name: item.warehouseName },
        ]),
      ),
    ).values(),
  ];
  const isResultCapped = report.orders.length >= salesOrderLimit;

  return (
    <div className="ct-ops-page">

        {params.billing_checked ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            Dinero revisado con Meli: {params.billing_checked} ventas. Actualizadas:{" "}
            {params.billing_updated ?? "0"}. Aun pendientes:{" "}
            {params.billing_pending ?? "0"}.
          </div>
        ) : null}
        {params.repair_checked ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            Ventas actualizadas con Meli: revisadas {params.repair_checked}, refrescadas{" "}
            {params.repair_repaired ?? "0"}, fallidas {params.repair_failed ?? "0"}.
            Quedan {params.repair_after ?? "0"} problema(s).
          </div>
        ) : null}
        {params.manual_imported ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            Ventas externas importadas: {params.manual_imported}.
          </div>
        ) : null}
        {params.error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {params.error}
          </div>
        ) : null}

        <section className="ct-ops-kpi-grid">
          <Kpi
            label="Ordenes importadas"
            value={number.format(filteredTotals.orders)}
            detail={`${number.format(filteredTotals.confirmedOrders)} confirmadas | ${number.format(filteredTotals.pendingReceivedOrders)} pendientes Meli`}
            icon={<ShoppingCart size={18} />}
          />
          <Kpi
            label="Venta bruta"
            value={money.format(filteredTotals.grossAmount)}
            detail="Ventas no canceladas del filtro"
            icon={<BadgeDollarSign size={18} />}
          />
          <Kpi
            label="Cargos Meli detectados"
            value={money.format(filteredTotals.totalCharges)}
            detail="Comisiones, envios y otros cargos encontrados"
            icon={<ReceiptText size={18} />}
          />
          <Kpi
            label="Costo producto"
            value={money.format(filteredTotals.productCost)}
            detail="Costo promedio de SKUs ligados"
            icon={<Package size={18} />}
          />
          <Kpi
            label="Utilidad confirmada"
            value={money.format(filteredTotals.confirmedNetProfit)}
            detail={`Recibido: ${money.format(filteredTotals.estimatedReceived)}`}
            icon={<Coins size={18} />}
            tone={filteredTotals.confirmedNetProfit < 0 ? "red" : "default"}
          />
        </section>

        <section id="ventas-importadas" className="ct-ops-panel scroll-mt-24">
          <div className="ct-ops-panel-header">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="ct-ops-kicker">Operacion diaria</p>
                <h2 className="ct-ops-title">Ventas importadas</h2>
                <p className="ct-ops-copy">
                  Lista operativa de ordenes, dinero y pendientes.
                </p>
              </div>
            </div>
            <form
              action="/ventas#ventas-importadas"
              method="get"
              className="ct-ops-filterbar md:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_150px_150px_150px_160px_170px_120px]"
            >
              <input type="hidden" name="page" value="1" />
              <input
                name="q"
                defaultValue={params.q ?? ""}
                placeholder="Buscar orden, SKU o producto"
                className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
              />
              <label className="grid gap-1 text-xs font-black uppercase text-zinc-500">
                Desde
                <input
                  name="from"
                  type="date"
                  defaultValue={dateRange.from ?? ""}
                  className="h-10 rounded-md border border-zinc-300 px-3 text-sm font-semibold normal-case text-zinc-950 outline-none focus:border-zinc-950"
                />
              </label>
              <label className="grid gap-1 text-xs font-black uppercase text-zinc-500">
                Hasta
                <input
                  name="to"
                  type="date"
                  defaultValue={dateRange.to ?? ""}
                  className="h-10 rounded-md border border-zinc-300 px-3 text-sm font-semibold normal-case text-zinc-950 outline-none focus:border-zinc-950"
                />
              </label>
              <select
                name="status"
                defaultValue={params.status ?? ""}
                className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
              >
                <option value="">Todos estados</option>
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
              <select
                name="warehouse"
                defaultValue={params.warehouse ?? ""}
                className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
              >
                <option value="">Todas bodegas</option>
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
              <select
                name="pending"
                defaultValue={params.pending ?? ""}
                className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
              >
                <option value="">Todo</option>
                <option value="unmapped">Con SKU sin mapear</option>
                <option value="charges">Sin cargos detectados</option>
                <option value="billing">Esperando dinero Meli</option>
                <option value="cancelled_review">Canceladas por verificar</option>
              </select>
              <button type="submit" className="h-10 rounded-md bg-zinc-950 px-3 text-sm font-semibold text-white hover:bg-zinc-800">
                Filtrar
              </button>
            </form>
            {(query || params.status || params.warehouse || params.pending || dateRange.from || dateRange.to) ? (
              <div className="ct-ops-chip-row mt-3 text-xs font-semibold text-zinc-500">
                <span>
                  Filtro activo: {number.format(filteredOrders.length)} de{" "}
                  {number.format(report.orders.length)} ventas cargadas
                </span>
                <Link
                  href="/ventas#ventas-importadas"
                  prefetch={false}
                  className="ct-ops-chip"
                >
                  Limpiar
                </Link>
              </div>
            ) : null}
            {hasActiveFilters && isResultCapped ? (
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                Este filtro llego al limite de {number.format(salesOrderLimit)} ventas
                cargadas. Reduce el rango de fechas para un conteo exacto y mas rapido.
              </div>
            ) : null}
          </div>
          <div className="ct-ops-mobile-list md:hidden">
            {orders.map((order) => (
              <Link
                key={order.realSaleKey ?? order.externalOrderId}
                href={`/ventas/${encodeURIComponent(order.marketplaceSaleId)}`}
                prefetch={false}
                className="ct-ops-mobile-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <ProductThumbnail
                      imageUrl={getPrimaryOrderImage(order)}
                      label={order.summaryItems[0]?.title ?? order.marketplaceSaleId}
                    />
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs font-black">
                        {order.marketplaceSaleId}
                      </p>
                      {order.marketplaceSaleId !== order.externalOrderId ? (
                        <p className="mt-1 truncate text-[11px] text-zinc-500">
                          Orden API {order.externalOrderId}
                        </p>
                      ) : null}
                      <p className="mt-1 text-xs text-zinc-500">
                        {formatDateTimeMx(order.orderedAt)} | {order.accountAlias}
                      </p>
                      <p className="mt-1 truncate text-sm font-semibold">
                        {order.summaryItems.map((item) => item.title).join(" | ")}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${
                      order.isCancelled
                        ? "bg-zinc-100 text-zinc-600"
                        : order.isReceivedPending
                          ? "bg-amber-50 text-amber-700"
                          : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {order.status}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <MobileMoney label="Venta" value={money.format(order.grossAmount)} />
                  <MobileMoney
                    label="Venta - producto"
                    value={money.format(order.productGrossProfit)}
                    tone={order.productGrossProfit < 0 ? "red" : "neutral"}
                  />
                  <MobileMoney
                    label="Recibido"
                    value={
                      order.isReceivedPending
                        ? "Pendiente"
                        : money.format(order.estimatedReceived)
                    }
                    tone={order.isReceivedPending ? "amber" : "neutral"}
                  />
                  <MobileMoney label="Cargos" value={money.format(order.totalCharges)} />
                </div>
              </Link>
            ))}
            {orders.length === 0 ? (
              <p className="ct-ops-empty">
                Todavia no hay ventas importadas.
              </p>
            ) : null}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-4 py-3">Venta / Fecha</th>
                  <th className="px-4 py-3">Cuenta</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Dinero</th>
                  <th className="px-4 py-3">Resumen</th>
                  <th className="px-4 py-3">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {orders.map((order) => {
                  const itemUnits = order.items.reduce(
                    (sum, item) => sum + item.activeQuantity,
                    0,
                  );
                  const internalOrderText =
                    order.internalOrderCount > 1
                      ? `${number.format(order.internalOrderCount)} ordenes internas Meli`
                      : order.channel === "mercado_libre"
                        ? "1 orden Meli"
                        : "Venta externa";

                  return (
                  <tr key={order.realSaleKey ?? order.externalOrderId} className="align-top">
                    <td className="px-4 py-3 font-mono text-xs font-semibold">
                      <Link
                        href={`/ventas/${encodeURIComponent(order.marketplaceSaleId)}`}
                        prefetch={false}
                        className="underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-950"
                      >
                        {order.marketplaceSaleId}
                      </Link>
                      {order.marketplaceSaleId !== order.externalOrderId ? (
                        <p className="mt-1 font-sans text-[11px] font-normal text-zinc-500">
                          Orden API {order.externalOrderId}
                        </p>
                      ) : null}
                      <p className="mt-1 font-sans text-xs font-normal text-zinc-500">
                        {formatDateTimeMx(order.orderedAt)}
                      </p>
                      {order.internalOrderCount > 1 ? (
                        <p className="mt-1 font-sans text-xs font-normal text-zinc-500">
                          {internalOrderText}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">{order.accountAlias}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          order.isCancelled
                            ? "bg-zinc-100 text-zinc-600"
                            : order.isReceivedPending
                            ? "bg-amber-50 text-amber-700"
                            : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {order.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <p className="font-semibold">{money.format(order.grossAmount)}</p>
                        {order.isCancelled ? (
                          <p className="text-xs font-semibold text-zinc-500">
                            Cancelada: no cuenta
                          </p>
                        ) : (
                          <>
                            <p className="text-xs text-zinc-500">
                              Recibido:{" "}
                              {order.isReceivedPending ? (
                                <span className="font-semibold text-amber-700">
                                  Esperando Meli
                                </span>
                              ) : (
                                <span className="font-semibold text-zinc-950">
                                  {money.format(order.estimatedReceived)}
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-zinc-500">
                              Cargos: {money.format(order.totalCharges)}
                            </p>
                            <p
                              className={`text-xs ${
                                order.productGrossProfit < 0
                                  ? "font-semibold text-red-700"
                                  : "text-zinc-500"
                              }`}
                            >
                              Venta - producto: {money.format(order.productGrossProfit)}
                            </p>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex min-w-[260px] items-center gap-3">
                        <ProductThumbnail
                          imageUrl={getPrimaryOrderImage(order)}
                          label={order.summaryItems[0]?.title ?? order.marketplaceSaleId}
                        />
                        <div className="min-w-0">
                          <p className="font-semibold">
                            {number.format(itemUnits)} pieza(s)
                          </p>
                          <p className="mt-1 max-w-[320px] truncate text-xs text-zinc-500">
                            {order.summaryItems.map((item) => item.title).join(" | ")}
                          </p>
                          {order.summaryItems.some((item) => !item.masterSku) ? (
                            <p className="mt-1 text-xs font-semibold text-amber-700">
                              Tiene SKU sin mapear
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <details className="group">
                        <summary className="inline-flex h-8 cursor-pointer list-none items-center rounded-md border border-zinc-300 px-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">
                          Ver detalle
                        </summary>
                        <div className="mt-3 w-[360px] space-y-3 rounded-md border border-zinc-200 bg-zinc-50 p-3">
                          <div>
                            <p className="text-xs font-semibold uppercase text-zinc-500">
                              Cargos
                            </p>
                            <div className="mt-1 space-y-1">
                              {order.isCancelled ? (
                                <span className="text-xs text-zinc-500">
                                  Venta cancelada. Sin cargos activos para utilidad.
                                </span>
                              ) : null}
                              {!order.isCancelled && order.charges.map((charge, index) => (
                                <div
                                  key={`${order.externalOrderId}-${charge.type}-${charge.amount}-${index}`}
                                  className="flex justify-between gap-4 text-xs"
                                >
                                  <span className={charge.type === "fulfillment" ? "font-semibold text-red-700" : "text-zinc-600"}>
                                    {chargeLabels[charge.type] ?? charge.type}
                                  </span>
                                  <span className={charge.type === "fulfillment" ? "font-semibold text-red-700" : "font-semibold"}>
                                    {money.format(charge.amount)}
                                  </span>
                                </div>
                              ))}
                              {!order.isCancelled && order.charges.length === 0 ? (
                                <span className="text-xs text-zinc-400">
                                  Sin cargos detectados
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase text-zinc-500">
                              Items
                            </p>
                            <div className="mt-1 space-y-2">
                              {order.summaryItems.map((item, index) => (
                                <div
                                  key={`${order.externalOrderId}-${item.externalSku}-${index}`}
                                  className="flex gap-2"
                                >
                                  <ProductThumbnail imageUrl={item.imageUrl} label={item.title} size="sm" />
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold">{item.title}</p>
                                    <p className="text-xs text-zinc-500">
                                      {item.externalSku} x {number.format(item.activeQuantity)} |{" "}
                                      {money.format(item.unitPrice)} | {item.warehouseName}
                                    </p>
                                    {item.cancelledQuantity > 0 ? (
                                      <p className="text-xs font-semibold text-amber-700">
                                        Anuladas por Meli: {number.format(item.cancelledQuantity)}
                                      </p>
                                    ) : null}
                                    <p className="text-xs text-zinc-500">
                                      {order.isCancelled
                                        ? "No descuenta inventario"
                                        : item.masterSku
                                        ? `SKU maestro ${item.masterSku}, consume ${number.format(item.consumedQuantity ?? 0)}`
                                        : "Sin mapear"}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </details>
                    </td>
                  </tr>
                  );
                })}
                {orders.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-zinc-500" colSpan={6}>
                      Todavia no hay ventas importadas.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-3 text-sm">
            <p className="font-semibold text-zinc-500">
              Mostrando {number.format(orders.length)} de{" "}
              {number.format(filteredOrders.length)} ventas. Pagina{" "}
              {number.format(safePage)} de {number.format(totalPages)}.
            </p>
            <div className="flex gap-2">
              <PaginationLink
                params={params}
                page={safePage - 1}
                disabled={safePage <= 1}
                label="Anterior"
              />
              <PaginationLink
                params={params}
                page={safePage + 1}
                disabled={safePage >= totalPages}
                label="Siguiente"
              />
            </div>
          </div>
        </section>
    </div>
  );
}

function SalesActions({ canExport }: { canExport: boolean }) {
  return (
    <>
      <Link
        href="/ventas/nueva"
        prefetch={false}
        className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white hover:bg-blue-800"
      >
        <Plus size={16} />
        Venta externa
      </Link>
      <Link
        href="/auditoria"
        prefetch={false}
        className="inline-flex h-10 items-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
      >
        Auditar ventas
      </Link>
      <Link
        href="/inventario"
        prefetch={false}
        className="inline-flex h-10 items-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
      >
        Ver inventario
      </Link>
      {canExport ? (
        <Link
          href="/api/export/ventas"
          prefetch={false}
          className="inline-flex h-10 items-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
        >
          Exportar CSV
        </Link>
      ) : null}
      <Link
        href="/utilidad"
        prefetch={false}
        className="inline-flex h-10 items-center rounded-md bg-slate-950 px-3 text-sm font-semibold text-white hover:bg-slate-800"
      >
        Ver utilidad
      </Link>
    </>
  );
}

type SalesReportOrder = Awaited<ReturnType<typeof buildSalesReport>>["orders"][number];

function getPrimaryOrderImage(order: SalesReportOrder) {
  return order.summaryItems.find((item) => item.imageUrl)?.imageUrl ?? null;
}

function SalesPageSkeleton() {
  return (
    <>
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {[0, 1, 2, 3, 4].map((item) => (
          <div
            key={item}
            className="h-24 animate-pulse rounded-lg border border-zinc-200 bg-white"
          />
        ))}
      </section>
      <section className="scroll-mt-24 rounded-lg border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-4 py-3">
          <div className="h-7 w-48 animate-pulse rounded-md bg-slate-100" />
          <div className="mt-3 h-10 animate-pulse rounded-md bg-slate-100" />
        </div>
        <div className="space-y-3 p-4">
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <div key={item} className="h-14 animate-pulse rounded-md bg-slate-100" />
          ))}
        </div>
      </section>
    </>
  );
}

function normalizePage(value?: string) {
  const page = Number(value ?? "1");
  if (!Number.isInteger(page) || page < 1) {
    return 1;
  }

  return page;
}

function getSalesPageOrderLimit(options?: { needsWideScan?: boolean }) {
  const envName = options?.needsWideScan
    ? "SALES_PAGE_FILTER_MAX_ORDERS"
    : "SALES_PAGE_MAX_ORDERS";
  const fallback = options?.needsWideScan ? 100_000 : 1_500;
  const value = Number(process.env[envName] ?? fallback);
  return Number.isFinite(value) && value > 0
    ? Math.min(Math.floor(value), 100_000)
    : fallback;
}

function PaginationLink({
  params,
  page,
  disabled,
  label,
}: {
  params: Awaited<SalesPageProps["searchParams"]>;
  page: number;
  disabled: boolean;
  label: string;
}) {
  if (disabled) {
    return (
      <span className="inline-flex h-9 items-center rounded-md border border-zinc-200 bg-zinc-50 px-3 text-xs font-black text-zinc-400">
        {label}
      </span>
    );
  }

  const search = new URLSearchParams();
  for (const key of ["q", "from", "to", "status", "warehouse", "pending"] as const) {
    const value = params[key];
    if (value) {
      search.set(key, value);
    }
  }
  search.set("page", String(page));

  return (
    <Link
      href={`/ventas?${search.toString()}#ventas-importadas`}
      prefetch={false}
      className="inline-flex h-9 items-center rounded-md border border-zinc-200 bg-white px-3 text-xs font-black text-zinc-800 hover:bg-zinc-50"
    >
      {label}
    </Link>
  );
}

type SalesOrderRow = Awaited<ReturnType<typeof buildSalesReport>>["orders"][number];
type SalesDateRange = { from: string | null; to: string | null };

function calculateSalesTotals(orders: SalesOrderRow[]) {
  const activeOrders = orders.filter((order) => !order.isCancelled);
  const confirmedOrders = activeOrders.filter((order) => !order.isReceivedPending);

  return {
    orders: orders.length,
    confirmedOrders: confirmedOrders.length,
    pendingReceivedOrders: orders.filter((order) => order.isReceivedPending).length,
    grossAmount: orders.reduce((sum, order) => sum + order.grossAmount, 0),
    totalCharges: orders.reduce((sum, order) => sum + order.totalCharges, 0),
    productCost: orders.reduce((sum, order) => sum + order.productCost, 0),
    estimatedReceived: orders.reduce((sum, order) => sum + order.estimatedReceived, 0),
    confirmedNetProfit: confirmedOrders.reduce(
      (sum, order) => sum + order.netProfit,
      0,
    ),
  };
}

function normalizeDateRange(from?: string, to?: string): SalesDateRange {
  const normalizedFrom = normalizeDateOnly(from);
  const normalizedTo = normalizeDateOnly(to);

  if (normalizedFrom && normalizedTo && normalizedFrom > normalizedTo) {
    return { from: normalizedTo, to: normalizedFrom };
  }

  return { from: normalizedFrom, to: normalizedTo };
}

function normalizeDateOnly(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return null;
  }

  return value;
}

function isWithinDateRange(value: string, range: SalesDateRange) {
  const businessDate = toBusinessDate(value);
  if (!businessDate) {
    return true;
  }

  return (
    (!range.from || businessDate >= range.from) &&
    (!range.to || businessDate <= range.to)
  );
}

function toBusinessDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return year && month && day ? `${year}-${month}-${day}` : null;
}

function Kpi({
  label,
  value,
  detail,
  icon,
  tone = "default",
}: {
  label: string;
  value: string;
  detail?: string;
  icon: React.ReactNode;
  tone?: "default" | "red";
}) {
  const valueClass =
    tone === "red"
      ? "ct-ops-kpi-value is-danger"
      : "ct-ops-kpi-value";

  return (
    <div className={`ct-ops-kpi ${tone === "red" ? "is-danger" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="ct-ops-kpi-label min-w-0 break-words">{label}</p>
        <span className="ct-ops-icon">{icon}</span>
      </div>
      <p className={valueClass}>{value}</p>
      {detail ? (
        <p className="ct-ops-kpi-detail">
          {detail}
        </p>
      ) : null}
    </div>
  );
}

function MobileMoney({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "amber" | "red";
}) {
  return (
    <div className="ct-ops-mini-metric">
      <p className="ct-ops-mini-metric-label">
        {label}
      </p>
      <p
        className={`ct-ops-mini-metric-value ${
          tone === "amber"
            ? "is-warn"
            : tone === "red"
              ? "is-danger"
              : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
