export const dynamic = "force-dynamic";

import Link from "next/link";
import { Suspense } from "react";
import { AlertTriangle, Download, TrendingUp, Warehouse } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/server/auth-store";
import { buildRestockReport, type RestockPriority } from "@/lib/server/restock-report";

const number = new Intl.NumberFormat("es-MX");
const decimal = new Intl.NumberFormat("es-MX", {
  maximumFractionDigits: 2,
});
const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});

const priorityCopy: Record<RestockPriority, string> = {
  critico: "Comprar ya",
  alto: "Revisar pronto",
  medio: "Vigilar",
  ok: "Suficiente",
  sin_ventas: "Sin ventas",
};

export default async function RestockPage() {
  const user = await requirePermission("inventory.view");
  return (
    <AppShell
      active="resurtido"
      title="Resurtido"
      subtitle="Sugerencia de compra con ventas recientes y stock actual."
      organization={user.organizationName}
      userEmail={user.email}
      actions={<RestockActions />}
    >
      <Suspense fallback={<RestockPageSkeleton />}>
        <RestockContent />
      </Suspense>
    </AppShell>
  );
}

async function RestockContent() {
  const report = await buildRestockReport();
  const actionRows = report.rows.filter((row) =>
    ["critico", "alto", "medio"].includes(row.priority),
  );
  const visibleRows = actionRows.length > 0 ? actionRows : report.rows.slice(0, 80);

  return (
    <div className="ct-ops-page">
      <section className="ct-ops-kpi-grid">
        <Kpi
          label="Comprar ya"
          value={number.format(report.totals.critical)}
          detail="Menos de 30 dias o sin stock."
          tone={report.totals.critical > 0 ? "red" : "green"}
        />
        <Kpi
          label="Revisar pronto"
          value={number.format(report.totals.high + report.totals.medium)}
          detail="Entre 30 y 90 dias de inventario."
          tone={report.totals.high + report.totals.medium > 0 ? "amber" : "green"}
        />
        <Kpi
          label="Piezas sugeridas"
          value={number.format(report.totals.suggestedUnits)}
          detail="Para cubrir 90 dias aproximados."
        />
        <Kpi
          label="Capital estimado"
          value={money.format(report.totals.suggestedValue)}
          detail="Calculado con costo promedio."
        />
      </section>

      <section className="ct-ops-panel overflow-hidden">
        <div className="ct-ops-panel-header">
          <div>
            <h2 className="ct-ops-title">Lista de resurtido</h2>
            <p className="ct-ops-copy">
              Solo aparecen acciones necesarias. Si no hay urgencias, mostramos los
              primeros SKUs como referencia.
            </p>
          </div>
          <div className="ct-ops-status is-muted gap-2">
            <TrendingUp size={14} />
            {number.format(visibleRows.length)} filas
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Prioridad</th>
                <th className="px-4 py-3">SKU maestro</th>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3 text-right">Stock</th>
                <th className="px-4 py-3 text-right">Vendido 90d</th>
                <th className="px-4 py-3 text-right">Dias aprox.</th>
                <th className="px-4 py-3 text-right">Comprar</th>
                <th className="px-4 py-3 text-right">Costo</th>
                <th className="px-4 py-3 text-right">Capital</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleRows.map((row) => (
                <tr key={row.masterSku} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <PriorityBadge priority={row.priority} />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs font-bold">
                    <Link href={`/inventario/${encodeURIComponent(row.masterSku)}`}>
                      {row.masterSku}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-medium">{row.name}</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {number.format(row.physicalQuantity)}
                  </td>
                  <td className="px-4 py-3 text-right">{number.format(row.sold90)}</td>
                  <td className="px-4 py-3 text-right">
                    {row.daysLeft === null ? "Sin ventas" : decimal.format(Math.ceil(row.daysLeft))}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {number.format(row.suggestedQuantity)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {money.format(row.averageUnitCost)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {money.format(row.suggestedQuantity * row.averageUnitCost)}
                  </td>
                </tr>
              ))}
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="ct-ops-empty">
                    No hay inventario suficiente para calcular resurtido todavia.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="ct-ops-alert">
        <div className="flex gap-3">
          <span className="ct-ops-icon">
            <Warehouse size={18} />
          </span>
          <div>
            <h3 className="ct-ops-title">Como se calcula</h3>
            <p className="ct-ops-copy max-w-4xl">
              Tomamos ventas cerradas no canceladas de los ultimos 90 dias,
              calculamos venta diaria promedio por SKU maestro y comparamos contra
              el stock actual. Las ventas pendientes de billing no entran para no
              contaminar utilidad ni resurtido.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function RestockActions() {
  return (
    <>
      <Link
        href="/api/export/resurtido"
        className="ct-button ct-button-secondary"
      >
        <Download size={16} />
        Exportar resurtido
      </Link>
      <Link href="/inventario" className="ct-button ct-button-secondary">
        Ver inventario
      </Link>
    </>
  );
}

function RestockPageSkeleton() {
  return (
    <div className="ct-ops-page">
      <section className="ct-ops-kpi-grid">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="ct-ops-kpi h-32 animate-pulse" />
        ))}
      </section>
      <section className="ct-ops-panel overflow-hidden">
        <div className="ct-ops-panel-header">
          <div className="h-8 w-52 animate-pulse rounded-md bg-white/10" />
        </div>
        <div className="space-y-3 p-4">
          {[0, 1, 2, 3, 4].map((item) => (
            <div key={item} className="h-12 animate-pulse rounded-md bg-white/10" />
          ))}
        </div>
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "green" | "amber" | "red";
}) {
  const toneClass = {
    neutral: "",
    green: "is-ok",
    amber: "is-warn",
    red: "is-danger",
  }[tone];

  return (
    <div className={`ct-ops-kpi ${toneClass}`}>
      <p className="ct-ops-kpi-label">{label}</p>
      <p className="ct-ops-kpi-value">{value}</p>
      <p className="ct-ops-kpi-detail">{detail}</p>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: RestockPriority }) {
  const tone =
    priority === "critico"
      ? "is-danger"
      : priority === "alto" || priority === "medio"
        ? "is-warn"
        : priority === "ok"
          ? "is-ok"
          : "is-muted";

  return (
    <span className={`ct-ops-status gap-1 ${tone}`}>
      {priority === "critico" ? <AlertTriangle size={13} /> : null}
      {priorityCopy[priority]}
    </span>
  );
}
