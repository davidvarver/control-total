import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  Database,
  History,
  Import,
  Lock,
  ShieldCheck,
  Store,
  Users,
  WalletCards,
  Warehouse,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import {
  getOrganizationAccess,
  requireCurrentUser,
} from "@/lib/server/auth-store";

type AccountTab = "personas" | "cuentas" | "bodegas" | "historial";

type AccountPageProps = {
  searchParams: Promise<{
    updated?: string;
    payment?: string;
    locked?: string;
    error?: string;
    tab?: string;
  }>;
};

const dateFormatter = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
});

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const user = await requireCurrentUser();
  const params = await searchParams;
  const access = await getOrganizationAccess(user.organizationId);
  const activeTab = normalizeAccountTab(params.tab);

  return (
    <AppShell
      active="cuenta"
      title="Cuenta"
      subtitle="Usuarios, conexiones, bodegas, historial y estado de acceso."
      eyebrow="Administracion"
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

        <AccountHero
          organization={user.organizationName}
          email={user.email}
          status={access.status}
          expiresAt={access.subscription.expiresAt}
          canWrite={access.canWrite}
        />

        <AccountTabs active={activeTab} />
        <AccountTabPanel active={activeTab} />

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
          <p className="ct-ops-copy mt-2 max-w-3xl">
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

function AccountHero({
  organization,
  email,
  status,
  expiresAt,
  canWrite,
}: {
  organization: string;
  email: string;
  status: string;
  expiresAt: Date;
  canWrite: boolean;
}) {
  return (
    <section className="ct-dashboard-hero grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:p-8">
      <div>
        <p className="ct-ops-kicker">Cuenta del cliente</p>
        <h2 className="ct-dashboard-hero-title mt-3">{organization}</h2>
        <p className="ct-dashboard-hero-copy mt-3 max-w-3xl">
          Administra quien entra, que cuentas de Mercado Libre estan conectadas,
          que bodegas alimentan inventario y donde revisar cambios sensibles.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link href="/meli" prefetch={false} className="ct-button ct-button-primary">
            <Store size={16} />
            Conectar Meli
          </Link>
          <Link href="/usuarios" prefetch={false} className="ct-button ct-button-secondary">
            <Users size={16} />
            Usuarios
          </Link>
          <Link href="/salud" prefetch={false} className="ct-button ct-button-secondary">
            <ShieldCheck size={16} />
            Salud
          </Link>
        </div>
      </div>

      <div className="ct-dashboard-hero-summary">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
          Acceso
        </p>
        <p className="mt-2 truncate text-lg font-black text-white">{email}</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <HeroStat label="Estado" value={status} />
          <HeroStat label="Edicion" value={canWrite ? "Activa" : "Bloqueada"} />
        </div>
        <p className="mt-4 rounded-[22px] border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-black text-slate-200">
          Vence {dateFormatter.format(expiresAt)}
        </p>
      </div>
    </section>
  );
}

const accountTabs: Array<{
  key: AccountTab;
  label: string;
  detail: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}> = [
  {
    key: "personas",
    label: "Personas",
    detail: "Usuarios, roles y permisos",
    icon: Users,
  },
  {
    key: "cuentas",
    label: "Cuentas",
    detail: "Meli, sincronizacion y carga",
    icon: Store,
  },
  {
    key: "bodegas",
    label: "Bodegas",
    detail: "Inventario y resurtido",
    icon: Warehouse,
  },
  {
    key: "historial",
    label: "Historial",
    detail: "Auditoria, salud y reportes",
    icon: History,
  },
];

function AccountTabs({ active }: { active: AccountTab }) {
  return (
    <nav className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label="Cuenta">
      {accountTabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.key === active;

        return (
          <Link
            key={tab.key}
            href={`/cuenta?tab=${tab.key}`}
            prefetch={false}
            className={`group rounded-[24px] border px-4 py-4 transition ${
              isActive
                ? "border-cyan-200/35 bg-cyan-100/12 text-white shadow-[0_20px_70px_rgba(103,232,249,0.12)]"
                : "border-white/10 bg-white/[0.045] text-slate-300 hover:bg-white/[0.075] hover:text-white"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="ct-ops-icon">
                <Icon size={18} />
              </div>
              <ArrowRight
                size={17}
                className="mt-1 text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-white"
              />
            </div>
            <p className="mt-4 text-base font-black">{tab.label}</p>
            <p className="mt-1 text-sm font-semibold text-slate-400">{tab.detail}</p>
          </Link>
        );
      })}
    </nav>
  );
}

function AccountTabPanel({ active }: { active: AccountTab }) {
  const cards = getAccountCards(active);

  return (
    <section className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
      {cards.map((card) => (
        <AccountActionCard key={card.href} {...card} />
      ))}
    </section>
  );
}

function getAccountCards(active: AccountTab) {
  if (active === "cuentas") {
    return [
      {
        title: "Mercado Libre",
        detail: "Conecta, reconecta, desconecta y revisa la ultima sincronizacion.",
        href: "/meli",
        icon: <Store size={20} />,
        tone: "green" as const,
      },
      {
        title: "Cargar datos",
        detail: "Sube inventario, costos, equivalencias y datos iniciales por Excel.",
        href: "/importar",
        icon: <Import size={20} />,
      },
      {
        title: "Diagnostico de sync",
        detail: "Revisa salud, cron jobs, retencion y preparacion para clientes grandes.",
        href: "/salud",
        icon: <ShieldCheck size={20} />,
        tone: "amber" as const,
      },
    ];
  }

  if (active === "bodegas") {
    return [
      {
        title: "Inventario",
        detail: "SKUs maestros, publicaciones ligadas, stock, costos y fotos.",
        href: "/inventario",
        icon: <Warehouse size={20} />,
        tone: "green" as const,
      },
      {
        title: "Resurtido",
        detail: "Sugerencias de compra segun ventas recientes y stock actual.",
        href: "/resurtido",
        icon: <Database size={20} />,
      },
      {
        title: "Pendientes",
        detail: "Equivalencias, costos y billing pendiente para cerrar numeros.",
        href: "/setup",
        icon: <ShieldCheck size={20} />,
        tone: "amber" as const,
      },
    ];
  }

  if (active === "historial") {
    return [
      {
        title: "Auditoria",
        detail: "Eventos sensibles, cambios y ventas que requieren revision tecnica.",
        href: "/auditoria",
        icon: <History size={20} />,
      },
      {
        title: "Reportes",
        detail: "Ventas, utilidad, resurtido, alertas y exportes en un solo lugar.",
        href: "/reportes",
        icon: <Database size={20} />,
        tone: "green" as const,
      },
      {
        title: "Salud",
        detail: "Retencion, backups, costos, seguridad y checklist del primer cliente.",
        href: "/salud",
        icon: <ShieldCheck size={20} />,
        tone: "amber" as const,
      },
    ];
  }

  return [
    {
      title: "Usuarios",
      detail: "Invita equipo, cambia roles y controla permisos por persona.",
      href: "/usuarios",
      icon: <Users size={20} />,
      tone: "green" as const,
    },
    {
      title: "Configuracion",
      detail: "Accesos secundarios, herramientas tecnicas y ajustes de la cuenta.",
      href: "/configuracion",
      icon: <Lock size={20} />,
    },
    {
      title: "Guia de uso",
      detail: "Orden recomendado para cargar datos, resolver pendientes y operar.",
      href: "/guia",
      icon: <ShieldCheck size={20} />,
    },
  ];
}

function normalizeAccountTab(value?: string): AccountTab {
  if (
    value === "personas" ||
    value === "cuentas" ||
    value === "bodegas" ||
    value === "historial"
  ) {
    return value;
  }

  return "personas";
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-white/10 bg-black/15 px-3 py-3">
      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 truncate text-base font-black text-white">{value}</p>
    </div>
  );
}

function AccountActionCard({
  title,
  detail,
  href,
  icon,
  tone = "neutral",
}: {
  title: string;
  detail: string;
  href: string;
  icon: React.ReactNode;
  tone?: "neutral" | "green" | "amber" | "red";
}) {
  const toneClass = {
    neutral: "",
    green: "is-ok",
    amber: "is-warn",
    red: "is-danger",
  }[tone];

  return (
    <Link href={href} prefetch={false} className={`ct-ops-kpi group ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="ct-ops-icon">{icon}</div>
        <ArrowRight
          size={18}
          className="mt-1 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-white"
        />
      </div>
      <h2 className="ct-ops-title mt-4">{title}</h2>
      <p className="ct-ops-copy mt-2">{detail}</p>
    </Link>
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
        tone === "success" ? "is-ok" : "is-danger"
      }`}
    >
      {children}
    </div>
  );
}
