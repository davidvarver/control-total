export const dynamic = "force-dynamic";

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { AsyncForm } from "@/components/async-form";
import {
  calculateExpenseAmountForMonth,
  EXPENSE_FREQUENCY_OPTIONS,
  getExpenseFrequencyLabel,
} from "@/lib/domain/expenses";
import { formatDateTimeMx } from "@/lib/format";
import { requirePermission } from "@/lib/server/auth-store";
import {
  buildMonthlyProfitHistoryFromSnapshots,
  type MonthlyProfitHistorySnapshotRow,
} from "@/lib/server/monthly-snapshots";
import { buildProfitReport } from "@/lib/server/reports";

const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});
const number = new Intl.NumberFormat("es-MX");
const businessTimeZone = "America/Mexico_City";

type ProfitPageProps = {
  searchParams: Promise<{
    month?: string;
    from?: string;
    to?: string;
    q?: string;
    result?: string;
    skuQ?: string;
    skuResult?: string;
    expense_added?: string;
    expense_updated?: string;
    expense_deleted?: string;
    repair_checked?: string;
    repair_repaired?: string;
    repair_failed?: string;
    repair_after?: string;
    compareA?: string;
    compareB?: string;
    compareC?: string;
    history?: string;
    error?: string;
  }>;
};

export default async function ProfitPage({ searchParams }: ProfitPageProps) {
  const user = await requirePermission("profit.view");
  return (
    <AppShell
      active="utilidad"
      title="Utilidad"
      subtitle="Ventas con dinero confirmado, costos y margen real. Aqui encuentras donde ganas y donde pierdes."
      organization={user.organizationName}
      userEmail={user.email}
      actions={<ProfitActions />}
    >
      <Suspense fallback={<ProfitPageSkeleton />}>
        <ProfitContent
          organizationId={user.organizationId}
          searchParams={searchParams}
        />
      </Suspense>
    </AppShell>
  );
}

