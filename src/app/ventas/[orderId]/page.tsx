import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, BadgeDollarSign, Coins, Package, ReceiptText } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AsyncForm } from "@/components/async-form";
import { ProductThumbnail } from "@/components/product-thumbnail";
import { formatDateTimeMx } from "@/lib/format";
import { requirePermission } from "@/lib/server/auth-store";
import { buildOrderDetailReport } from "@/lib/server/reports";

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

type OrderDetailPageProps = {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{
    charge_added?: string;
    received_updated?: string;
    billing_checked?: string;
    billing_updated?: string;
    billing_pending?: string;
    repair_checked?: string;
    repair_repaired?: string;
    repair_failed?: string;
    repair_after?: string;
    manual_created?: string;
    sku_mapped?: string;
    error?: string;
  }>;
};

export default async function OrderDetailPage({
  params,
  searchParams,
}: OrderDetailPageProps) {
  const user = await requirePermission("sales.view");
  const { orderId } = await params;
  const flags = await searchParams;
  const report = await buildOrderDetailReport(decodeURIComponent(orderId));

  if (!report) {
    notFound();
  }

  const order = report.order;
  const isCancelled = order.isCancelled;
  const activeItemUnits = order.items
    .filter((item) => !item.isCancelled)
    .reduce((sum, item) => sum + item.quantity, 0);
  const cancelledItemUnits = order.items
    .filter((item) => item.isCancelled)
    .reduce((sum, item) => sum + item.quantity, 0);
  const itemUnitsLabel =
    cancelledItemUnits > 0
      ? `${number.format(activeItemUnits)} activa(s), ${number.format(cancelledItemUnits)} anulada(s)`
      : `${number.format(activeItemUnits)} pieza(s)`;
  const internalOrderLabel =
    order.internalOrderCount > 1
      ? `${number.format(order.internalOrderCount)} ordenes internas Meli agrupadas`
      : order.channel === "mercado_libre"
        ? "1 orden Meli"
        : "Venta externa";
  const isMeliOrder = order.channel === "mercado_libre";
  const receivedDisplay = isCancelled
    ? money.format(0)
    : order.isReceivedPending
    ? "Pendiente Meli"
    : money.format(order.estimatedReceived);
  const profitDisplay = isCancelled
    ? money.format(0)
    : order.isReceivedPending
    ? "Pendiente Meli"
    : money.format(order.netProfit);
  const productGrossProfitDisplay = isCancelled
    ? money.format(0)
    : money.format(order.productGrossProfit);
  const detailUrl = `/ventas/${encodeURIComponent(order.marketplaceSaleId)}`;
  const chargeOptions = [
    "marketplace_commission",
    "shipping",
    "fulfillment",
    "advertising",
    "promotion",
    "storage",
    "return_cost",
    "other",
  ];

  return (
    <AppShell
      active="ventas"
      title={`Venta ${order.marketplaceSaleId}`}
      subtitle={`${report.accountAlias} | ${order.status} | ${formatDateTimeMx(order.orderedAt)} | ${itemUnitsLabel} | ${internalOrderLabel}`}
      organization={report.organization.name}
      userEmail={user.email}
      actions={
        <>
          {isMeliOrder ? (
            <form action="/api/integrations/meli/repair-audit" method="post">
              <input type="hidden" name="orderId" value={order.externalOrderId} />
              <input
                type="hidden"
                name="back"
                value={detailUrl}
              />
              <button className="inline-flex h-10 items-center rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Recalcular venta
              </button>
            </form>
          ) : null}
          <Link
            href="/ventas/nueva"
            className="inline-flex h-10 items-center rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Nueva externa
          </Link>
          <Link
            href="/utilidad"
            className="inline-flex h-10 items-center rounded-md bg-slate-950 px-3 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Ver utilidad
          </Link>
        </>
      }
    >
      <div className="ct-ops-page">

        {flags.manual_created ? (
          <div className="ct-ops-alert is-ok text-sm font-medium">
            Venta externa registrada y descontada del inventario.
          </div>
        ) : null}
        {flags.sku_mapped ? (
          <div className="ct-ops-alert is-ok text-sm font-medium">
            SKU maestro actualizado. Se recalcularon equivalencias, inventario y utilidad.
          </div>
        ) : null}
        {flags.charge_added ? (
          <div className="ct-ops-alert is-ok text-sm font-medium">
            Cargo agregado a la venta.
          </div>
        ) : null}
        {flags.received_updated ? (
          <div className="ct-ops-alert is-ok text-sm font-medium">
            Monto recibido actualizado.
          </div>
        ) : null}
        {flags.billing_checked ? (
          <div className="ct-ops-alert is-ok text-sm font-medium">
            Dinero revisado con Meli. Actualizadas: {flags.billing_updated ?? "0"}. Pendientes:{" "}
            {flags.billing_pending ?? "0"}.
          </div>
        ) : null}
        {flags.repair_checked ? (
          <div className="ct-ops-alert is-ok text-sm font-medium">
            Venta actualizada con Meli. Revisadas: {flags.repair_checked}. Refrescadas:{" "}
            {flags.repair_repaired ?? "0"}. Fallidas: {flags.repair_failed ?? "0"}.
          </div>
        ) : null}
        {flags.error ? (
          <div className="ct-ops-alert is-danger text-sm font-medium">
            {flags.error}
          </div>
        ) : null}

        {order.marketplaceSaleId !== order.externalOrderId ||
        order.externalOrderIds.length > 1 ? (
          <section className="ct-ops-alert text-sm">
            <p className="font-semibold">
              Numero de venta Meli: {order.marketplaceSaleId}
            </p>
            <p className="ct-ops-copy">
              Ordenes internas API: {order.externalOrderIds.join(", ")}
            </p>
          </section>
        ) : null}

        {isCancelled ? (
          <section className="ct-ops-alert is-warn">
            <div className="flex gap-3">
              <AlertTriangle className="mt-1 h-5 w-5 shrink-0" />
              <div>
                <h2 className="ct-ops-title">Venta cancelada por Mercado Libre</h2>
                <p className="ct-ops-copy">
                  Meli devolvio esta orden por API, pero esta cancelada. La guardamos
                  solo para auditoria: no cuenta como venta, no genera utilidad, no
                  descuenta inventario y no permite editar recibido ni cargos manuales.
                </p>
              </div>
            </div>
          </section>
        ) : null}

        <section className="ct-ops-kpi-grid">
          <Kpi
            label={isCancelled ? "Venta bruta valida" : "Venta bruta"}
            value={money.format(order.grossAmount)}
            icon={<BadgeDollarSign size={18} />}
          />
          <Kpi
            label="Recibido Meli"
            value={receivedDisplay}
            icon={<BadgeDollarSign size={18} />}
            tone={order.isReceivedPending && !isCancelled ? "amber" : "default"}
          />
          <Kpi
            label="Cargos Meli"
            value={money.format(order.totalCharges)}
            icon={<ReceiptText size={18} />}
          />
          <Kpi
            label="Venta - producto"
            value={productGrossProfitDisplay}
            icon={<Package size={18} />}
            tone={!isCancelled && order.productGrossProfit < 0 ? "red" : "default"}
          />
          <Kpi
            label="Utilidad"
            value={profitDisplay}
            icon={<Coins size={18} />}
            tone={order.isReceivedPending && !isCancelled ? "amber" : "default"}
          />
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-5">
            <datalist id="sale-master-skus">
              {report.masterSkuOptions.map((product) => (
                <option key={product.masterSku} value={product.masterSku}>
                  {product.name}
                </option>
              ))}
            </datalist>
            <div className="ct-ops-panel">
              <div className="ct-ops-panel-header">
                <div>
                <h2 className="ct-ops-title">Items</h2>
                {isCancelled ? (
                  <p className="ct-ops-copy">
                    Referencia de lo que Meli cancelo. Estas piezas no se descuentan.
                  </p>
                ) : null}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
                    <tr>
                      <th className="px-4 py-3">SKU Meli</th>
                      <th className="px-4 py-3">Producto</th>
                      <th className="px-4 py-3">Bodega</th>
                      <th className="px-4 py-3">Venta</th>
                      <th className="px-4 py-3">Consume</th>
                      <th className="px-4 py-3">Costo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {order.summaryItems.map((item, index) => (
                      <tr
                        key={`${order.marketplaceSaleId}-${item.externalSku}-${index}`}
                        className={isCancelled || item.isCancelled ? "text-zinc-500" : undefined}
                      >
                        <td className="px-4 py-3 font-mono text-xs font-semibold">
                          {item.externalSku}
                          {item.sourceOrderIds?.length &&
                          order.internalOrderCount > 1 ? (
                            <p className="mt-1 font-sans text-[11px] font-normal text-zinc-500">
                              Ordenes API {item.sourceOrderIds.join(", ")}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex min-w-[280px] items-start gap-3">
                            <ProductThumbnail imageUrl={item.imageUrl} label={item.title} />
                            <div className="min-w-0">
                              <p className="font-semibold">{item.title}</p>
                              {item.isCancelled ? (
                                <p className="mt-1 text-xs font-semibold text-amber-700">
                                  Paquete anulado por Meli. No descuenta inventario.
                                </p>
                              ) : null}
                              {!item.isCancelled && item.cancelledQuantity > 0 ? (
                                <p className="mt-1 text-xs font-semibold text-amber-700">
                                  Incluye {number.format(item.cancelledQuantity)} pieza(s)
                                  anulada(s) por Meli. No descuentan inventario.
                                </p>
                              ) : null}
                              <p className="text-xs text-zinc-500">
                                {item.masterSku ?? "Sin mapear"}
                              </p>
                              {!isCancelled && !item.isCancelled && item.externalSku ? (
                                <form
                                  action="/api/skus/map"
                                  method="post"
                                className="ct-ops-form-card mt-3 grid gap-2 sm:grid-cols-[minmax(150px,1fr)_90px_auto]"
                                >
                                  <input
                                    type="hidden"
                                    name="currentOnlineSku"
                                    value={item.externalSku}
                                  />
                                  <input type="hidden" name="onlineSku" value={item.externalSku} />
                                  <input
                                    type="hidden"
                                    name="redirectTo"
                                    value={`${detailUrl}?sku_mapped=${encodeURIComponent(item.externalSku)}`}
                                  />
                                  <input
                                    name="masterSku"
                                    list="sale-master-skus"
                                    required
                                    defaultValue={item.masterSku ?? ""}
                                    placeholder="SKU maestro"
                                    className="h-9 min-w-0 rounded-md border border-blue-200 bg-white px-2 text-xs font-semibold outline-none focus:border-blue-700"
                                  />
                                  <input
                                    name="multiplier"
                                    type="number"
                                    min="0.0001"
                                    step="0.0001"
                                    required
                                    defaultValue={getDefaultMultiplier(item)}
                                    title="Piezas que descuenta por unidad vendida"
                                    className="h-9 rounded-md border border-blue-200 bg-white px-2 text-xs font-semibold outline-none focus:border-blue-700"
                                  />
                                  <button className="h-9 rounded-md bg-blue-700 px-3 text-xs font-black text-white hover:bg-blue-800">
                                    Guardar
                                  </button>
                                </form>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {isCancelled || item.isCancelled ? "No aplica" : item.warehouseName}
                        </td>
                        <td className="px-4 py-3">
                          {item.activeQuantity > 0 ? (
                            <p>
                              {number.format(item.activeQuantity)} x{" "}
                              {money.format(item.unitPrice)}
                            </p>
                          ) : (
                            <p>No activa</p>
                          )}
                          {item.cancelledQuantity > 0 ? (
                            <p className="mt-1 text-xs text-amber-700">
                              Anulada: {number.format(item.cancelledQuantity)} x{" "}
                              {money.format(item.unitPrice)}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          {isCancelled
                            ? "No descuenta"
                            : item.isCancelled
                            ? "No descuenta"
                            : number.format(item.consumedQuantity ?? 0)}
                        </td>
                        <td className="px-4 py-3">
                          {isCancelled || item.isCancelled ? (
                            <p className="font-semibold">No aplica</p>
                          ) : (
                            <>
                              <p className="font-semibold">
                                {money.format(item.productCost)}
                              </p>
                              <p className="text-xs text-zinc-500">
                                Unitario {money.format(item.averageUnitCost)}
                              </p>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {order.internalOrderCount > 1 ? (
              <div className="ct-ops-panel">
                <div className="ct-ops-panel-header">
                  <div>
                  <h2 className="ct-ops-title">Desglose de paquetes Meli</h2>
                  <p className="ct-ops-copy">
                    Referencia completa de las ordenes internas que forman esta venta.
                  </p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
                      <tr>
                        <th className="px-4 py-3">Orden API</th>
                        <th className="px-4 py-3">SKU Meli</th>
                        <th className="px-4 py-3">Estado</th>
                        <th className="px-4 py-3">Bodega</th>
                        <th className="px-4 py-3">Cantidad</th>
                        <th className="px-4 py-3">Venta</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {order.items.map((item, index) => (
                        <tr
                          key={`${item.sourceOrderId}-${item.externalSku}-${index}`}
                          className={item.isCancelled ? "text-zinc-500" : undefined}
                        >
                          <td className="px-4 py-3 font-mono text-xs font-semibold">
                            {item.sourceOrderId}
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-mono text-xs font-semibold">
                              {item.externalSku}
                            </p>
                            <p className="mt-1 text-xs text-zinc-500">{item.title}</p>
                          </td>
                          <td className="px-4 py-3">
                            {item.isCancelled ? (
                              <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                                Anulada
                              </span>
                            ) : (
                              <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                                Activa
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {item.isCancelled ? "No aplica" : item.warehouseName}
                          </td>
                          <td className="px-4 py-3">
                            {number.format(item.quantity)}
                          </td>
                          <td className="px-4 py-3">
                            {money.format(item.quantity * item.unitPrice)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            <div className="ct-ops-panel">
              <div className="ct-ops-panel-header">
                <h2 className="ct-ops-title">Cargos de la venta</h2>
              </div>
              <div className="divide-y divide-zinc-100">
                {isCancelled ? (
                  <p className="px-4 py-5 text-sm text-zinc-500">
                    Cancelada confirmada: no hay cargos activos para utilidad. Si Meli
                    reporta un cobro real despues, aparecera en auditoria para revisar.
                  </p>
                ) : null}
                {!isCancelled && order.charges.map((charge, index) => (
                  <div
                    key={`${charge.type}-${charge.amount}-${index}`}
                    className={`flex items-center justify-between gap-3 px-4 py-3 text-sm ${
                      charge.type === "fulfillment" ? "bg-red-50" : ""
                    }`}
                  >
                    <div>
                      <p className={charge.type === "fulfillment" ? "font-semibold text-red-700" : "font-semibold"}>
                        {chargeLabels[charge.type] ?? charge.type}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {charge.type === "fulfillment"
                          ? "Cargo extra no explicado por el envio base o creditos de Meli."
                          : charge.source}
                      </p>
                    </div>
                    <p className={charge.type === "fulfillment" ? "font-semibold text-red-700" : "font-semibold"}>
                      {money.format(charge.amount)}
                    </p>
                  </div>
                ))}
                {!isCancelled && order.charges.length === 0 ? (
                  <p className="px-4 py-5 text-sm text-zinc-500">
                    No hay cargos detectados todavia.
                  </p>
                ) : null}
              </div>
            </div>

            {order.fullCostAllocations?.length ? (
              <div className="ct-ops-panel">
                <div className="ct-ops-panel-header">
                  <div>
                  <h2 className="ct-ops-title">FIFO Full aplicado</h2>
                  <p className="ct-ops-copy">
                    Capas de Full consumidas para calcular envio a Full y almacenaje.
                  </p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
                      <tr>
                        <th className="px-4 py-3">SKU maestro</th>
                        <th className="px-4 py-3">Capa</th>
                        <th className="px-4 py-3">Cantidad</th>
                        <th className="px-4 py-3">Dias</th>
                        <th className="px-4 py-3">Envio Full</th>
                        <th className="px-4 py-3">Almacenaje</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {order.fullCostAllocations.map((allocation) => (
                        <tr key={`${allocation.layerId}-${allocation.masterSku}`}>
                          <td className="px-4 py-3 font-mono text-xs font-semibold">
                            {allocation.masterSku}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs">
                            {allocation.layerId}
                          </td>
                          <td className="px-4 py-3">
                            {number.format(allocation.quantity)}
                          </td>
                          <td className="px-4 py-3">
                            {number.format(allocation.storageDays)}
                          </td>
                          <td className="px-4 py-3">
                            {money.format(allocation.inboundFreightCost)}
                          </td>
                          <td className="px-4 py-3">
                            {money.format(allocation.storageCost)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>

          <aside className="space-y-5">
            {isCancelled ? (
              <div className="ct-action-panel p-4">
                <h2 className="font-semibold">Registro cancelado</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  No se puede actualizar recibido ni agregar cargos manuales a una venta cancelada.
                  Si quieres validarla de nuevo contra Meli, usa Recalcular venta arriba.
                </p>
              </div>
            ) : (
              <>
                {isMeliOrder ? (
                  <div className="ct-action-panel p-4">
                    <h2 className="font-semibold">Recalcular con Meli</h2>
                    <p className="mt-1 text-sm text-zinc-500">
                      Refresca esta venta desde Mercado Libre y Mercado Pago para
                      corregir cargos, recibido e impuestos.
                    </p>
                    <form
                      action="/api/integrations/meli/repair-audit"
                      method="post"
                      className="mt-4"
                    >
                      <input type="hidden" name="orderId" value={order.externalOrderId} />
                      <input
                        type="hidden"
                        name="back"
                        value={detailUrl}
                      />
                      <button className="h-10 w-full rounded-md bg-blue-700 px-3 text-sm font-semibold text-white hover:bg-blue-800">
                        Recalcular esta venta
                      </button>
                    </form>
                  </div>
                ) : null}
                <details className="ct-action-panel group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
                <div>
                  <h2 className="font-semibold">Editar recibido manual</h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Usalo solo si necesitas capturar manualmente un monto distinto.
                  </p>
                </div>
                <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600 group-open:hidden">
                  Abrir
                </span>
                <span className="hidden rounded-full bg-zinc-950 px-2 py-1 text-xs font-semibold text-white group-open:inline">
                  Cerrar
                </span>
              </summary>
              <AsyncForm
                action="/api/orders/received"
                className="space-y-3 border-t border-zinc-100 p-4"
                successMessage="Recibido actualizado"
              >
                <input type="hidden" name="externalOrderId" value={order.externalOrderId} />
                <input
                  name="netReceivedAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  defaultValue={order.receivedAmount ?? ""}
                  placeholder="Pendiente Meli"
                  className="h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
                />
                <button className="h-10 w-full rounded-md bg-zinc-950 px-3 text-sm font-semibold text-white hover:bg-zinc-800">
                  Guardar recibido
                </button>
              </AsyncForm>
            </details>

            <details className="ct-action-panel group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
                <div>
                  <h2 className="font-semibold">Agregar cargo extra</h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Publicidad, almacenamiento, devolucion u otro cobro que falte.
                  </p>
                </div>
                <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600 group-open:hidden">
                  Abrir
                </span>
                <span className="hidden rounded-full bg-zinc-950 px-2 py-1 text-xs font-semibold text-white group-open:inline">
                  Cerrar
                </span>
              </summary>
              <AsyncForm
                action="/api/orders/charge"
                className="space-y-3 border-t border-zinc-100 p-4"
                resetOnSuccess
                successMessage="Cargo agregado"
              >
                <input type="hidden" name="externalOrderId" value={order.externalOrderId} />
                <select
                  name="type"
                  defaultValue="other"
                  className="h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
                >
                  {chargeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <input
                  name="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Monto"
                  required
                  className="h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
                />
                <button className="h-10 w-full rounded-md bg-zinc-950 px-3 text-sm font-semibold text-white hover:bg-zinc-800">
                  Agregar cargo
                </button>
              </AsyncForm>
            </details>
              </>
            )}

            <div className="ct-ops-panel p-4 text-sm">
              <h2 className="ct-ops-title">Estado del calculo</h2>
              <div className="mt-3 space-y-2">
                {isCancelled ? (
                  <>
                    <StatusRow label="Impacto inventario" value="No descuenta" />
                    <StatusRow label="Impacto utilidad" value="No cuenta" />
                  </>
                ) : (
                  <>
                    <StatusRow label="Items sin mapear" value={order.unmappedItems} />
                    <StatusRow label="Items sin costo" value={order.missingCostItems} />
                  </>
                )}
                <StatusRow
                  label={isMeliOrder ? "Dinero Meli" : "Pago"}
                  value={
                    !isMeliOrder
                      ? "Confirmado"
                      : order.billingStatus === "error"
                      ? "Error / reintentar"
                      : order.isReceivedPending
                        ? "Pendiente"
                        : "Confirmado"
                  }
                />
                <StatusRow
                  label="Margen"
                  value={
                    isCancelled
                      ? "No aplica"
                      : order.isReceivedPending
                      ? "Pendiente"
                      : `${number.format(order.marginPercent)}%`
                  }
                />
              </div>
            </div>
          </aside>
        </section>
      </div>
    </AppShell>
  );
}

function Kpi({
  label,
  value,
  icon,
  tone = "default",
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: "default" | "amber" | "red";
}) {
  const valueClass =
    tone === "amber"
      ? "ct-ops-kpi-value is-warn"
      : tone === "red"
        ? "ct-ops-kpi-value is-danger"
        : "ct-ops-kpi-value";

  return (
    <div className={`ct-ops-kpi ${tone === "red" ? "is-danger" : tone === "amber" ? "is-warn" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="ct-ops-kpi-label">{label}</p>
        <span className="ct-ops-icon">{icon}</span>
      </div>
      <p className={valueClass}>{value}</p>
    </div>
  );
}

function getDefaultMultiplier(item: {
  quantity: number;
  consumedQuantity?: number | null;
}) {
  if (
    item.consumedQuantity &&
    item.quantity &&
    Number.isFinite(item.consumedQuantity) &&
    Number.isFinite(item.quantity) &&
    item.quantity > 0
  ) {
    return String(item.consumedQuantity / item.quantity);
  }

  return "1";
}

function StatusRow({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="ct-ops-mini-metric flex items-center justify-between gap-3">
      <span className="ct-ops-mini-metric-label">{label}</span>
      <span className="ct-ops-mini-metric-value">{value}</span>
    </div>
  );
}
