export const dynamic = "force-dynamic";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, History, ReceiptText, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { formatDateTimeMx } from "@/lib/format";
import { requirePermission } from "@/lib/server/auth-store";
import { listAuditLogs } from "@/lib/server/audit";
import { buildSalesAuditReport } from "@/lib/server/sales-audit";

type AuditPageProps = {
  searchParams: Promise<{
    q?: string;
    entity?: string;
    error?: string;
    repair_checked?: string;
    repair_repaired?: string;
    repair_failed?: string;
    repair_after?: string;
    repair_order?: string;
  }>;
};

export default async function AuditPage({ searchParams }: AuditPageProps) {
  const user = await requirePermission("sales.view");
  const params = await searchParams;
  const query = (params.q ?? "").trim().toLowerCase();
  const [logs, salesAudit] = await Promise.all([
    listAuditLogs(user.organizationId, 200),
    buildSalesAuditReport(),
  ]);
  const filteredLogs = logs.filter((log) => {
    const matchesQuery =
      !query ||
      log.action.toLowerCase().includes(query) ||
      log.entityType.toLowerCase().includes(query) ||
      log.entityId.toLowerCase().includes(query) ||
      (log.user?.email ?? "").toLowerCase().includes(query);
    const matchesEntity = !params.entity || log.entityType === params.entity;

    return matchesQuery && matchesEntity;
  });
  const entityTypes = [...new Set(logs.map((log) => log.entityType))].sort();

  return (
    <AppShell
      active="auditoria"
      title="Auditoria"
      subtitle="Verificacion automatica de ventas y bitacora de cambios criticos."
      organization={user.organizationName}
      userEmail={user.email}
    >
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <AuditMetric
          label="Ventas reales revisadas"
          value={salesAudit.totalRealSales}
          detail={`${salesAudit.totalOrders} ordenes Meli`}
          tone="neutral"
        />
        <AuditMetric
          label="Errores criticos"
          value={salesAudit.criticalCount}
          detail="Afectan dinero, canceladas o inventario"
          tone={salesAudit.criticalCount > 0 ? "red" : "green"}
        />
        <AuditMetric
          label="Advertencias"
          value={salesAudit.warningCount}
          detail="Conviene revisar, no siempre bloquea"
          tone={salesAudit.warningCount > 0 ? "amber" : "green"}
        />
        <AuditMetric
          label="Ventas limpias"
          value={salesAudit.cleanRealSales}
          detail="Sin reglas de error activas"
          tone="green"
        />
      </section>

      {params.repair_checked ? (
        <section className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <p className="font-semibold">Reparacion con Meli terminada.</p>
          <p className="mt-1">
            {params.repair_order ? `Venta ${params.repair_order}: ` : ""}
            Se revisaron {params.repair_checked} venta(s), se refrescaron{" "}
            {params.repair_repaired ?? "0"} y fallaron {params.repair_failed ?? "0"}.
            {params.repair_after
              ? ` Ahora quedan ${params.repair_after} problema(s) en auditoria.`
              : " Se refresco directo con Mercado Libre."}
          </p>
        </section>
      ) : null}

      {params.error ? (
        <section className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {params.error}
        </section>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <ReceiptText size={18} className="text-slate-500" />
                <h2 className="font-semibold">Auditoria de ventas</h2>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Revisa recibido, cargos, canceladas, packs, SKUs sin equivalencia y billing viejo.
                Si una cancelada aparece aqui, no se pone en cero a ciegas: se vuelve a consultar
                Meli y solo queda limpia cuando Meli confirma que no hubo dinero ni cargos activos.
              </p>
            </div>
            <div className="flex w-full flex-col gap-2 lg:w-auto">
              <form
                action="/api/integrations/meli/repair-audit"
                method="post"
                className="flex flex-wrap gap-2"
              >
                <input type="hidden" name="back" value="/auditoria" />
                <input
                  name="orderId"
                  placeholder="Venta especifica"
                  className="h-10 min-w-[220px] rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-950"
                />
                <button className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white hover:bg-slate-800">
                  <RefreshCw size={16} />
                  Actualizar venta
                </button>
              </form>
              <p className="text-xs text-slate-500">
                Si el envio o billing de una venta se ve raro y no aparece abajo, escribe
                el numero de venta aqui para refrescarla directo con Meli.
              </p>
              <Link
                href="/ventas"
                className="inline-flex h-10 items-center rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Ver ventas
              </Link>
            </div>
          </div>
        </div>

        {salesAudit.issues.length === 0 ? (
          <div className="flex items-start gap-3 bg-emerald-50 px-4 py-5 text-sm text-emerald-900">
            <CheckCircle2 size={20} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">No se detectaron errores en ventas.</p>
              <p className="mt-1">
                Las reglas automaticas no encontraron diferencias de dinero, canceladas activas,
                packs raros ni SKUs sin equivalencia.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-2 border-b border-slate-100 p-4 md:grid-cols-2 xl:grid-cols-4">
              {salesAudit.ruleCounts.map((rule) => (
                <div
                  key={rule.rule}
                  className={`rounded-md border px-3 py-2 text-sm ${
                    rule.severity === "critical"
                      ? "border-red-200 bg-red-50 text-red-900"
                      : "border-amber-200 bg-amber-50 text-amber-900"
                  }`}
                >
                  <p className="font-semibold">{rule.title}</p>
                  <p>{rule.count} caso(s)</p>
                </div>
              ))}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Nivel</th>
                    <th className="px-4 py-3">Venta</th>
                    <th className="px-4 py-3">Problema</th>
                    <th className="px-4 py-3">Dinero</th>
                    <th className="px-4 py-3">Accion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {salesAudit.issues.slice(0, 100).map((issue) => (
                    <tr key={issue.id} className="align-top">
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${
                            issue.severity === "critical"
                              ? "bg-red-50 text-red-700"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          <AlertTriangle size={14} />
                          {issue.severity === "critical" ? "Critico" : "Aviso"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={issue.href} className="font-mono font-semibold underline">
                          {issue.orderId}
                        </Link>
                        <p className="text-xs text-slate-500">{formatDateTimeMx(issue.orderedAt)}</p>
                        <p className="text-xs text-slate-500">
                          {issue.accountAlias} | {issue.status}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold">{issue.title}</p>
                        <p className="mt-1 max-w-xl text-slate-600">{issue.detail}</p>
                      </td>
                      <td className="px-4 py-3">
                        <MoneyLine label="Venta" value={issue.grossAmount} />
                        <MoneyLine label="Cargos" value={issue.chargesTotal} />
                        <MoneyLine label="Recibido" value={issue.netReceivedAmount} />
                        {issue.expectedReceived !== null ? (
                          <MoneyLine label="Esperado" value={issue.expectedReceived} />
                        ) : null}
                        {issue.delta !== null ? (
                          <MoneyLine label="Diferencia" value={issue.delta} emphasize />
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-2">
                          <Link
                            href={issue.href}
                            className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Abrir venta
                          </Link>
                          {issue.actionHref ? (
                            <Link
                              href={issue.actionHref}
                              className="inline-flex h-9 items-center justify-center rounded-md bg-slate-950 px-3 text-sm font-semibold text-white hover:bg-slate-800"
                            >
                              {issue.actionLabel ?? "Resolver"}
                            </Link>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {salesAudit.issues.length > 100 ? (
              <div className="border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
                Mostrando los primeros 100 problemas de {salesAudit.issues.length}.
              </div>
            ) : null}
          </>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <History size={18} className="text-slate-500" />
            <h2 className="font-semibold">Eventos recientes</h2>
          </div>
          <form className="mt-3 grid gap-2 md:grid-cols-[minmax(220px,1fr)_220px_120px]">
            <input
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="Buscar accion, usuario, SKU u orden"
              className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-950"
            />
            <select
              name="entity"
              defaultValue={params.entity ?? ""}
              className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-950"
            >
              <option value="">Todas entidades</option>
              {entityTypes.map((entity) => (
                <option key={entity} value={entity}>
                  {entity}
                </option>
              ))}
            </select>
            <button className="h-10 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white hover:bg-slate-800">
              Filtrar
            </button>
          </form>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Usuario</th>
                <th className="px-4 py-3">Accion</th>
                <th className="px-4 py-3">Entidad</th>
                <th className="px-4 py-3">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="align-top">
                  <td className="px-4 py-3">{formatDateTimeMx(log.createdAt.toISOString())}</td>
                  <td className="px-4 py-3">
                    <p className="font-semibold">{log.user?.name ?? "Sistema"}</p>
                    <p className="text-xs text-slate-500">{log.user?.email ?? "automatizado"}</p>
                  </td>
                  <td className="px-4 py-3 font-semibold">{log.action}</td>
                  <td className="px-4 py-3">
                    <p>{log.entityType}</p>
                    <p className="font-mono text-xs text-slate-500">{log.entityId}</p>
                  </td>
                  <td className="px-4 py-3">
                    <pre className="max-h-40 overflow-auto rounded-md bg-slate-50 p-2 text-xs text-slate-600">
                      {JSON.stringify(log.after ?? log.before ?? {}, null, 2)}
                    </pre>
                  </td>
                </tr>
              ))}
              {filteredLogs.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={5}>
                    Todavia no hay eventos de auditoria.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}

const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});

const number = new Intl.NumberFormat("es-MX");

function AuditMetric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: number;
  detail: string;
  tone: "neutral" | "green" | "amber" | "red";
}) {
  const toneClass = {
    neutral: "border-slate-200 bg-white",
    green: "border-emerald-200 bg-emerald-50",
    amber: "border-amber-200 bg-amber-50",
    red: "border-red-200 bg-red-50",
  }[tone];

  return (
    <div className={`rounded-lg border p-4 ${toneClass}`}>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{number.format(value)}</p>
      <p className="mt-2 text-sm text-slate-600">{detail}</p>
    </div>
  );
}

function MoneyLine({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: number | null;
  emphasize?: boolean;
}) {
  return (
    <p className={emphasize ? "font-semibold text-red-700" : "text-slate-600"}>
      {label}: {value === null ? "pendiente" : money.format(value)}
    </p>
  );
}