async function ProfitContent({
  organizationId,
  searchParams,
}: ProfitPageProps & { organizationId: string }) {
  const params = await searchParams;
  const currentMonth = getCurrentBusinessMonth();
  const baseMonth = normalizeMonth(params.month) ?? currentMonth;
  const selectedRange = normalizeProfitDateRange({
    from: params.from,
    to: params.to,
    month: baseMonth,
  });
  const report = await buildProfitReport({
    includeProductSummary: false,
    includeProductMonthlySummary: "fullBillingOnly",
    orderDateFrom: selectedRange.from,
    orderDateTo: selectedRange.to,
    orderLimit: getProfitPageOrderLimit(),
  });
  const selectedMonth = selectedRange.from.slice(0, 7);
  const selectedPeriodLabel = formatDateRangeLabel(selectedRange);
  const selectedSettledOrders = report.settledOrders.filter(
    (order) =>
      !order.isCancelled && isWithinProfitDateRange(order.orderedAt, selectedRange),
  );
  const selectedMonthlySummary = buildProfitRangeSummary(
    report,
    selectedSettledOrders,
    selectedRange,
  );
  const skuQuery = (params.skuQ ?? "").trim().toLowerCase();
  const selectedPendingBillingOrders = report.pendingBillingOrders.filter(
    (order) => isWithinProfitDateRange(order.orderedAt, selectedRange),
  );
  const selectedProductMonthlySummary = buildProductProfitRowsForRange({
    report,
    settledOrders: selectedSettledOrders,
    range: selectedRange,
  });
  const filteredProductMonthlySummary = selectedProductMonthlySummary.filter(
    (product) => {
      const matchesQuery =
        !skuQuery ||
        product.masterSku.toLowerCase().includes(skuQuery) ||
        product.title.toLowerCase().includes(skuQuery);
      const matchesResult =
        !params.skuResult ||
        (params.skuResult === "loss" && product.finalNetProfit < 0) ||
        (params.skuResult === "profit" && product.finalNetProfit >= 0) ||
        (params.skuResult === "incomplete" && product.masterSku.startsWith("SIN_MAPEAR"));

      return matchesQuery && matchesResult;
    },
  );
  const selectedLossOrders = report.settledOrders
    .filter(
      (order) =>
        !order.isCancelled &&
        isWithinProfitDateRange(order.orderedAt, selectedRange) &&
        order.netProfit < 0,
    )
    .sort((a, b) => a.netProfit - b.netProfit);
  const comparedSkus = [
    params.compareA,
    params.compareB,
    params.compareC,
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index);
  const skuComparison = buildSkuComparison(
    comparedSkus,
    report,
    selectedRange,
    selectedProductMonthlySummary,
  );
  return (
    <div className="ct-ops-page">

        {params.expense_added ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            Gasto guardado. La utilidad mensual ya se recalculo.
          </div>
        ) : null}
        {params.expense_deleted ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            Gasto eliminado. La utilidad mensual ya se recalculo.
          </div>
        ) : null}
        {params.expense_updated ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            Gasto actualizado. La utilidad mensual ya se recalculo segun el alcance elegido.
          </div>
        ) : null}
        {params.repair_checked ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            Ventas recalculadas con Meli: revisadas {params.repair_checked},
            actualizadas {params.repair_repaired ?? "0"}, fallidas{" "}
            {params.repair_failed ?? "0"}.
          </div>
        ) : null}
        {params.error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {params.error}
          </div>
        ) : null}

        <section className="ct-ops-hero">
          <div>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="ct-ops-kicker">
                  Periodo
                </p>
                <h2 className="ct-ops-title mt-1">
                  Utilidad de {selectedPeriodLabel}
                </h2>
                <p className="ct-ops-copy">
                  El resumen usa ventas cerradas, costos y filtros del periodo elegido.
                  Cambia fechas para revisar dias, semanas o meses sin mezclar todo el historico.
                </p>
              </div>
              <form
                action="/utilidad"
                method="get"
                className="ct-ops-filterbar w-full sm:grid-cols-[minmax(140px,1fr)_minmax(140px,1fr)_auto_auto] xl:w-auto"
              >
                <label className="grid gap-1 text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                  Desde
                  <input
                    name="from"
                    type="date"
                    defaultValue={selectedRange.from}
                    className="ct-input h-11 min-w-44 text-sm font-semibold normal-case tracking-normal text-zinc-950"
                  />
                </label>
                <label className="grid gap-1 text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                  Hasta
                  <input
                    name="to"
                    type="date"
                    defaultValue={selectedRange.to}
                    className="ct-input h-11 min-w-44 text-sm font-semibold normal-case tracking-normal text-zinc-950"
                  />
                </label>
                <button type="submit" className="ct-button ct-button-primary h-11">
                  Aplicar
                </button>
                <Link
                  href="/utilidad"
                  prefetch={false}
                  className="ct-button ct-button-secondary h-11"
                >
                  Mes actual
                </Link>
              </form>
            </div>
          </div>
        </section>

        <section className="ct-ops-panel">
          <div className="ct-ops-panel-header">
            <div>
              <p className="ct-ops-kicker">Resultado del filtro</p>
              <h2 className="ct-ops-title mt-1">Resumen financiero</h2>
              <p className="ct-ops-copy">
                Numeros del periodo elegido, separados entre utilidad final, pendientes y alertas.
              </p>
            </div>
          </div>
          <div className="ct-ops-kpi-grid ct-ops-panel-body">
            <SummaryMetric
              label="Ventas cerradas"
              value={number.format(selectedMonthlySummary.orders)}
            />
            <SummaryMetric
              label="Utilidad final"
              value={money.format(selectedMonthlySummary.finalNetProfit)}
              tone={selectedMonthlySummary.finalNetProfit < 0 ? "red" : "green"}
            />
            <SummaryMetric
              label="Margen final"
              value={`${number.format(selectedMonthlySummary.finalMargin)}%`}
              tone={selectedMonthlySummary.finalMargin < 0 ? "red" : "green"}
            />
            <SummaryMetric
              label="Ventas con perdida"
              value={number.format(selectedLossOrders.length)}
              tone={selectedLossOrders.length > 0 ? "red" : "neutral"}
            />
            <SummaryMetric
              label="Dinero por confirmar"
              value={number.format(selectedPendingBillingOrders.length)}
              tone={selectedPendingBillingOrders.length > 0 ? "amber" : "neutral"}
            />
          </div>
          <details className="border-t border-white/10 px-4 py-3">
            <summary className="cursor-pointer text-sm font-black text-zinc-700">
              Ver desglose del periodo
            </summary>
            <div className="ct-ops-kpi-grid mt-3 text-sm">
              <SummaryMetric
                label="Recibido confirmado"
                value={money.format(selectedMonthlySummary.estimatedReceived)}
              />
              <SummaryMetric
                label="Costo producto"
                value={money.format(selectedMonthlySummary.productCost)}
              />
              <SummaryMetric
                label="Costos Full por venta"
                value={money.format(selectedMonthlySummary.additionalCosts)}
              />
              <SummaryMetric
                label="Cargos Full mensual"
                value={money.format(selectedMonthlySummary.fullBillingCharges)}
                tone={selectedMonthlySummary.fullBillingCharges > 0 ? "amber" : "neutral"}
              />
              <SummaryMetric
                label="Gastos operativos"
                value={money.format(selectedMonthlySummary.operatingExpenses)}
                tone={selectedMonthlySummary.operatingExpenses > 0 ? "amber" : "neutral"}
              />
            </div>
          </details>
        </section>

        <LossOrdersSection
          orders={selectedLossOrders}
          selectedPeriodLabel={selectedPeriodLabel}
        />

        <SkuProfitSection
          products={filteredProductMonthlySummary}
          params={params}
          selectedRange={selectedRange}
          selectedPeriodLabel={selectedPeriodLabel}
        />

        <section id="comparador-skus" className="ct-ops-panel scroll-mt-24">
          <div className="ct-ops-panel-header">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)] xl:items-end">
              <div>
                <p className="ct-ops-kicker">Comparativa</p>
                <h2 className="ct-ops-title mt-1">Comparar SKUs</h2>
                <p className="ct-ops-copy">
                  El margen principal es operativo: venta ya con Meli, producto y costos directos,
                  antes de gastos generales del negocio. Tambien mostramos utilidad final SKU
                  cuando ya hay cargos Full mensuales ligados.
                </p>
              </div>
              <form
                action="/utilidad#comparador-skus"
                method="get"
                className="ct-ops-filterbar md:grid-cols-[minmax(120px,1fr)_minmax(120px,1fr)_minmax(120px,1fr)_110px]"
              >
                <input type="hidden" name="from" value={selectedRange.from} />
                <input type="hidden" name="to" value={selectedRange.to} />
                <input
                  name="compareA"
                  list="profit-master-skus"
                  defaultValue={params.compareA ?? ""}
                  placeholder="SKU 1"
                  className="ct-input h-10"
                />
                <input
                  name="compareB"
                  list="profit-master-skus"
                  defaultValue={params.compareB ?? ""}
                  placeholder="SKU 2"
                  className="ct-input h-10"
                />
                <input
                  name="compareC"
                  list="profit-master-skus"
                  defaultValue={params.compareC ?? ""}
                  placeholder="SKU 3"
                  className="ct-input h-10"
                />
                <button type="submit" className="ct-button ct-button-primary h-10">
                  Comparar
                </button>
                <datalist id="profit-master-skus">
                  {report.productOptions.map((product) => (
                    <option key={product.masterSku} value={product.masterSku}>
                      {product.name}
                    </option>
                  ))}
                </datalist>
              </form>
            </div>
          </div>
          {skuComparison.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">Ventas</th>
                    <th className="px-4 py-3">Unidades</th>
                    <th className="px-4 py-3">Venta</th>
                    <th className="px-4 py-3">Utilidad operativa</th>
                    <th className="px-4 py-3">Margen operativo</th>
                    <th className="px-4 py-3">Full mensual</th>
                    <th className="px-4 py-3">Utilidad final SKU</th>
                    <th className="px-4 py-3">Revisar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {skuComparison.map((row) => (
                    <tr key={row.masterSku}>
                      <td className="px-4 py-3">
                        <Link
                          href={`/inventario/${encodeURIComponent(row.masterSku)}`}
                          prefetch={false}
                          className="font-mono text-xs font-black underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-950"
                        >
                          {row.masterSku}
                        </Link>
                        <p className="mt-1 max-w-sm font-semibold text-zinc-900">
                          {row.title}
                        </p>
                      </td>
                      <td className="px-4 py-3">{number.format(row.orders)}</td>
                      <td className="px-4 py-3">{number.format(row.soldUnits)}</td>
                      <td className="px-4 py-3">{money.format(row.grossAmount)}</td>
                      <td
                        className={`px-4 py-3 font-black ${
                          row.contributionProfit < 0 ? "text-red-700" : "text-zinc-950"
                        }`}
                      >
                        {money.format(row.contributionProfit)}
                      </td>
                      <td
                        className={`px-4 py-3 font-black ${
                          row.contributionMargin < 0 ? "text-red-700" : "text-zinc-950"
                        }`}
                      >
                        {number.format(row.contributionMargin)}%
                      </td>
                      <td className="px-4 py-3 text-red-700">
                        -{money.format(row.fullBillingCharges)}
                      </td>
                      <td
                        className={`px-4 py-3 font-black ${
                          row.finalNetProfit < 0 ? "text-red-700" : "text-zinc-950"
                        }`}
                      >
                        {money.format(row.finalNetProfit)}
                        <p className="text-xs font-normal text-zinc-500">
                          {number.format(row.finalMargin)}%
                        </p>
                      </td>
                      <td
                        className={`px-4 py-3 font-semibold ${
                          row.problemOrders > 0 ? "text-amber-700" : "text-zinc-500"
                        }`}
                      >
                        {number.format(row.problemOrders)}
                        <p className="text-xs font-normal text-zinc-500">
                          canceladas/devoluciones/revision
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="ct-ops-empty border-t border-white/10">
              Escribe 2 o 3 SKUs para comparar venta, margen y problemas lado a lado.
            </div>
          )}
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Suspense fallback={<MonthlyProfitHistorySkeleton />}>
            <MonthlyProfitHistorySection
              organizationId={organizationId}
              selectedRange={selectedRange}
            />
          </Suspense>

          <details className="ct-action-panel group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
              <div>
                <h2 className="font-semibold">Agregar gasto del negocio</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Sueldos, renta, papeleria, software, contabilidad, comisiones externas, etc.
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
              action="/api/expenses"
              className="grid gap-3 border-t border-zinc-100 p-4"
              resetOnSuccess
              successMessage="Gasto guardado"
            >
              <label className="block text-sm font-semibold text-zinc-700">
                Mes base
                <input
                  name="month"
                  type="month"
                  defaultValue={selectedMonth}
                  required
                  className="mt-1 h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
                />
              </label>
              <label className="block text-sm font-semibold text-zinc-700">
                Cada cuanto se paga
                <select
                  name="frequency"
                  defaultValue="monthly"
                  className="mt-1 h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
                >
                  {EXPENSE_FREQUENCY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs font-normal text-zinc-500">
                  Pon el monto del periodo elegido; el sistema calcula cuanto toca a cada mes.
                </span>
              </label>
              <label className="block text-sm font-semibold text-zinc-700">
                Categoria
                <input
                  name="category"
                  list="expense-categories"
                  placeholder="Sueldos, renta, papeleria..."
                  required
                  className="mt-1 h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
                />
              </label>
              <label className="block text-sm font-semibold text-zinc-700">
                Descripcion
                <input
                  name="description"
                  placeholder="Ej. renta oficina mayo"
                  className="mt-1 h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
                />
              </label>
              <label className="block text-sm font-semibold text-zinc-700">
                Monto del periodo
                <input
                  name="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  required
                  className="mt-1 h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
                />
              </label>
              <label className="block text-sm font-semibold text-zinc-700">
                Desde cuando aplica
                <input
                  name="periodStart"
                  type="date"
                  defaultValue={`${selectedMonth}-01`}
                  className="mt-1 h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
                />
              </label>
              <label className="block text-sm font-semibold text-zinc-700">
                Termina en
                <input
                  name="activeUntil"
                  type="date"
                  className="mt-1 h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
                />
                <span className="mt-1 block text-xs font-normal text-zinc-500">
                  Opcional. Dejalo vacio si sigue activo.
                </span>
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
                <input
                  name="isRecurring"
                  type="checkbox"
                  defaultChecked
                  className="h-4 w-4 rounded border-zinc-300"
                />
                Repetir automaticamente
              </label>
              <button className="h-10 rounded-md bg-zinc-950 px-3 text-sm font-semibold text-white hover:bg-zinc-800">
                Guardar gasto
              </button>
              <datalist id="expense-categories">
                <option value="Sueldos" />
                <option value="Renta" />
                <option value="Papeleria" />
                <option value="Software" />
                <option value="Contabilidad" />
                <option value="Publicidad externa" />
                <option value="Servicios" />
                <option value="Otro" />
              </datalist>
            </AsyncForm>
          </details>
        </section>

        <details className="ct-ops-panel ct-action-panel group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="ct-ops-kicker">Gastos</p>
              <h2 className="ct-ops-title mt-1">Gastos capturados</h2>
              <p className="ct-ops-copy">
                Historial de gastos operativos usados para utilidad final mensual.
              </p>
            </div>
            <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600 group-open:hidden">
              {number.format(report.operatingExpenses.length)} gastos
            </span>
          </summary>
          <div className="overflow-x-auto border-t border-zinc-100">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-4 py-3">Inicio</th>
                  <th className="px-4 py-3">Frecuencia</th>
                  <th className="px-4 py-3">Categoria</th>
                  <th className="px-4 py-3">Descripcion</th>
                  <th className="px-4 py-3">Monto periodo</th>
                  <th className="px-4 py-3">Este mes</th>
                  <th className="px-4 py-3">Accion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {report.operatingExpenses.map((expense) => {
                  const expenseVersionKey = [
                    expense.id,
                    expense.month,
                    expense.category,
                    expense.description,
                    expense.amount,
                    expense.frequency,
                    expense.periodStart,
                    expense.activeUntil,
                    expense.isRecurring,
                  ].join("|");

                  return (
                    <tr key={expenseVersionKey}>
                      <td className="px-4 py-3 font-mono text-xs font-semibold">
                        {(expense.periodStart ?? `${expense.month}-01`).slice(0, 10)}
                      </td>
                      <td className="px-4 py-3">
                        {getExpenseFrequencyLabel(expense.frequency)}
                      </td>
                      <td className="px-4 py-3">{expense.category}</td>
                      <td className="px-4 py-3">
                        {expense.description}
                        {expense.isRecurring ? (
                          <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-600">
                            recurrente
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        {money.format(expense.amount)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-zinc-950">
                        {money.format(
                          calculateExpenseAmountForMonth(expense, selectedMonth),
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="grid gap-2">
                          <details
                            key={`edit-${expenseVersionKey}`}
                            className="group rounded-lg border border-zinc-200 bg-white"
                          >
                          <summary className="flex h-9 cursor-pointer list-none items-center justify-center rounded-lg px-3 text-xs font-black text-zinc-700 hover:bg-zinc-50">
                            Editar
                          </summary>
                          <AsyncForm
                            action="/api/expenses"
                            className="grid min-w-[min(82vw,420px)] gap-3 border-t border-zinc-100 p-3"
                            successMessage="Gasto actualizado"
                          >
                            <input type="hidden" name="action" value="update" />
                            <input type="hidden" name="expenseId" value={expense.id} />
                            <label className="block text-xs font-black uppercase tracking-[0.16em] text-zinc-500">
                              Cambiar
                              <select
                                name="scope"
                                defaultValue="from_now"
                                className="mt-1 h-10 w-full rounded-md border border-zinc-300 px-3 text-sm font-semibold normal-case tracking-normal text-zinc-950 outline-none focus:border-zinc-950"
                              >
                                <option value="from_now">De este mes en adelante</option>
                                <option value="this_month">Solo este mes</option>
                              </select>
                            </label>
                            <div className="grid gap-2 md:grid-cols-2">
                              <label className="block text-sm font-semibold text-zinc-700">
                                Mes
                                <input
                                  name="month"
                                  type="month"
                                  defaultValue={selectedMonth}
                                  required
                                  className="mt-1 h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
                                />
                              </label>
                              <label className="block text-sm font-semibold text-zinc-700">
                                Monto
                                <input
                                  name="amount"
                                  type="number"
                                  min="0.01"
                                  step="0.01"
                                  defaultValue={expense.amount}
                                  required
                                  className="mt-1 h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
                                />
                              </label>
                            </div>
                            <label className="block text-sm font-semibold text-zinc-700">
                              Frecuencia
                              <select
                                name="frequency"
                                defaultValue={expense.frequency ?? "one_time"}
                                className="mt-1 h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
                              >
                                {EXPENSE_FREQUENCY_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="block text-sm font-semibold text-zinc-700">
                              Categoria
                              <input
                                name="category"
                                defaultValue={expense.category}
                                required
                                className="mt-1 h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
                              />
                            </label>
                            <label className="block text-sm font-semibold text-zinc-700">
                              Descripcion
                              <input
                                name="description"
                                defaultValue={expense.description}
                                className="mt-1 h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
                              />
                            </label>
                            <div className="grid gap-2 md:grid-cols-2">
                              <label className="block text-sm font-semibold text-zinc-700">
                                Desde
                                <input
                                  name="periodStart"
                                  type="date"
                                  defaultValue={(expense.periodStart ?? `${selectedMonth}-01`).slice(0, 10)}
                                  className="mt-1 h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
                                />
                              </label>
                              <label className="block text-sm font-semibold text-zinc-700">
                                Termina
                                <input
                                  name="activeUntil"
                                  type="date"
                                  defaultValue={(expense.activeUntil ?? "").slice(0, 10)}
                                  className="mt-1 h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
                                />
                              </label>
                            </div>
                            <label className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
                              <input
                                name="isRecurring"
                                type="checkbox"
                                defaultChecked={expense.frequency !== "one_time" && expense.isRecurring !== false}
                                className="h-4 w-4 rounded border-zinc-300"
                              />
                              Repetir automaticamente
                            </label>
                            <button className="h-10 rounded-md bg-zinc-950 px-3 text-sm font-semibold text-white hover:bg-zinc-800">
                              Guardar cambios
                            </button>
                          </AsyncForm>
                          </details>
                          <AsyncForm
                            action="/api/expenses"
                            successMessage="Gasto eliminado"
                            confirmTitle="Eliminar gasto"
                            confirmMessage="Este gasto operativo dejara de contar en la utilidad. Esta accion no se puede deshacer desde la pantalla."
                            confirmText="ELIMINAR"
                          >
                            <input type="hidden" name="action" value="delete" />
                            <input type="hidden" name="expenseId" value={expense.id} />
                            <input type="hidden" name="month" value={selectedMonth} />
                            <button className="h-9 w-full rounded-md border border-red-200 px-2 text-xs font-semibold text-red-700 hover:bg-red-50">
                              Eliminar
                            </button>
                          </AsyncForm>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {report.operatingExpenses.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-zinc-500" colSpan={7}>
                      Aun no hay gastos operativos capturados.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </details>

        <details className="ct-ops-panel ct-action-panel group border-amber-200 bg-amber-50">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="ct-ops-kicker">Pendiente Meli</p>
              <h2 className="ct-ops-title mt-1 text-amber-950">Ventas esperando billing Meli</h2>
              <p className="ct-ops-copy text-amber-900/80">
                Ya descuentan inventario, pero aun no entran a utilidad porque Meli todavia no confirma el dinero final.
              </p>
            </div>
            <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800 group-open:hidden">
              {number.format(selectedPendingBillingOrders.length)} pendientes
            </span>
          </summary>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-amber-200 bg-amber-100/60 text-xs uppercase text-amber-900">
                <tr>
                  <th className="px-4 py-3">Orden</th>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Venta</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Items</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100 bg-white">
                {selectedPendingBillingOrders.slice(0, 50).map((order) => (
                  <tr key={order.externalOrderId} className="align-top">
                    <td className="px-4 py-3 font-mono text-xs font-semibold">
                      <Link
                        href={`/ventas/${encodeURIComponent(order.externalOrderId)}`}
                        prefetch={false}
                        className="underline decoration-amber-300 underline-offset-2"
                      >
                        {order.externalOrderId}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{formatDateTimeMx(order.orderedAt)}</td>
                    <td className="px-4 py-3 font-semibold">{money.format(order.grossAmount)}</td>
                    <td className="px-4 py-3">{order.status}</td>
                    <td className="px-4 py-3">
                      {order.items.map((item) => item.title).join(" | ")}
                    </td>
                  </tr>
                ))}
                {selectedPendingBillingOrders.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-zinc-500" colSpan={5}>
                      No hay ventas esperando billing en este periodo.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </details>
    </div>
  );
}

function ProfitActions() {
  return (
    <>
      <Link href="/inventario" prefetch={false} className="ct-button ct-button-secondary">
        Cargar costos
      </Link>
      <Link href="/api/export/utilidad" prefetch={false} className="ct-button ct-button-secondary">
        Exportar CSV
      </Link>
      <Link href="/ventas" prefetch={false} className="ct-button ct-button-primary">
        Ver ventas
      </Link>
    </>
  );
}

function ProfitPageSkeleton() {
  return (
    <div className="ct-ops-page">
      <section className="ct-ops-panel">
        <div className="ct-ops-panel-header">
          <div className="h-7 w-56 animate-pulse rounded-2xl bg-white/[0.08]" />
          <div className="mt-3 h-11 animate-pulse rounded-2xl bg-white/[0.08]" />
        </div>
        <div className="ct-ops-kpi-grid p-4">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-20 animate-pulse rounded-2xl bg-white/[0.08]" />
          ))}
        </div>
      </section>
      <section className="ct-ops-panel">
        <div className="ct-ops-panel-header">
          <div className="h-7 w-64 animate-pulse rounded-2xl bg-white/[0.08]" />
        </div>
        <div className="space-y-3 p-4">
          {[0, 1, 2, 3, 4].map((item) => (
            <div key={item} className="h-12 animate-pulse rounded-2xl bg-white/[0.08]" />
          ))}
        </div>
      </section>
    </div>
  );
}

async function MonthlyProfitHistorySection({
  organizationId,
  selectedRange,
}: {
  organizationId: string;
  selectedRange: ProfitDateRange;
}) {
  const rows = await buildMonthlyProfitHistoryFromSnapshots({
    organizationId,
  });

  return <MonthlyProfitHistoryTable rows={rows} selectedRange={selectedRange} />;
}

function MonthlyProfitHistorySkeleton() {
  return (
    <div id="historial-mensual" className="ct-ops-panel">
      <div className="ct-ops-panel-header">
        <div className="h-7 w-56 animate-pulse rounded-md bg-slate-100" />
        <div className="mt-3 h-4 w-80 max-w-full animate-pulse rounded-md bg-slate-100" />
      </div>
      <div className="space-y-3 p-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-12 animate-pulse rounded-md bg-slate-100" />
        ))}
      </div>
    </div>
  );
}

function MonthlyProfitHistoryTable({
  rows,
  selectedRange,
}: {
  rows: MonthlyProfitHistorySnapshotRow[];
  selectedRange: ProfitDateRange;
}) {
  return (
    <div id="historial-mensual" className="ct-ops-panel">
      <div className="ct-ops-panel-header">
        <div>
        <p className="ct-ops-kicker">Historial</p>
        <h2 className="ct-ops-title mt-1">Utilidad mensual final</h2>
        <p className="ct-ops-copy">
          Historial por mes para comparar si el negocio mejora o empeora.
          Los meses tocados por el rango elegido estan resaltados.
        </p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-3">Mes</th>
              <th className="px-4 py-3">Venta</th>
              <th className="px-4 py-3">Recibido</th>
              <th className="px-4 py-3">Producto</th>
              <th className="px-4 py-3">Full venta</th>
              <th className="px-4 py-3">Full mensual</th>
              <th className="px-4 py-3">Antes gastos</th>
              <th className="px-4 py-3">Gastos negocio</th>
              <th className="px-4 py-3">Utilidad final</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((month) => (
              <tr
                key={month.month}
                className={
                  monthOverlapsRange(month.month, selectedRange)
                    ? "bg-indigo-50/60"
                    : undefined
                }
              >
                <td className="px-4 py-3 font-mono text-xs font-semibold">
                  {month.month}
                  <p className="mt-1 font-sans text-xs font-normal text-zinc-500">
                    {number.format(month.orders)} ventas
                  </p>
                </td>
                <td className="px-4 py-3">{money.format(month.grossAmount)}</td>
                <td className="px-4 py-3">{money.format(month.estimatedReceived)}</td>
                <td className="px-4 py-3">{money.format(month.productCost)}</td>
                <td className="px-4 py-3">{money.format(month.additionalCosts)}</td>
                <td className="px-4 py-3 text-red-700">
                  -{money.format(month.fullBillingCharges)}
                </td>
                <td className="px-4 py-3 font-semibold">
                  {money.format(month.contributionProfit)}
                  <p className="text-xs font-normal text-zinc-500">
                    {number.format(month.contributionMargin)}%
                  </p>
                </td>
                <td className="px-4 py-3 text-red-700">
                  -{money.format(month.operatingExpenses)}
                </td>
                <td
                  className={`px-4 py-3 font-semibold ${
                    month.finalNetProfit < 0 ? "text-red-700" : "text-emerald-700"
                  }`}
                >
                  {money.format(month.finalNetProfit)}
                  <p className="text-xs font-normal text-zinc-500">
                    {number.format(month.finalMargin)}%
                  </p>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-zinc-500" colSpan={9}>
                  Todavia no hay ventas cerradas ni gastos para resumir.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "green" | "red" | "amber";
}) {
  const valueTone = {
    neutral: "",
    green: "is-ok",
    red: "is-danger",
    amber: "is-warn",
  }[tone];

  return (
    <div className={`ct-ops-kpi ${tone === "green" ? "is-ok" : tone === "red" ? "is-danger" : tone === "amber" ? "is-warn" : ""}`}>
      <p className="ct-ops-kpi-label">
        {label}
      </p>
      <p className={`ct-ops-kpi-value ${valueTone}`}>{value}</p>
    </div>
  );
}

type ProfitReport = Awaited<ReturnType<typeof buildProfitReport>>;
type MonthlySummaryRow = ProfitReport["monthlySummary"][number];
type ProductMonthlySummaryRow = ProfitReport["productMonthlySummary"][number];
type SettledOrderRow = ProfitReport["settledOrders"][number];
type ProfitDateRange = { from: string; to: string };

function LossOrdersSection({
  orders,
  selectedPeriodLabel,
}: {
  orders: SettledOrderRow[];
  selectedPeriodLabel: string;
}) {
  return (
    <section id="ventas-con-perdida" className="ct-ops-panel scroll-mt-24">
      <div className="ct-ops-panel-header">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="ct-ops-kicker">Riesgo de margen</p>
            <h2 className="ct-ops-title mt-1">Ventas con perdida</h2>
            <p className="ct-ops-copy">
              Ventas individuales de {selectedPeriodLabel} donde la utilidad salio negativa.
              Entra a una venta para ver cargos, recibido, costo y recalcular con Meli.
            </p>
          </div>
          <Link href="/ventas" prefetch={false} className="ct-button ct-button-secondary">
            Ver todas las ventas
          </Link>
        </div>
      </div>
      <div className="ct-ops-mobile-list md:hidden">
        {orders.slice(0, 25).map((order) => {
          const isIncomplete = order.missingCostItems > 0 || order.unmappedItems > 0;

          return (
            <Link
              key={order.externalOrderId}
              href={`/ventas/${encodeURIComponent(order.externalOrderId)}`}
              prefetch={false}
              className="ct-ops-mobile-card"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs font-black">
                    {order.externalOrderId}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {formatDateTimeMx(order.orderedAt)}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-md px-2 py-1 text-xs font-semibold ${
                    isIncomplete
                      ? "bg-amber-50 text-amber-700"
                      : "bg-red-50 text-red-700"
                  }`}
                >
                  {isIncomplete ? "Incompleta" : "Perdida"}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <ProfitMobileMetric label="Venta" value={money.format(order.grossAmount)} />
                <ProfitMobileMetric
                  label="Costos"
                  value={money.format(order.totalCharges + order.additionalCosts + order.productCost)}
                />
                <ProfitMobileMetric
                  label="Perdida"
                  value={money.format(order.netProfit)}
                  tone="red"
                />
              </div>
            </Link>
          );
        })}
        {orders.length === 0 ? (
          <p className="ct-ops-empty">
            No hay ventas individuales con perdida en este periodo.
          </p>
        ) : null}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-3">Orden / Fecha</th>
              <th className="px-4 py-3">Venta</th>
              <th className="px-4 py-3">Recibido</th>
              <th className="px-4 py-3">Costos</th>
              <th className="px-4 py-3">Perdida</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {orders.slice(0, 25).map((order) => {
              const isIncomplete =
                order.missingCostItems > 0 || order.unmappedItems > 0;

              return (
                <tr key={order.externalOrderId}>
                  <td className="px-4 py-3 font-mono text-xs font-semibold">
                    <Link
                      href={`/ventas/${encodeURIComponent(order.externalOrderId)}`}
                      prefetch={false}
                      className="underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-950"
                    >
                      {order.externalOrderId}
                    </Link>
                    <p className="mt-1 font-sans text-xs font-normal text-zinc-500">
                      {formatDateTimeMx(order.orderedAt)}
                    </p>
                  </td>
                  <td className="px-4 py-3 font-semibold">
                    {money.format(order.grossAmount)}
                  </td>
                  <td className="px-4 py-3 font-semibold">
                    {money.format(order.estimatedReceived)}
                  </td>
                  <td className="px-4 py-3">
                    <details>
                      <summary className="cursor-pointer list-none font-semibold text-zinc-950">
                        {money.format(
                          order.totalCharges +
                            order.additionalCosts +
                            order.productCost,
                        )}
                      </summary>
                      <div className="mt-2 w-56 rounded-md border border-zinc-200 bg-zinc-50 p-2 text-xs text-zinc-600">
                        <p>Cargos Meli: {money.format(order.totalCharges)}</p>
                        <p>Full: {money.format(order.additionalCosts)}</p>
                        <p>Producto: {money.format(order.productCost)}</p>
                      </div>
                    </details>
                  </td>
                  <td className="px-4 py-3 font-black text-red-700">
                    {money.format(order.netProfit)}
                    <p className="mt-1 text-xs font-normal text-red-600">
                      Margen {number.format(order.marginPercent)}%
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {isIncomplete ? (
                      <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                        Incompleta
                      </span>
                    ) : (
                      <span className="rounded-md bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
                        Perdida
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {orders.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-zinc-500" colSpan={6}>
                  No hay ventas individuales con perdida en este periodo. Si la utilidad final
                  sale negativa, viene de gastos operativos, cargos Full mensuales
                  o costos generales, no de una venta especifica.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {orders.length > 25 ? (
        <div className="border-t border-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-500">
          Mostrando las 25 perdidas mas grandes de {number.format(orders.length)} ventas con perdida.
        </div>
      ) : null}
    </section>
  );
}

function SkuProfitSection({
  products,
  params,
  selectedRange,
  selectedPeriodLabel,
}: {
  products: ProductMonthlySummaryRow[];
  params: { skuQ?: string; skuResult?: string };
  selectedRange: ProfitDateRange;
  selectedPeriodLabel: string;
}) {
  const baseSkuParams = new URLSearchParams({
    from: selectedRange.from,
    to: selectedRange.to,
  });
  const allSkusHref = `/utilidad?${baseSkuParams.toString()}#utilidad-por-sku`;
  const lossSkuParams = new URLSearchParams(baseSkuParams);
  lossSkuParams.set("skuResult", "loss");
  const incompleteSkuParams = new URLSearchParams(baseSkuParams);
  incompleteSkuParams.set("skuResult", "incomplete");

  return (
    <section id="utilidad-por-sku" className="ct-ops-panel scroll-mt-24">
      <div className="ct-ops-panel-header">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(520px,0.95fr)] xl:items-end">
          <div>
            <p className="ct-ops-kicker">Producto y margen</p>
            <h2 className="ct-ops-title mt-1">Utilidad por SKU</h2>
            <p className="ct-ops-copy">
              Productos vendidos en {selectedPeriodLabel}. Aqui filtras SKUs con perdida,
              ganancia o pendientes de mapeo.
            </p>
          </div>
          <form
            action="/utilidad#utilidad-por-sku"
            method="get"
            className="ct-ops-filterbar md:grid-cols-[minmax(220px,1fr)_170px_110px]"
          >
            <input type="hidden" name="from" value={selectedRange.from} />
            <input type="hidden" name="to" value={selectedRange.to} />
            <input
              name="skuQ"
              defaultValue={params.skuQ ?? ""}
              placeholder="Buscar SKU o producto"
              className="ct-input h-11"
            />
            <select
              name="skuResult"
              defaultValue={params.skuResult ?? ""}
              className="ct-input h-11"
            >
              <option value="">Todo</option>
              <option value="loss">Perdidas</option>
              <option value="profit">Ganancia</option>
              <option value="incomplete">Sin mapear</option>
            </select>
            <button type="submit" className="ct-button ct-button-primary h-11">
              Filtrar
            </button>
          </form>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={allSkusHref}
            prefetch={false}
            className={`ct-button h-9 ${!params.skuResult ? "ct-button-primary" : "ct-button-secondary"}`}
          >
            Todos
          </Link>
          <Link
            href={`/utilidad?${lossSkuParams.toString()}#utilidad-por-sku`}
            prefetch={false}
            className={`ct-button h-9 ${params.skuResult === "loss" ? "ct-button-primary" : "ct-button-secondary"}`}
          >
            Con perdida
          </Link>
          <Link
            href={`/utilidad?${incompleteSkuParams.toString()}#utilidad-por-sku`}
            prefetch={false}
            className={`ct-button h-9 ${params.skuResult === "incomplete" ? "ct-button-primary" : "ct-button-secondary"}`}
          >
            Sin mapear
          </Link>
        </div>
      </div>
      <div className="ct-ops-mobile-list md:hidden">
        {products.slice(0, 120).map((product) => (
          <div key={product.key} className="ct-ops-mobile-card">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={`/inventario/${encodeURIComponent(product.masterSku)}`}
                  prefetch={false}
                  className="font-mono text-xs font-black underline decoration-zinc-300 underline-offset-2"
                >
                  {product.masterSku}
                </Link>
                <p className="mt-1 line-clamp-2 text-sm font-semibold">
                  {product.title}
                </p>
              </div>
              <p
                className={`shrink-0 text-lg font-black ${
                  product.finalNetProfit < 0 ? "text-red-700" : "text-emerald-700"
                }`}
              >
                {money.format(product.finalNetProfit)}
              </p>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <ProfitMobileMetric label="Ventas" value={number.format(product.orders)} />
              <ProfitMobileMetric label="Venta" value={money.format(product.grossAmount)} />
              <ProfitMobileMetric
                label="Margen"
                value={`${number.format(product.marginPercent)}%`}
                tone={product.marginPercent < 0 ? "red" : "green"}
              />
            </div>
          </div>
        ))}
        {products.length === 0 ? (
          <p className="ct-ops-empty">
            No hay SKUs para este filtro en el periodo seleccionado.
          </p>
        ) : null}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[1180px] text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-3">Periodo</th>
              <th className="px-4 py-3">SKU / Producto</th>
              <th className="px-4 py-3">Ventas</th>
              <th className="px-4 py-3">Unidades</th>
              <th className="px-4 py-3">Venta</th>
              <th className="px-4 py-3">Recibido</th>
              <th className="px-4 py-3">Producto</th>
              <th className="px-4 py-3">Full venta</th>
              <th className="px-4 py-3">Full mensual</th>
              <th className="px-4 py-3">Utilidad final SKU</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {products.slice(0, 120).map((product) => (
              <tr key={product.key}>
                <td className="px-4 py-3 font-mono text-xs font-semibold">
                  {product.month}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/inventario/${encodeURIComponent(product.masterSku)}`}
                    prefetch={false}
                    className="font-mono text-xs font-semibold underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-950"
                  >
                    {product.masterSku}
                  </Link>
                  <p className="mt-1 max-w-sm">{product.title}</p>
                </td>
                <td className="px-4 py-3">{number.format(product.orders)}</td>
                <td className="px-4 py-3">
                  <p>{number.format(product.soldUnits)} vendidas</p>
                  <p className="text-xs text-zinc-500">
                    {number.format(product.consumedUnits)} consumidas
                  </p>
                </td>
                <td className="px-4 py-3">{money.format(product.grossAmount)}</td>
                <td className="px-4 py-3">
                  <p className="font-semibold">
                    {money.format(product.estimatedReceived)}
                  </p>
                  <p className="text-xs text-zinc-500">
                    Meli {money.format(product.allocatedCharges)}
                  </p>
                </td>
                <td className="px-4 py-3">{money.format(product.productCost)}</td>
                <td className="px-4 py-3">{money.format(product.saleFullCosts)}</td>
                <td className="px-4 py-3 text-red-700">
                  -{money.format(product.fullBillingCharges)}
                </td>
                <td
                  className={`px-4 py-3 font-semibold ${
                    product.finalNetProfit < 0
                      ? "text-red-700"
                      : "text-emerald-700"
                  }`}
                >
                  {money.format(product.finalNetProfit)}
                  <p className="mt-1 text-xs font-normal text-zinc-500">
                    {number.format(product.marginPercent)}%
                  </p>
                </td>
              </tr>
            ))}
            {products.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-zinc-500" colSpan={10}>
                  No hay SKUs para este filtro en el periodo seleccionado.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function normalizeMonth(value?: string) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) {
    return null;
  }

  const [, month] = value.split("-").map(Number);
  if (month < 1 || month > 12) {
    return null;
  }

  return value;
}

function normalizeProfitDateRange(input: {
  from?: string;
  to?: string;
  month: string;
}): ProfitDateRange {
  const defaultFrom = `${input.month}-01`;
  const defaultTo = getMonthEndDate(input.month);
  const from = normalizeDateOnly(input.from) ?? defaultFrom;
  const to = normalizeDateOnly(input.to) ?? defaultTo;

  if (from > to) {
    return { from: to, to: from };
  }

  return { from, to };
}

function normalizeDateOnly(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = parseDateOnly(value);
  if (!date || date.toISOString().slice(0, 10) !== value) {
    return null;
  }

  return value;
}

function getMonthEndDate(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
}

function formatDateRangeLabel(range: ProfitDateRange) {
  const fromMonth = range.from.slice(0, 7);
  const isFullMonth = range.from === `${fromMonth}-01` && range.to === getMonthEndDate(fromMonth);
  if (isFullMonth) {
    return formatReportMonthLabel(fromMonth);
  }

  const fromDate = parseDateOnly(range.from);
  const toDate = parseDateOnly(range.to);
  const formatter = new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

  if (!fromDate || !toDate) {
    return `${range.from} a ${range.to}`;
  }

  if (range.from === range.to) {
    return formatter.format(fromDate);
  }

  return `${formatter.format(fromDate)} a ${formatter.format(toDate)}`;
}

function isWithinProfitDateRange(value: string, range: ProfitDateRange) {
  const businessDate = toBusinessDate(value);
  if (!businessDate) {
    return true;
  }

  return businessDate >= range.from && businessDate <= range.to;
}

function toBusinessDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: businessTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return year && month && day ? `${year}-${month}-${day}` : null;
}

function buildProfitRangeSummary(
  report: ProfitReport,
  settledOrders: SettledOrderRow[],
  range: ProfitDateRange,
): MonthlySummaryRow {
  const grossAmount = settledOrders.reduce((sum, order) => sum + order.grossAmount, 0);
  const estimatedReceived = settledOrders.reduce(
    (sum, order) => sum + order.estimatedReceived,
    0,
  );
  const productCost = settledOrders.reduce((sum, order) => sum + order.productCost, 0);
  const additionalCosts = settledOrders.reduce(
    (sum, order) => sum + order.additionalCosts,
    0,
  );
  const contributionProfit = settledOrders.reduce(
    (sum, order) => sum + order.netProfit,
    0,
  );
  const fullBillingCharges = calculateProratedMonthlyAmount(
    report.monthlySummary,
    range,
    "fullBillingCharges",
  );
  const operatingExpenses = calculateProratedMonthlyAmount(
    report.monthlySummary,
    range,
    "operatingExpenses",
  );
  const finalNetProfit = contributionProfit - fullBillingCharges - operatingExpenses;

  return {
    month: range.from.slice(0, 7),
    orders: settledOrders.length,
    grossAmount: roundMoney(grossAmount),
    estimatedReceived: roundMoney(estimatedReceived),
    productCost: roundMoney(productCost),
    additionalCosts: roundMoney(additionalCosts),
    fullBillingCharges: roundMoney(fullBillingCharges),
    contributionProfit: roundMoney(contributionProfit),
    operatingExpenses: roundMoney(operatingExpenses),
    finalNetProfit: roundMoney(finalNetProfit),
    contributionMargin: grossAmount > 0 ? (contributionProfit / grossAmount) * 100 : 0,
    finalMargin: grossAmount > 0 ? (finalNetProfit / grossAmount) * 100 : 0,
  };
}

function buildProductProfitRowsForRange(input: {
  report: ProfitReport;
  settledOrders: SettledOrderRow[];
  range: ProfitDateRange;
}): ProductMonthlySummaryRow[] {
  const rows = new Map<
    string,
    Omit<ProductMonthlySummaryRow, "orders" | "contributionProfit" | "finalNetProfit" | "marginPercent"> & {
      orders: Set<string>;
    }
  >();
  const periodLabel = input.range.from === input.range.to
    ? input.range.from
    : `${input.range.from} / ${input.range.to}`;

  function getRow(masterSku: string, title: string) {
    const key = `${input.range.from}:${input.range.to}:${masterSku}`;
    const row = rows.get(key) ?? {
      key,
      month: periodLabel,
      masterSku,
      title,
      soldUnits: 0,
      consumedUnits: 0,
      orders: new Set<string>(),
      grossAmount: 0,
      estimatedReceived: 0,
      allocatedCharges: 0,
      saleFullCosts: 0,
      productCost: 0,
      fullBillingCharges: 0,
    };
    rows.set(key, row);
    return row;
  }

  for (const order of input.settledOrders) {
    const grossBase =
      order.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0) ||
      order.grossAmount ||
      1;

    for (const item of order.items) {
      const masterSku = item.masterSku ?? "SIN_MAPEAR";
      const lineGross = item.quantity * item.unitPrice;
      const ratio = lineGross / grossBase;
      const row = getRow(masterSku, item.title);

      row.orders.add(order.realSaleKey);
      row.soldUnits += item.quantity;
      row.consumedUnits += item.consumedQuantity ?? 0;
      row.grossAmount += lineGross;
      row.estimatedReceived += order.estimatedReceived * ratio;
      row.allocatedCharges += order.totalCharges * ratio;
      row.saleFullCosts += order.additionalCosts * ratio;
      row.productCost += item.productCost ?? 0;
    }
  }

  for (const monthlyRow of input.report.productMonthlySummary) {
    const ratio = getMonthOverlapRatio(monthlyRow.month, input.range);
    if (ratio <= 0 || monthlyRow.fullBillingCharges <= 0) {
      continue;
    }

    const row = getRow(monthlyRow.masterSku, monthlyRow.title);
    row.fullBillingCharges += monthlyRow.fullBillingCharges * ratio;
  }

  return [...rows.values()]
    .map((row) => {
      const contributionProfit =
        row.estimatedReceived - row.productCost - row.saleFullCosts;
      const finalNetProfit = contributionProfit - row.fullBillingCharges;

      return {
        ...row,
        orders: row.orders.size,
        grossAmount: roundMoney(row.grossAmount),
        estimatedReceived: roundMoney(row.estimatedReceived),
        allocatedCharges: roundMoney(row.allocatedCharges),
        saleFullCosts: roundMoney(row.saleFullCosts),
        productCost: roundMoney(row.productCost),
        contributionProfit: roundMoney(contributionProfit),
        fullBillingCharges: roundMoney(row.fullBillingCharges),
        finalNetProfit: roundMoney(finalNetProfit),
        marginPercent:
          row.grossAmount > 0 ? (finalNetProfit / row.grossAmount) * 100 : 0,
      };
    })
    .sort(
      (a, b) =>
        a.finalNetProfit - b.finalNetProfit ||
        b.grossAmount - a.grossAmount ||
        a.masterSku.localeCompare(b.masterSku),
    );
}

function ProfitMobileMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "red" | "green";
}) {
  const color =
    tone === "red"
      ? "is-danger"
      : tone === "green"
        ? "is-ok"
        : "";

  return (
    <div className="ct-ops-mini-metric">
      <p className="ct-ops-mini-metric-label">
        {label}
      </p>
      <p className={`ct-ops-mini-metric-value ${color}`}>{value}</p>
    </div>
  );
}

function getCurrentBusinessMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: businessTimeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}`;
}

function getProfitPageOrderLimit() {
  const value = Number(process.env.PROFIT_PAGE_MAX_ORDERS ?? 5_000);
  return Number.isFinite(value) && value > 0
    ? Math.min(Math.floor(value), 100_000)
    : 5_000;
}

function formatReportMonthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1, 1));
  return new Intl.DateTimeFormat("es-MX", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function calculateProratedMonthlyAmount(
  rows: MonthlySummaryRow[],
  range: ProfitDateRange,
  field: "fullBillingCharges" | "operatingExpenses",
) {
  return rows.reduce((sum, row) => {
    const ratio = getMonthOverlapRatio(row.month, range);
    return sum + row[field] * ratio;
  }, 0);
}

function monthOverlapsRange(month: string, range: ProfitDateRange) {
  return getMonthOverlapRatio(month, range) > 0;
}

function getMonthOverlapRatio(month: string, range: ProfitDateRange) {
  const monthStart = parseDateOnly(`${month}-01`);
  const monthEnd = parseDateOnly(getMonthEndDate(month));
  const rangeStart = parseDateOnly(range.from);
  const rangeEnd = parseDateOnly(range.to);
  if (!monthStart || !monthEnd || !rangeStart || !rangeEnd) {
    return 0;
  }

  const overlapStart = monthStart > rangeStart ? monthStart : rangeStart;
  const overlapEnd = monthEnd < rangeEnd ? monthEnd : rangeEnd;
  if (overlapEnd < overlapStart) {
    return 0;
  }

  const overlapDays = daysBetween(overlapStart, overlapEnd) + 1;
  const monthDays = daysBetween(monthStart, monthEnd) + 1;
  return Math.min(1, Math.max(0, overlapDays / Math.max(1, monthDays)));
}

function parseDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isFinite(date.getTime()) ? date : null;
}

function daysBetween(start: Date, end: Date) {
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function buildSkuComparison(
  masterSkus: string[],
  report: Awaited<ReturnType<typeof buildProfitReport>>,
  range: ProfitDateRange,
  productRows: ProductMonthlySummaryRow[],
) {
  return masterSkus.map((masterSku) => {
    const normalized = masterSku.toLowerCase();
    const rows = productRows.filter(
      (row) => row.masterSku.toLowerCase() === normalized,
    );
    const productOption = report.productOptions.find(
      (product) => product.masterSku.toLowerCase() === normalized,
    );
    const problemOrders = report.orders.filter(
      (order) =>
        order.items.some(
          (item) => item.masterSku?.toLowerCase() === normalized,
        ) &&
        isWithinProfitDateRange(order.orderedAt, range) &&
        isProblemOrder(order),
    ).length;
    const grossAmount = rows.reduce((sum, row) => sum + row.grossAmount, 0);
    const contributionProfit = rows.reduce(
      (sum, row) => sum + row.contributionProfit,
      0,
    );
    const finalNetProfit = rows.reduce(
      (sum, row) => sum + row.finalNetProfit,
      0,
    );

    return {
      masterSku,
      title: rows[0]?.title ?? productOption?.name ?? masterSku,
      orders: rows.reduce((sum, row) => sum + row.orders, 0),
      soldUnits: rows.reduce((sum, row) => sum + row.soldUnits, 0),
      grossAmount,
      contributionProfit,
      contributionMargin:
        grossAmount > 0 ? (contributionProfit / grossAmount) * 100 : 0,
      finalNetProfit,
      finalMargin: grossAmount > 0 ? (finalNetProfit / grossAmount) * 100 : 0,
      fullBillingCharges: rows.reduce(
        (sum, row) => sum + row.fullBillingCharges,
        0,
      ),
      problemOrders,
    };
  });
}

function isProblemOrder(order: Awaited<ReturnType<typeof buildProfitReport>>["orders"][number]) {
  const status = order.status.toLowerCase();
  const hasReturnCharge = order.charges.some(
    (charge) =>
      charge.type === "return_cost" ||
      charge.source.toLowerCase().includes("return") ||
      charge.source.toLowerCase().includes("devol"),
  );

  return (
    order.isCancelled ||
    order.needsCancelledBillingReview ||
    hasReturnCharge ||
    status.includes("claim") ||
    status.includes("reclamo") ||
    status.includes("return") ||
    status.includes("devol")
  );
}
