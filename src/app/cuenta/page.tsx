import { CalendarClock, Lock, WalletCards } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import {
  getOrganizationAccess,
  requireCurrentUser,
} from "@/lib/server/auth-store";

type AccountPageProps = {
  searchParams: Promise<{
    updated?: string;
    payment?: string;
    locked?: string;
    error?: string;
  }>;
};

const dateFormatter = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
});

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const user = await requireCurrentUser();
  const params = await searchParams;
  const access = await getOrganizationAccess(user.organizationId);

  return (
    <AppShell
      active="cuenta"
      title="Cuenta y acceso"
      subtitle="Estado de tu cuenta, fecha de vencimiento y modo de acceso."
      organization={user.organizationName}
      userEmail={user.email}
    >
      <div className="ct-ops-page">
        {params.locked ? (
          <Banner tone="error">
            Esta cuenta esta bloqueada o en solo lectura. Los datos no se borran.
          </Banner>
        ) : null}
        {params.updated ? <Banner tone="success">Cuenta actualizada.</Banner> : null}
        {params.payment ? <Banner tone="success">Pago aplicado.</Banner> : null}
        {params.error ? <Banner tone="error">{params.error}</Banner> : null}

      <section className="ct-ops-kpi-grid">
        <StatusCard
          icon={<WalletCards size={20} />}
          label="Estado"
          value={access.status}
          detail={access.canWrite ? "Puede editar datos" : "Edicion bloqueada"}
        />
        <StatusCard
          icon={<CalendarClock size={20} />}
          label="Vence"
          value={dateFormatter.format(access.subscription.expiresAt)}
          detail={`Gracia hasta ${dateFormatter.format(access.subscription.graceUntil)}`}
        />
        <StatusCard
          icon={<Lock size={20} />}
          label="Modo al vencer"
          value={lockModeLabel(access.subscription.lockMode)}
          detail="Si vence, tus datos se conservan y el acceso puede quedar limitado."
        />
      </section>

      <section className="ct-ops-panel p-5">
        <h3 className="ct-ops-title">Pagos y renovacion</h3>
        <p className="ct-ops-copy max-w-3xl">
          Los pagos, fechas de vencimiento y bloqueos los gestiona Control Total.
          Tu equipo no puede modificar estos datos desde esta cuenta. Si necesitas
          corregir una fecha o confirmar un pago, contacta al administrador de la
          plataforma.
        </p>
      </section>
      </div>
    </AppShell>
  );
}

function lockModeLabel(lockMode: string) {
  if (lockMode === "none") {
    return "Sin bloqueo";
  }
  if (lockMode === "full_lock") {
    return "Bloqueo total";
  }
  return "Solo lectura";
}

function StatusCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="ct-ops-kpi">
      <div className="flex items-center justify-between gap-3">
        <p className="ct-ops-kpi-label">{label}</p>
        <div className="ct-ops-icon">{icon}</div>
      </div>
      <p className="ct-ops-kpi-value">{value}</p>
      <p className="ct-ops-kpi-detail">{detail}</p>
    </div>
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
      className={`ct-ops-alert text-sm font-medium ${
        tone === "success"
          ? "is-ok"
          : "is-danger"
      }`}
    >
      {children}
    </div>
  );
}
