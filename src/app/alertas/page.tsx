export const dynamic = "force-dynamic";

import Link from "next/link";
import { Suspense } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  PackageX,
  ReceiptText,
  RefreshCw,
  X,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { formatDateTimeMx } from "@/lib/format";
import {
  type CurrentUser,
  requirePermission,
  userHasPermission,
} from "@/lib/server/auth-store";
import { buildStoreDashboard } from "@/lib/server/dashboard-store";
import { buildProfitReport, readReportStore } from "@/lib/server/reports";

const number = new Intl.NumberFormat("es-MX");
const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});

export default async function AlertsPage() {
  const user = await requirePermission("dashboard.view");
  return (
    <AppShell
      active="alertas"
      title="Alertas"
      subtitle="Pendientes operativos separados de la tabla de inventario."
      organization={user.organizationName}
      userEmail={user.email}
      actions={<AlertsActions />}
    >
      <Suspense fallback={<AlertsPageSkeleton />}>
        <AlertsContent user={user} />
      </Suspense>
    </AppShell>
  );
}

async function AlertsContent({ user }: { user: CurrentUser }) {
  const canViewInventory = userHasPermission(user, "inventory.view");
  const canViewProfit = userHasPermission(user, "profit.view");
  const profitReport = await buildProfitReport();
  const store = await readReportStore();
  const dashboard = await buildStoreDashboard({ store, profitReport });
  const dailyQueue = buildDailyQueue({
    dashboard,
    canViewInventory,
    canViewProfit,
  });
  const salesProblemQueue = canViewProfit
    ? buildSalesProblemQueue({ dashboard, profitReport })
    : [];
  const firstQueueItem = dailyQueue[0];
  const emptyQueueHref = canViewInventory ? "/inventario" : "/dashboard";
  const emptyQueueButton = canViewInventory ? "Ver inventario" : "Volver al inicio";

  const queueTone = firstQueueItem
    ? firstQueueItem.tone === "red"
      ? "is-danger"
      : "is-warn"
    : "is-ok";

  return (
    <div className="ct-ops-page">
      <section
        className={`ct-ops-alert ${queueTone}`}
      >
        <div className="grid gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.4fr)]">
          <div className="flex flex-col justify-between gap-4">
            <div>
              <div className="ct-ops-kicker flex items-center gap-2">
                <ClipboardCheck size={15} />
                Cola diaria
              </div>
              <h2 className="mt-2 text-2xl font-black text-white">
                {firstQueueItem?.title ?? "Operacion limpia"}
              </h2>
              <p className="ct-ops-copy">
                {firstQueueItem?.detail ??
                  "No hay pendientes urgentes. Puedes revisar utilidad, resurtido o comparar SKUs."}
              </p>
            </div>
            <Link
              href={firstQueueItem?.href ?? emptyQueueHref}
              className="ct-button ct-button-primary w-fit"
            >
              {firstQueueItem?.button ?? emptyQueueButton}
              <ArrowRight size={16} />
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {dailyQueue.length > 0 ? (
              dailyQueue.slice(0, 6).map((item, index) => (
                <DailyQueueCard key={item.title} item={item} index={index + 1} />
              ))
            ) : (
              <div className="ct-ops-alert is-ok text-sm font-semibold md:col-span-2">
                No hay pendientes visibles para tus permisos.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="ct-ops-kpi-grid">
        {canViewInventory ? (
          <>
            <AlertMetric label="Stock negativo" value={dashboard.kpis.negativeStock} tone="red" />
            <AlertMetric label="Stock bajo" value={dashboard.kpis.lowStock} tone="amber" />
            <AlertMetric label="SKUs sin mapear" value={dashboard.kpis.unmappedItems} tone="amber" />
            <AlertMetric label="Productos atorados" value={dashboard.stuckProducts.length} tone="amber" />
          </>
        ) : null}
        {canViewProfit ? (
          <>
            <AlertMetric label="Sin costo" value={dashboard.kpis.productsWithoutCost} tone="amber" />
            <AlertMetric label="Costos sin ligar" value={dashboard.kpis.pendingCostImports} tone="amber" />
            <AlertMetric label="Esperando billing este mes" value={dashboard.currentMonth.pendingBilling} tone="amber" />
            <AlertMetric label="Canceladas por verificar" value={dashboard.kpis.cancelledOrdersForReview} tone="amber" />
            <AlertMetric label="Cargos raros (beta)" value={dashboard.kpis.rareCharges} tone="red" />
            <AlertMetric label="Diferencias Full (beta)" value={dashboard.kpis.fullAuditAlerts} tone="red" />
            <AlertMetric label="Ventas con perdida este mes" value={dashboard.currentMonth.lossOrders} tone="red" />
          </>
        ) : null}
      </section>

      {canViewProfit ? (
      <section id="ventas-problemas" className="ct-ops-panel scroll-mt-6">
        <div className="ct-ops-panel-header grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div>
            <div className="ct-ops-kicker flex items-center gap-2">
              <ReceiptText size={16} />
              Cola unica
            </div>
            <h2 className="ct-ops-title mt-1">Ventas con problemas</h2>
            <p className="ct-ops-copy">
              Cola general historica para revisar dinero pendiente, perdidas, cargos raros,
              SKUs sin mapear, costos faltantes y cancelaciones por confirmar.
            </p>
          </div>
          <div className="ct-ops-status is-muted">
            {number.format(salesProblemQueue.length)} ventas
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3">Venta</th>
                <th className="px-4 py-3">Problema</th>
                <th className="px-4 py-3">Venta bruta</th>
                <th className="px-4 py-3">Recibido</th>
                <th className="px-4 py-3">Utilidad</th>
                <th className="px-4 py-3">Accion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {salesProblemQueue.slice(0, 80).map((row) => (
                <tr key={row.externalOrderId}>
                  <td className="px-4 py-3">
                    <Link
                      href={`/ventas/${encodeURIComponent(row.externalOrderId)}`}
                    className="font-mono text-xs font-black underline decoration-white/30 underline-offset-2 hover:decoration-white"
                    >
                      {row.externalOrderId}
                    </Link>
                    <p className="mt-1 max-w-sm truncate font-semibold text-white">
                      {row.title}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {formatDateTimeMx(row.orderedAt)}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex max-w-md flex-wrap gap-1.5">
                      {row.issues.map((issue) => (
                        <span
                          key={issue.label}
                          className={`rounded-full border px-2 py-1 text-[11px] font-black uppercase tracking-[0.08em] ${issue.className}`}
                        >
                          {issue.label}
                        </span>
                      ))}
                    </div>
                    <p className="mt-2 text-xs font-semibold text-slate-400">{row.detail}</p>
                  </td>
                  <td className="px-4 py-3 font-semibold">{money.format(row.grossAmount)}</td>
                  <td className="px-4 py-3 font-semibold">
                    {row.isReceivedPending ? (
                      <span className="text-amber-700">Pendiente Meli</span>
                    ) : (
                      money.format(row.estimatedReceived)
                    )}
                  </td>
                  <td
                    className={`px-4 py-3 font-black ${
                      row.netProfit < 0 ? "text-red-300" : "text-white"
                    }`}
                  >
                    {row.isReceivedPending ? "Pendiente" : money.format(row.netProfit)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={row.href}
                        className="ct-button ct-button-secondary h-9 px-3 text-xs"
                      >
                        Resolver
                      </Link>
                      {row.canRefresh ? (
                        <form action="/api/integrations/meli/repair-audit" method="post">
                          <input type="hidden" name="orderId" value={row.externalOrderId} />
                          <input type="hidden" name="back" value="/alertas#ventas-problemas" />
                          <button className="ct-button ct-button-secondary h-9 px-3 text-xs">
                            <RefreshCw size={14} />
                            Refrescar
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {salesProblemQueue.length === 0 ? (
                <tr>
                  <td className="ct-ops-empty" colSpan={6}>
                    No hay ventas con problemas importantes ahora.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-2">
        <AlertPanel
          title="Stock bajo"
          subtitle="Productos con stock entre 0 y 10 piezas."
          empty="No hay productos con stock bajo."
          icon={<PackageX size={18} />}
        >
          {dashboard.lowStock.map((product) => (
            <Link
              key={product.masterSku}
              href={`/inventario?q=${encodeURIComponent(product.masterSku)}`}
              className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-zinc-50"
            >
              <div>
                <p className="font-mono text-xs font-semibold">{product.masterSku}</p>
                <p className="text-zinc-600">{product.name}</p>
              </div>
              <p className="font-semibold">{number.format(product.currentStock)}</p>
            </Link>
          ))}
          {dashboard.lowStock.length === 0 ? <Empty text="No hay productos con stock bajo." /> : null}
        </AlertPanel>

        <AlertPanel
          title="Stock negativo"
          subtitle="Debe corregirse porque afecta utilidad e inventario vendible."
          empty="No hay stock negativo."
          icon={<AlertTriangle size={18} />}
        >
          {dashboard.negativeStock.slice(0, 20).map((product) => (
            <Link
              key={product.masterSku}
              href={`/inventario?q=${encodeURIComponent(product.masterSku)}&stock=negative`}
              className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-zinc-50"
            >
              <div>
                <p className="font-mono text-xs font-semibold">{product.masterSku}</p>
                <p className="text-zinc-600">{product.name}</p>
              </div>
              <p className="font-semibold text-red-700">
                {number.format(product.currentStock)}
              </p>
            </Link>
          ))}
          {dashboard.negativeStock.length === 0 ? <Empty text="No hay stock negativo." /> : null}
        </AlertPanel>

        <AlertPanel
          title="SKUs Meli sin mapear"
          subtitle="Ventas que todavia no saben de que SKU maestro descontar."
          empty="No hay SKUs de ventas sin mapear."
          icon={<AlertTriangle size={18} />}
        >
          {dashboard.unmappedItems.map((item) => (
            <Link
              key={`${item.orderId}-${item.externalSku}`}
              href="/setup#mapear"
              className="block px-4 py-3 text-sm hover:bg-zinc-50"
            >
              <p className="font-mono text-xs font-semibold">{item.externalSku}</p>
              <p className="text-zinc-600">{item.title}</p>
              <p className="mt-1 font-mono text-xs text-zinc-500">{item.orderId}</p>
            </Link>
          ))}
          {dashboard.unmappedItems.length === 0 ? <Empty text="No hay SKUs de ventas sin mapear." /> : null}
        </AlertPanel>

        <AlertPanel
          title="Costos incompletos"
          subtitle="Productos sin costo y costos del Excel pendientes de ligar."
          empty="Costos completos."
          icon={<CircleDollarSign size={18} />}
        >
          <Link
            href="/inventario?stock=no_cost"
            className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-zinc-50"
          >
            <span>Productos sin costo</span>
            <span className="font-semibold">{number.format(dashboard.kpis.productsWithoutCost)}</span>
          </Link>
          <Link
            href="/setup#costos-sin-ligar"
            className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-zinc-50"
          >
            <span>Costos sin ligar</span>
            <span className="font-semibold">{number.format(dashboard.kpis.pendingCostImports)}</span>
          </Link>
        </AlertPanel>

        <AlertPanel
          title="Ventas esperando billing"
          subtitle="Normalmente es Meli entregando tarde el neto real; revisa si se queda viejo."
          empty="No hay ventas esperando billing."
          icon={<ReceiptText size={18} />}
        >
          <Link
            href="/ventas?pending=billing"
            className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-zinc-50"
          >
            <span>Ventas pendientes de recibido real</span>
            <span className="font-semibold">{number.format(dashboard.kpis.pendingBilling)}</span>
          </Link>
        </AlertPanel>

        <AlertPanel
          title="Canceladas por verificar"
          subtitle="No entran como perdida. Se revisan contra billing Meli para confirmar que no hubo cobro real."
          empty="No hay canceladas pendientes de verificar."
          icon={<ReceiptText size={18} />}
        >
          {dashboard.cancelledOrdersForReview.map((order) => (
            <Link
              key={order.externalOrderId}
              href={`/ventas/${encodeURIComponent(order.externalOrderId)}`}
              className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-zinc-50"
            >
              <div>
                <p className="font-mono text-xs font-semibold">{order.externalOrderId}</p>
                <p className="text-zinc-600">
                  {order.billingStatus === "confirmed"
                    ? "Billing confirmado con dato raro"
                    : "Falta confirmar billing"}
                </p>
              </div>
              <p className="font-semibold text-amber-700">
                {money.format(
                  order.charges.reduce((sum, charge) => sum + charge.amount, 0),
                )}
              </p>
            </Link>
          ))}
          {dashboard.cancelledOrdersForReview.length === 0 ? (
            <Empty text="No hay canceladas pendientes de verificar." />
          ) : null}
        </AlertPanel>

        <AlertPanel
          title="Productos atorados"
          subtitle="Stock con valor que no tiene ventas Meli detectadas."
          empty="No hay productos atorados."
          icon={<PackageX size={18} />}
        >
          {dashboard.stuckProducts.map((product) => (
            <Link
              key={product.masterSku}
              href={`/inventario/${encodeURIComponent(product.masterSku)}`}
              className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-zinc-50"
            >
              <div>
                <p className="font-mono text-xs font-semibold">{product.masterSku}</p>
                <p className="text-zinc-600">{product.name}</p>
              </div>
              <p className="font-semibold">{number.format(product.currentStock)}</p>
            </Link>
          ))}
          {dashboard.stuckProducts.length === 0 ? <Empty text="No hay productos atorados." /> : null}
        </AlertPanel>

        <AlertPanel
          title="Cargos raros (beta) para reclamar"
          subtitle="Cobros no explicados por billing, envio o Mercado Pago. Validalos contra Meli antes de reclamar."
          empty="No hay cargos raros activos."
          icon={<AlertTriangle size={18} />}
          id="cargos-raros"
        >
          {dashboard.rareChargeAlerts.map((alert) => (
            <div
              key={alert.id}
              className="grid gap-3 px-4 py-3 text-sm hover:bg-zinc-50 md:grid-cols-[minmax(0,1fr)_auto]"
            >
              <Link href={`/ventas/${encodeURIComponent(alert.externalOrderId)}`} className="min-w-0">
                <p className="font-mono text-xs font-semibold">{alert.externalOrderId}</p>
                <p className="truncate font-semibold text-zinc-900">{alert.title}</p>
                <p className="text-xs text-zinc-500">
                  {alert.externalSku} | {formatDateTimeMx(alert.orderedAt)}
                </p>
                <p className="mt-1 text-xs text-red-700">
                  Extra detectado: {alert.source.replaceAll("_", " ")}
                </p>
              </Link>
              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                <div className="mr-1 text-right">
                  <p className="font-semibold text-red-700">{money.format(alert.amount)}</p>
                  <p className="text-xs text-zinc-500">
                    Utilidad {money.format(alert.netProfit)}
                  </p>
                </div>
                <form action="/api/integrations/meli/repair-audit" method="post">
                  <input type="hidden" name="orderId" value={alert.externalOrderId} />
                  <input type="hidden" name="back" value="/alertas" />
                  <ConfirmSubmitButton
                    className="inline-flex h-9 items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                    confirmTitle="Refrescar venta"
                    confirmMessage="Se consultara esta venta contra Meli/Mercado Pago para actualizar cargos y dinero. Continua?"
                    title="Refrescar con Meli y Mercado Pago"
                  >
                    <RefreshCw size={14} />
                    Refrescar
                  </ConfirmSubmitButton>
                </form>
                <form action="/api/alerts/rare-charge/dismiss" method="post">
                  <input type="hidden" name="alertId" value={alert.id} />
                  <input type="hidden" name="orderId" value={alert.externalOrderId} />
                  <input type="hidden" name="back" value="/alertas" />
                  <ConfirmSubmitButton
                    className="inline-flex h-9 items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                    confirmTitle="Descartar cargo raro"
                    confirmMessage="Este cargo raro se ocultara de la cola. No borra la venta ni sus cargos."
                    title="Ocultar este cargo raro"
                  >
                    <X size={14} />
                    Descartar
                  </ConfirmSubmitButton>
                </form>
              </div>
            </div>
          ))}
          {dashboard.rareChargeAlerts.length === 0 ? (
            <Empty text="No hay cargos raros activos." />
          ) : null}
        </AlertPanel>

        <AlertPanel
          title="Diferencias Full (beta) para reclamar"
          subtitle={
            dashboard.fullAuditedAt
              ? `Ultima auditoria: ${formatDateTimeMx(dashboard.fullAuditedAt)}`
              : "Audita Full para comparar Control Total contra stock real de Meli. Validalo con captura de Meli."
          }
          empty="No hay diferencias Full activas."
          icon={<PackageX size={18} />}
          id="diferencias-full"
        >
          {dashboard.fullAuditAlerts.map((alert) => (
            <div
              key={alert.id}
              className="grid gap-3 px-4 py-3 text-sm hover:bg-zinc-50 md:grid-cols-[minmax(0,1fr)_auto]"
            >
              <Link href={`/inventario/${encodeURIComponent(alert.masterSku)}`} className="min-w-0">
                <p className="font-mono text-xs font-semibold">{alert.masterSku}</p>
                <p className="truncate font-semibold text-zinc-900">{alert.productName}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  Esperado {number.format(alert.expectedUnits)} | Meli total{" "}
                  {number.format(alert.meliTotalUnits)} | Disponible{" "}
                  {number.format(alert.availableUnits)}
                </p>
                <p className="mt-1 text-xs text-red-700">
                  {alert.missingUnits > 0
                    ? `Faltan ${number.format(alert.missingUnits)} pieza(s). `
                    : ""}
                  {alert.notAvailableUnits > 0
                    ? `No disponibles ${number.format(alert.notAvailableUnits)} pieza(s). `
                    : ""}
                  {alert.surplusUnits > 0
                    ? `Meli trae ${number.format(alert.surplusUnits)} pieza(s) extra. `
                    : ""}
                  {alert.detailText ? `Detalle: ${alert.detailText}` : ""}
                </p>
                <p className="mt-1 text-[11px] text-zinc-400">
                  Full IDs: {alert.inventoryIds.slice(0, 3).join(", ")}
                </p>
              </Link>
              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                <form action="/api/alerts/full-audit/dismiss" method="post">
                  <input type="hidden" name="alertId" value={alert.id} />
                  <input type="hidden" name="masterSku" value={alert.masterSku} />
                  <input type="hidden" name="back" value="/alertas" />
                  <ConfirmSubmitButton
                    className="inline-flex h-9 items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                    confirmTitle="Descartar diferencia Full"
                    confirmMessage="Esta diferencia Full se ocultara de la cola. No cambia inventario ni datos de Meli."
                    title="Ocultar esta diferencia Full"
                  >
                    <X size={14} />
                    Descartar
                  </ConfirmSubmitButton>
                </form>
              </div>
            </div>
          ))}
          {dashboard.fullAuditAlerts.length === 0 ? (
            <Empty text="No hay diferencias Full activas." />
          ) : null}
        </AlertPanel>

        <AlertPanel
          title="Ventas con perdida este mes"
          subtitle="Ventas cerradas del mes actual donde utilidad neta ya dio negativa."
          empty="No hay ventas con perdida este mes."
          icon={<AlertTriangle size={18} />}
        >
          {dashboard.currentMonthLossOrders.map((order) => (
            <Link
              key={order.externalOrderId}
              href={`/ventas/${encodeURIComponent(order.externalOrderId)}`}
              className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-zinc-50"
            >
              <div>
                <p className="font-mono text-xs font-semibold">{order.externalOrderId}</p>
                <p className="text-zinc-600">{order.status}</p>
              </div>
              <p className="font-semibold text-red-700">
                {money.format(order.netProfit ?? 0)}
              </p>
            </Link>
          ))}
          {dashboard.currentMonthLossOrders.length === 0 ? <Empty text="No hay ventas con perdida este mes." /> : null}
        </AlertPanel>
      </section>
    </div>
  );
}

function AlertsActions() {
  return (
    <>
      <Link
        href="/setup"
        className="ct-button ct-button-secondary"
      >
        Resolver pendientes
      </Link>
      <Link
        href="/inventario"
        className="ct-button ct-button-primary"
      >
        Ver inventario
      </Link>
      <Link
        href="/api/export/alertas"
        className="ct-button ct-button-secondary"
      >
        Exportar alertas
      </Link>
    </>
  );
}

function AlertsPageSkeleton() {
  return (
    <div className="ct-ops-page">
      <section className="ct-ops-alert h-56 animate-pulse" />
      <section className="ct-ops-kpi-grid">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((item) => (
          <div key={item} className="ct-ops-kpi h-24 animate-pulse" />
        ))}
      </section>
      <section className="ct-ops-panel h-80 animate-pulse" />
    </div>
  );
}

function buildDailyQueue({
  dashboard,
  canViewInventory,
  canViewProfit,
}: {
  dashboard: Awaited<ReturnType<typeof buildStoreDashboard>>;
  canViewInventory: boolean;
  canViewProfit: boolean;
}) {
  const costsPending = dashboard.kpis.productsWithoutCost + dashboard.kpis.pendingCostImports;
  const unmappedPending = dashboard.kpis.unmappedItems + dashboard.kpis.fullUnmappedItems;

  return [
    canViewInventory
      ? {
      title: "Corrige stock negativo",
      detail: "Afecta inventario, utilidad y decisiones de resurtido.",
      href: "/inventario?stock=negative",
      button: "Corregir stock",
      value: dashboard.kpis.negativeStock,
      icon: <AlertTriangle size={17} />,
      tone: "red",
      priority: 1,
        }
      : null,
    canViewProfit
      ? {
      title: "Valida cargos raros (beta)",
      detail: "Puede ser dinero que Meli cobro o desconto sin explicarlo claro; compara contra Meli antes de reclamar.",
      href: "#cargos-raros",
      button: "Ver cargos",
      value: dashboard.kpis.rareCharges,
      icon: <ReceiptText size={17} />,
      tone: "red",
      priority: 2,
        }
      : null,
    canViewProfit
      ? {
      title: "Audita diferencias Full (beta)",
      detail: "Detecta piezas faltantes, no disponibles o extras contra Meli Full; confirma con evidencia antes de cerrar el caso.",
      href: "#diferencias-full",
      button: "Ver diferencias",
      value: dashboard.kpis.fullAuditAlerts,
      icon: <PackageX size={17} />,
      tone: "red",
      priority: 3,
        }
      : null,
    canViewInventory
      ? {
      title: "Mapea SKUs",
      detail: "Las ventas sin mapeo no saben que producto descontar.",
      href: "/setup#mapear",
      button: "Mapear",
      value: unmappedPending,
      icon: <PackageX size={17} />,
      tone: "amber",
      priority: 4,
        }
      : null,
    canViewProfit
      ? {
      title: "Completa costos",
      detail: "Sin costo no hay utilidad confiable.",
      href: "/setup#costos-sin-ligar",
      button: "Completar",
      value: costsPending,
      icon: <CircleDollarSign size={17} />,
      tone: "amber",
      priority: 5,
        }
      : null,
    canViewProfit
      ? {
      title: "Revisa ventas con perdida",
      detail: "Entra a entender si fue costo, envio, comision o cargo extra.",
      href: "#ventas-problemas",
      button: "Analizar perdida",
      value: dashboard.currentMonth.lossOrders,
      icon: <AlertTriangle size={17} />,
      tone: "red",
      priority: 6,
        }
      : null,
    canViewProfit
      ? {
      title: "Actualiza billing Meli",
      detail: "Ventas que siguen esperando el dinero real recibido.",
      href: "/ventas?pending=billing",
      button: "Ver ventas",
      value: dashboard.kpis.pendingBilling,
      icon: <ReceiptText size={17} />,
      tone: "amber",
      priority: 7,
        }
      : null,
    canViewInventory
      ? {
      title: "Prepara resurtido",
      detail: "Productos con stock bajo que conviene revisar antes de vender de mas.",
      href: "/resurtido",
      button: "Ver resurtido",
      value: dashboard.kpis.lowStock,
      icon: <PackageX size={17} />,
      tone: "amber",
      priority: 8,
        }
      : null,
  ]
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .filter((item) => item.value > 0)
    .sort((a, b) => a.priority - b.priority);
}

function buildSalesProblemQueue({
  dashboard,
  profitReport,
}: {
  dashboard: Awaited<ReturnType<typeof buildStoreDashboard>>;
  profitReport: Awaited<ReturnType<typeof buildProfitReport>>;
}) {
  const rows = new Map<
    string,
    {
      externalOrderId: string;
      orderedAt: string;
      title: string;
      grossAmount: number;
      estimatedReceived: number;
      netProfit: number;
      isReceivedPending: boolean;
      href: string;
      detail: string;
      priority: number;
      canRefresh: boolean;
      issues: Array<{
        label: string;
        className: string;
      }>;
    }
  >();

  function ensureRow(order: {
    externalOrderId: string;
    orderedAt: string;
    grossAmount: number;
    estimatedReceived?: number;
    netProfit?: number;
    isReceivedPending?: boolean;
    items?: Array<{ title: string }>;
  }) {
    const existing = rows.get(order.externalOrderId);
    if (existing) {
      return existing;
    }

    const row = {
      externalOrderId: order.externalOrderId,
      orderedAt: order.orderedAt,
      title: order.items?.[0]?.title ?? "Venta Mercado Libre",
      grossAmount: order.grossAmount,
      estimatedReceived: order.estimatedReceived ?? 0,
      netProfit: order.netProfit ?? 0,
      isReceivedPending: order.isReceivedPending ?? false,
      href: `/ventas/${encodeURIComponent(order.externalOrderId)}`,
      detail: "Entra al detalle para ver desglose y corregir.",
      priority: 99,
      canRefresh: true,
      issues: [],
    };
    rows.set(order.externalOrderId, row);
    return row;
  }

  function addIssue(
    row: ReturnType<typeof ensureRow>,
    issue: {
      label: string;
      className: string;
      priority: number;
      detail: string;
      href?: string;
      canRefresh?: boolean;
    },
  ) {
    if (!row.issues.some((entry) => entry.label === issue.label)) {
      row.issues.push({ label: issue.label, className: issue.className });
    }
    row.priority = Math.min(row.priority, issue.priority);
    if (issue.priority <= row.priority) {
      row.detail = issue.detail;
      row.href = issue.href ?? row.href;
      row.canRefresh = issue.canRefresh ?? row.canRefresh;
    }
  }

  for (const order of profitReport.pendingBillingOrders) {
    addIssue(ensureRow(order), {
      label: "Pendiente Meli",
      className: "border-amber-200 bg-amber-50 text-amber-800",
      priority: 4,
      detail: "Meli todavia no tiene dinero recibido confirmado para esta venta.",
    });
  }

  for (const order of profitReport.settledOrders) {
    if (order.isCancelled) {
      continue;
    }
    const row = ensureRow(order);

    if (order.netProfit < -0.004) {
      addIssue(row, {
        label: "Perdida",
        className: "border-red-200 bg-red-50 text-red-800",
        priority: 2,
        detail: "La venta cerro en rojo; revisa costo, envio, impuestos o cargos extra.",
        href: `/ventas/${encodeURIComponent(order.externalOrderId)}`,
      });
    }
    if (order.unmappedItems > 0) {
      addIssue(row, {
        label: "SKU sin mapear",
        className: "border-amber-200 bg-amber-50 text-amber-800",
        priority: 5,
        detail: "Hay items sin SKU maestro; no se puede descontar inventario correctamente.",
        href: "/setup#mapear",
        canRefresh: false,
      });
    }
    if (order.missingCostItems > 0) {
      addIssue(row, {
        label: "Costo faltante",
        className: "border-amber-200 bg-amber-50 text-amber-800",
        priority: 6,
        detail: "Hay producto sin costo promedio; la utilidad no es confiable.",
        href: "/inventario?stock=no_cost",
        canRefresh: false,
      });
    }
  }

  for (const alert of dashboard.rareChargeAlerts) {
    const order = profitReport.orders.find(
      (entry) => entry.externalOrderId === alert.externalOrderId,
    );
    const row = ensureRow(
      order ?? {
        externalOrderId: alert.externalOrderId,
        orderedAt: alert.orderedAt,
        grossAmount: alert.grossAmount,
        estimatedReceived: alert.netReceivedAmount ?? 0,
        netProfit: alert.netProfit,
        isReceivedPending: alert.netReceivedAmount === null,
        items: [{ title: alert.title }],
      },
    );
    addIssue(row, {
      label: "Cargo raro",
      className: "border-red-200 bg-red-50 text-red-800",
      priority: 1,
      detail: `Cargo extra detectado: ${alert.source.replaceAll("_", " ")}.`,
      href: "#cargos-raros",
    });
  }

  for (const order of dashboard.cancelledOrdersForReview) {
    addIssue(ensureRow(order), {
      label: "Cancelada",
      className: "border-amber-200 bg-amber-50 text-amber-800",
      priority: 3,
      detail: "Venta cancelada que necesita confirmar si Meli cobro o devolvio correctamente.",
    });
  }

  return [...rows.values()]
    .filter((row) => row.issues.length > 0)
    .sort(
      (a, b) =>
        a.priority - b.priority ||
        new Date(b.orderedAt).getTime() - new Date(a.orderedAt).getTime(),
    );
}

function DailyQueueCard({
  item,
  index,
}: {
  item: ReturnType<typeof buildDailyQueue>[number];
  index: number;
}) {
  const styles =
    item.tone === "red"
      ? "is-danger"
      : "is-warn";

  return (
    <Link href={item.href} className={`ct-ops-kpi ${styles}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="ct-ops-icon h-8 w-8 text-xs font-black">
            {index}
          </span>
          <span className={item.tone === "red" ? "text-red-200" : "text-amber-200"}>
            {item.icon}
          </span>
        </div>
        <p className="ct-ops-kpi-value mt-0">{number.format(item.value)}</p>
      </div>
      <h3 className="ct-ops-title mt-3">{item.title}</h3>
      <p className="ct-ops-copy">{item.detail}</p>
      <p className="ct-ops-kicker mt-3 inline-flex items-center gap-1">
        {item.button}
        <ArrowRight size={14} />
      </p>
    </Link>
  );
}

function AlertMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "red" | "amber";
}) {
  const hasIssue = value > 0;
  const classes = hasIssue
    ? tone === "red"
      ? "is-danger"
      : "is-warn"
    : "is-ok";

  return (
    <div className={`ct-ops-kpi ${classes}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="ct-ops-kpi-label">{label}</p>
        {hasIssue ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
      </div>
      <p className="ct-ops-kpi-value">{number.format(value)}</p>
    </div>
  );
}

function AlertPanel({
  title,
  subtitle,
  icon,
  children,
  id,
}: {
  title: string;
  subtitle: string;
  empty: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="ct-ops-panel scroll-mt-6">
      <div className="ct-ops-panel-header justify-start">
        <span className="ct-ops-icon">{icon}</span>
        <div>
          <h2 className="ct-ops-title">{title}</h2>
          <p className="ct-ops-copy">{subtitle}</p>
        </div>
      </div>
      <div className="divide-y divide-zinc-100">{children}</div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="ct-ops-empty">{text}</p>;
}
