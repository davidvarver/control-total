import type { LockMode, SubscriptionStatus } from "@prisma/client";
import { Activity, Building2, Database, Lock, WalletCards } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AsyncForm } from "@/components/async-form";
import {
  listPlatformOrganizations,
  requirePlatformAdmin,
} from "@/lib/server/auth-store";
import {
  buildPlatformUsageReport,
  listLocalMarketplaceAccountSummaries,
} from "@/lib/server/client-usage";
import { getMeliSyncLimits } from "@/lib/server/sync-config";

const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});
const number = new Intl.NumberFormat("es-MX");
const date = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" });
const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

type AdminPageProps = {
  searchParams: Promise<{
    updated?: string;
    payment?: string;
    error?: string;
  }>;
};

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const user = await requirePlatformAdmin();
  const params = await searchParams;
  const organizations = await listPlatformOrganizations();
  const syncLimits = getMeliSyncLimits();
  const [usageReport, localAccountsByOrganizationId] = await Promise.all([
    buildPlatformUsageReport(),
    listLocalMarketplaceAccountSummaries(
      organizations.map((organization) => organization.id),
    ),
  ]);
  const activeOrganizations = organizations.filter((organization) => {
    const subscription = organization.subscriptions[0];
    return (
      organization.status === "active" &&
      subscription?.status !== "suspended" &&
      subscription?.status !== "cancelled"
    );
  });
  const suspendedOrganizations = organizations.filter((organization) => {
    const subscription = organization.subscriptions[0];
    return (
      organization.status !== "active" ||
      subscription?.status === "suspended" ||
      subscription?.status === "cancelled"
    );
  });
  const monthlyPaid = organizations.filter((organization) => {
    const lastPayment = organization.subscriptionPayments[0];
    if (!lastPayment) {
      return false;
    }

    const paidAt = lastPayment.paidAt;
    const now = new Date();
    return (
      paidAt.getFullYear() === now.getFullYear() &&
      paidAt.getMonth() === now.getMonth()
    );
  }).length;
  const totalUsageCost = [...usageReport.byOrganizationId.values()].reduce(
    (sum, usage) => sum + usage.estimatedMonthlyDbCostUsd,
    0,
  );

  return (
    <AppShell
      active="admin"
      title="Admin plataforma"
      subtitle="Cuentas master, pagos manuales y bloqueo de acceso sin borrar datos."
      organization="Control Total"
      userEmail={user.email}
      platformMode={user.isPlatformOnly}
    >
      {params.updated ? <Banner tone="success">Cuenta actualizada.</Banner> : null}
      {params.payment ? <Banner tone="success">Pago registrado.</Banner> : null}
      {params.error ? <Banner tone="error">{params.error}</Banner> : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <Kpi label="Cuentas master" value={number.format(organizations.length)} icon={<Building2 size={18} />} />
        <Kpi label="Activas" value={number.format(activeOrganizations.length)} icon={<WalletCards size={18} />} />
        <Kpi label="Bloqueadas/suspendidas" value={number.format(suspendedOrganizations.length)} icon={<Lock size={18} />} />
        <Kpi label="Pagaron este mes" value={number.format(monthlyPaid)} icon={<WalletCards size={18} />} />
        <Kpi label="Ordenes 30 dias" value={number.format(usageReport.totalOrdersLast30Days)} icon={<Activity size={18} />} />
        <Kpi label="DB estimada" value={`${number.format(usageReport.totalEstimatedDbGb)} GB`} icon={<Database size={18} />} />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="font-semibold">Consumo por cliente</h2>
          <p className="text-sm text-slate-500">
            Estimacion para cobrar al costo: 50% storage, 30% ventas recientes y 20% tiempo de sync. Base DB:{" "}
            {usd.format(usageReport.monthlyDbCostUsd)} / mes.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-black uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Ordenes 30d</th>
                <th className="px-4 py-3">DB</th>
                <th className="px-4 py-3">Payload ventas</th>
                <th className="px-4 py-3">Sync 30d</th>
                <th className="px-4 py-3">% consumo</th>
                <th className="px-4 py-3">Costo DB estimado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {organizations.map((organization) => {
                const usage = usageReport.byOrganizationId.get(organization.id);
                const owner =
                  organization.users.find((member) => member.role.name === "owner") ??
                  organization.users[0];
                const clientName =
                  owner?.user.name?.trim() ||
                  owner?.user.email?.split("@")[0] ||
                  organization.name;

                return (
                  <tr key={organization.id} className="align-top">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-950">{clientName}</p>
                      <p className="text-xs text-slate-500">{owner?.user.email ?? organization.name}</p>
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      {number.format(usage?.ordersLast30Days ?? 0)}
                    </td>
                    <td className="px-4 py-3">
                      {number.format(usage?.estimatedDbMb ?? 0)} MB
                    </td>
                    <td className="px-4 py-3">
                      {number.format(usage?.salePayloadMb ?? 0)} MB
                    </td>
                    <td className="px-4 py-3">
                      <p>{number.format(usage?.syncRunsLast30Days ?? 0)} corrida(s)</p>
                      <p className="text-xs text-slate-500">
                        {number.format(usage?.syncMinutesLast30Days ?? 0)} min
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {formatPercent(usage?.share.blended ?? 0)}
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      {usd.format(usage?.estimatedMonthlyDbCostUsd ?? 0)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t border-slate-200 bg-slate-50 text-sm font-semibold">
              <tr>
                <td className="px-4 py-3">Total asignado</td>
                <td className="px-4 py-3">{number.format(usageReport.totalOrdersLast30Days)}</td>
                <td className="px-4 py-3">{number.format(usageReport.totalEstimatedDbGb)} GB</td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3">
                  {number.format(Math.round(usageReport.totalSyncDurationMsLast30Days / 60_000))} min
                </td>
                <td className="px-4 py-3">100%</td>
                <td className="px-4 py-3">{usd.format(totalUsageCost)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="font-semibold">Cuentas master</h2>
          <p className="text-sm text-slate-500">
            Aqui controlas clientes, no subcuentas Meli ni usuarios internos.
          </p>
        </div>
        <div className="divide-y divide-slate-100">
          {organizations.map((organization) => {
            const subscription = organization.subscriptions[0];
            const lastPayment = organization.subscriptionPayments[0];
            const usage = usageReport.byOrganizationId.get(organization.id);
            const meliAccounts = (
              localAccountsByOrganizationId.get(organization.id) ?? []
            ).filter(
              (account) =>
                account.channel === "mercado_libre" && account.status === "connected",
            );
            const owner =
              organization.users.find((member) => member.role.name === "owner") ??
              organization.users[0];
            const clientName =
              owner?.user.name?.trim() ||
              owner?.user.email?.split("@")[0] ||
              "Cliente sin nombre";
            const ownerEmail = owner?.user.email ?? "sin owner";
            const nextMonth = new Date();
            nextMonth.setMonth(nextMonth.getMonth() + 1);

            return (
              <div key={organization.id} className="grid gap-4 px-4 py-4 xl:grid-cols-[minmax(0,1fr)_420px]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold">{clientName}</h3>
                    <StatusPill
                      status={subscription?.status ?? "trial"}
                      lockMode={subscription?.lockMode ?? "read_only"}
                    />
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {ownerEmail} | Usuarios:{" "}
                    {number.format(organization.users.length)} | Meli:{" "}
                    {number.format(meliAccounts.length || organization.marketplaceAccounts.length)}
                  </p>
                  <details className="mt-2 text-sm text-slate-500">
                    <summary className="cursor-pointer font-semibold text-slate-700">
                      Ver detalle de cuenta
                    </summary>
                    <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                      <p>
                        <span className="font-semibold">Cuenta master:</span>{" "}
                        {organization.name}
                      </p>
                      <p>
                        <span className="font-semibold">ID:</span> {organization.id}
                      </p>
                      <p>
                        <span className="font-semibold">Owner:</span> {ownerEmail}
                      </p>
                    </div>
                  </details>
                  <div className="mt-3 grid gap-2 text-sm md:grid-cols-3">
                    <Info label="Vence" value={subscription ? date.format(subscription.expiresAt) : "pendiente"} />
                    <Info label="Gracia" value={subscription ? date.format(subscription.graceUntil) : "pendiente"} />
                    <Info label="Ultimo pago" value={lastPayment ? `${money.format(Number(lastPayment.amount))} hasta ${date.format(lastPayment.coveredUntil)}` : "sin pagos"} />
                    <Info label="Costo estimado" value={usd.format(usage?.estimatedMonthlyDbCostUsd ?? 0)} />
                    <Info label="Ordenes 30d" value={number.format(usage?.ordersLast30Days ?? 0)} />
                    <Info label="DB usada" value={`${number.format(usage?.estimatedDbMb ?? 0)} MB`} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {organization.subscriptionPayments.slice(0, 6).map((payment) => (
                      <span
                        key={payment.id}
                        className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600"
                      >
                        {date.format(payment.paidAt)} - {money.format(Number(payment.amount))}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <details className="ct-action-panel group">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-slate-700">
                      <span>Editar acceso</span>
                      <span className="rounded-full bg-white px-2 py-1 text-xs text-slate-500 group-open:hidden">
                        Abrir
                      </span>
                      <span className="hidden rounded-full bg-slate-950 px-2 py-1 text-xs text-white group-open:inline">
                        Cerrar
                      </span>
                    </summary>
                    <AsyncForm
                      action="/api/admin/subscription"
                      successMessage="Acceso actualizado"
                      confirmTitle="Cambiar acceso de cliente"
                      confirmMessage={`Vas a cambiar el estado o bloqueo de ${clientName}. Esto puede activar, suspender o bloquear su cuenta.`}
                      className="grid gap-2 border-t border-slate-200 p-3 md:grid-cols-2"
                    >
                      <input type="hidden" name="organizationId" value={organization.id} />
                      <Select
                        name="status"
                        label="Estado"
                        defaultValue={subscription?.status ?? "trial"}
                        options={["trial", "active", "grace", "suspended", "cancelled"]}
                      />
                      <Select
                        name="lockMode"
                        label="Bloqueo"
                        defaultValue={subscription?.lockMode ?? "read_only"}
                        options={["none", "read_only", "full_lock"]}
                      />
                      <DateField
                        name="expiresAt"
                        label="Vence"
                        value={subscription?.expiresAt ?? nextMonth}
                      />
                      <DateField
                        name="graceUntil"
                        label="Gracia"
                        value={subscription?.graceUntil ?? nextMonth}
                      />
                      <button className="h-10 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white md:col-span-2">
                        Guardar acceso
                      </button>
                    </AsyncForm>
                  </details>

                  <details className="ct-action-panel group">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-slate-700">
                      <span>Registrar pago</span>
                      <span className="rounded-full bg-white px-2 py-1 text-xs text-slate-500 group-open:hidden">
                        Abrir
                      </span>
                      <span className="hidden rounded-full bg-slate-950 px-2 py-1 text-xs text-white group-open:inline">
                        Cerrar
                      </span>
                    </summary>
                    <AsyncForm
                      action="/api/admin/payment"
                      resetOnSuccess
                      successMessage="Pago registrado"
                      confirmTitle="Registrar pago"
                      confirmMessage={`Confirma que el pago de ${clientName} ya fue recibido antes de actualizar su suscripcion.`}
                      className="grid gap-2 border-t border-slate-200 p-3 md:grid-cols-2"
                    >
                      <input type="hidden" name="organizationId" value={organization.id} />
                      <Field name="amount" label="Monto" type="number" step="0.01" required />
                      <Select
                        name="method"
                        label="Metodo"
                        defaultValue="transferencia"
                        options={["transferencia", "efectivo", "otro"]}
                      />
                      <DateField name="coveredUntil" label="Cubre hasta" value={nextMonth} />
                      <Field name="notes" label="Nota" />
                      <button className="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold md:col-span-2">
                        Registrar pago
                      </button>
                    </AsyncForm>
                  </details>

                  <details className="ct-action-panel group">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-slate-700">
                      <span>Sync Meli admin</span>
                      <span className="rounded-full bg-white px-2 py-1 text-xs text-slate-500 group-open:hidden">
                        Abrir
                      </span>
                      <span className="hidden rounded-full bg-slate-950 px-2 py-1 text-xs text-white group-open:inline">
                        Cerrar
                      </span>
                    </summary>
                    {meliAccounts.length > 0 ? (
                      <div className="space-y-3 border-t border-slate-200 p-3">
                        <p className="text-xs font-medium text-slate-500">
                          Solo platform admin. Usalo para rescatar cuentas cuando cambie la logica o falte historial.
                        </p>
                        {meliAccounts.map((account) => (
                          <div
                            key={account.id}
                            className="rounded-md border border-slate-200 bg-slate-50 p-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="text-sm font-semibold">
                                  {account.nickname ?? account.alias}
                                </p>
                                <p className="text-xs text-slate-500">
                                  {account.id} | Ultimo sync:{" "}
                                  {account.lastSyncAt
                                    ? date.format(new Date(account.lastSyncAt))
                                    : "sin sync"}
                                </p>
                              </div>
                            </div>
                            <div className="mt-3 grid gap-2">
                              <AsyncForm
                                action="/api/admin/meli-sync"
                                successMessage="Ventas sincronizadas"
                                confirmTitle="Sync historico de ventas"
                                confirmMessage={`Vas a sincronizar ventas de ${clientName} / ${account.nickname ?? account.alias}. Puede tardar si la cuenta tiene muchas ventas.`}
                                className="grid gap-2 md:grid-cols-[1fr_90px_120px]"
                              >
                                <input type="hidden" name="organizationId" value={organization.id} />
                                <input type="hidden" name="accountId" value={account.id} />
                                <input type="hidden" name="task" value="sales-history" />
                                <Select
                                  name="months"
                                  label="Ventas historial"
                                  defaultValue="3"
                                  options={["1", "2", "3", "6", "12"]}
                                />
                                <Field
                                  name="backfillLimit"
                                  label="Limite"
                                  type="number"
                                  defaultValue={String(syncLimits.adminBackfillDefault)}
                                  min="50"
                                  max={String(syncLimits.adminBackfillMax)}
                                  required
                                />
                                <button className="mt-6 h-10 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white">
                                  Sync ventas
                                </button>
                              </AsyncForm>
                              <AsyncForm
                                action="/api/admin/meli-sync"
                                successMessage="Stock Full sincronizado"
                                confirmTitle="Sync Full"
                                confirmMessage={`Vas a actualizar publicaciones/stock Full de ${clientName} / ${account.nickname ?? account.alias}.`}
                                className="grid gap-2 md:grid-cols-[1fr_120px]"
                              >
                                <input type="hidden" name="organizationId" value={organization.id} />
                                <input type="hidden" name="accountId" value={account.id} />
                                <input type="hidden" name="task" value="full-stock" />
                                <Field
                                  name="maxItems"
                                  label="Max items"
                                  type="number"
                                  defaultValue={String(syncLimits.adminFullStockMaxItems)}
                                  min="50"
                                  max={String(syncLimits.adminFullStockMaxItems)}
                                  required
                                />
                                <button className="mt-6 h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold">
                                  Sync Full
                                </button>
                              </AsyncForm>
                              <AsyncForm
                                action="/api/admin/meli-sync"
                                successMessage="Cargos Full sincronizados"
                                confirmTitle="Sync cargos Full"
                                confirmMessage={`Vas a traer cargos Full del periodo seleccionado para ${clientName} / ${account.nickname ?? account.alias}.`}
                                className="grid gap-2 md:grid-cols-[1fr_140px]"
                              >
                                <input type="hidden" name="organizationId" value={organization.id} />
                                <input type="hidden" name="accountId" value={account.id} />
                                <input type="hidden" name="task" value="full-billing" />
                                <Field
                                  name="period"
                                  label="Mes cargos Full"
                                  type="month"
                                  defaultValue={getPreviousMonthValue()}
                                  required
                                />
                                <button className="mt-6 h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold">
                                  Sync cargos
                                </button>
                              </AsyncForm>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="border-t border-slate-200 p-3 text-sm text-slate-500">
                        Este cliente no tiene cuentas Meli conectadas.
                      </p>
                    )}
                  </details>
                </div>
              </div>
            );
          })}
          {organizations.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">
              Todavia no hay cuentas master registradas.
            </p>
          ) : null}
        </div>
      </section>
    </AppShell>
  );
}

function StatusPill({
  status,
  lockMode,
}: {
  status: SubscriptionStatus;
  lockMode: LockMode;
}) {
  const locked = lockMode !== "none" || status === "suspended" || status === "cancelled";

  return (
    <span
      className={`rounded-full px-2 py-1 text-xs font-semibold ${
        locked ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
      }`}
    >
      {status} / {lockMode}
    </span>
  );
}

function Kpi({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between text-slate-500">
        <p className="text-sm font-semibold">{label}</p>
        {icon}
      </div>
      <p className="mt-3 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 px-3 py-2">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function formatPercent(value: number) {
  return `${number.format(Math.round(value * 1000) / 10)}%`;
}

function Select({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue: string;
  options: string[];
}) {
  return (
    <label className="text-sm font-semibold text-slate-700">
      {label}
      <select
        name={name}
        defaultValue={defaultValue}
        className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function Field({
  label,
  name,
  type = "text",
  step,
  min,
  max,
  defaultValue,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  step?: string;
  min?: string;
  max?: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <label className="text-sm font-semibold text-slate-700">
      {label}
      <input
        name={name}
        type={type}
        step={step}
        min={min}
        max={max}
        defaultValue={defaultValue}
        required={required}
        className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
      />
    </label>
  );
}

function getPreviousMonthValue() {
  const now = new Date();
  now.setMonth(now.getMonth() - 1);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function DateField({
  label,
  name,
  value,
}: {
  label: string;
  name: string;
  value: Date;
}) {
  return (
    <label className="text-sm font-semibold text-slate-700">
      {label}
      <input
        name={name}
        type="date"
        defaultValue={value.toISOString().slice(0, 10)}
        className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
      />
    </label>
  );
}

function Banner({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "success" | "error";
}) {
  return (
    <div
      className={`rounded-md border px-4 py-3 text-sm font-medium ${
        tone === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-red-200 bg-red-50 text-red-700"
      }`}
    >
      {children}
    </div>
  );
}
