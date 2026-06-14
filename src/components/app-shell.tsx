import Link from "next/link";
import {
  Activity,
  BarChart3,
  ChevronDown,
  ClipboardCheck,
  FileSpreadsheet,
  Shield,
  LayoutDashboard,
  LogOut,
  PackageSearch,
  Settings,
  ShoppingCart,
  Warehouse,
} from "lucide-react";
import { ControlAssistantLoader } from "@/components/control-assistant-loader";
import { GlobalSearch } from "@/components/global-search";
import { isPlatformAdminEmail } from "@/lib/server/auth-store";

type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  key: string;
  aliases?: string[];
  platformOnly?: boolean;
};

const navGroups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Principal",
    items: [
      {
        href: "/dashboard",
        label: "Inicio",
        description: "Resumen y guia",
        icon: LayoutDashboard,
        key: "dashboard",
        aliases: ["dashboard", "guia", "buscar"],
      },
      {
        href: "/setup",
        label: "Pendientes",
        description: "Pendientes que bloquean",
        icon: ClipboardCheck,
        key: "setup",
        aliases: ["setup"],
      },
      {
        href: "/inventario",
        label: "Inventario",
        description: "Stock y costos por SKU",
        icon: Warehouse,
        key: "inventario",
        aliases: ["inventario"],
      },
      {
        href: "/ventas",
        label: "Ventas",
        description: "Ordenes y dinero recibido",
        icon: ShoppingCart,
        key: "ventas",
        aliases: ["ventas"],
      },
      {
        href: "/reportes",
        label: "Reportes",
        description: "Utilidad, alertas y exportes",
        icon: FileSpreadsheet,
        key: "reportes",
        aliases: ["reportes", "utilidad", "resurtido", "alertas"],
      },
      {
        href: "/configuracion",
        label: "Configuracion",
        description: "Datos, Meli, usuarios y cuenta",
        icon: Settings,
        key: "configuracion",
        aliases: ["configuracion", "importar", "meli", "usuarios", "cuenta", "salud", "auditoria", "admin"],
      },
    ],
  },
  {
    label: "Plataforma",
    items: [
      {
        href: "/admin",
        label: "Admin",
        description: "Cuentas y pagos",
        icon: Shield,
        key: "admin",
        aliases: ["admin"],
        platformOnly: true,
      },
      {
        href: "/salud",
        label: "Diagnostico",
        description: "Estado tecnico",
        icon: Activity,
        key: "salud",
        aliases: ["salud"],
        platformOnly: true,
      },
    ],
  },
];

function isNavItemActive(item: NavItem, active: string) {
  return item.key === active || item.aliases?.includes(active) === true;
}

export function AppShell({
  active,
  title,
  subtitle,
  organization,
  userEmail,
  children,
  actions,
  platformMode = false,
  chrome = "standard",
  eyebrow,
}: {
  active: string;
  title: string;
  subtitle: string;
  organization: string;
  userEmail: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  platformMode?: boolean;
  chrome?: "standard" | "compact";
  eyebrow?: string;
}) {
  const visibleNavGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (platformMode) {
          return item.platformOnly === true;
        }

        return item.platformOnly !== true || isPlatformAdminEmail(userEmail);
      }),
    }))
    .filter((group) => group.items.length > 0);
  const mobileNavItems = visibleNavGroups.flatMap((group) => group.items);
  const activeGroupLabel =
    mobileNavItems.find((item) => isNavItemActive(item, active))?.label ?? "Control";
  const showPageHeading = chrome !== "compact";
  const defaultActions = platformMode ? null : (
    <>
      <Link href="/setup" prefetch={false} className="ct-button ct-button-secondary">
        <ClipboardCheck size={16} />
        Pendientes
      </Link>
      <Link href="/inventario" prefetch={false} className="ct-button ct-button-secondary">
        <Warehouse size={16} />
        Inventario
      </Link>
      <Link href="/ventas" prefetch={false} className="ct-button ct-button-secondary">
        <ShoppingCart size={16} />
        Ventas
      </Link>
    </>
  );
  const actionContent = actions ?? defaultActions;

  return (
    <main className="ct-dark-app min-h-screen overflow-x-hidden text-slate-50">
      <aside className="ct-sidebar-shell fixed inset-y-0 left-0 z-40 hidden w-[320px] flex-col px-6 py-8 text-white lg:flex">
        <div className="px-1">
          <Link href="/dashboard" prefetch={false} className="flex items-center gap-3">
            <div className="ct-brand-mark flex h-12 w-12 items-center justify-center rounded-full text-blue-100">
              <PackageSearch size={20} />
            </div>
            <div>
              <h1 className="ct-brand-title text-xl font-black leading-tight">Control Total</h1>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400">
                Mercado Libre Seller
              </p>
            </div>
          </Link>
        </div>

        <nav className="ct-sidebar-nav mt-10 space-y-8 overflow-y-auto pr-1">
          {visibleNavGroups.map((group) =>
            group.items.length > 0 ? (
              <div key={group.label}>
                <p className="mb-3 px-2 text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">
                  {group.label}
                </p>
                <div className="space-y-2">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = isNavItemActive(item, active);

                    return (
                      <Link
                        key={item.key}
                        href={item.href}
                        prefetch={false}
                        aria-current={isActive ? "page" : undefined}
                        className={`group flex min-h-12 items-center gap-3 rounded-full px-4 py-3 text-[15px] font-black transition-all duration-200 ${
                          isActive
                            ? "text-white"
                            : "text-slate-400 hover:bg-white/[0.06] hover:text-white"
                        }`}
                      >
                        <Icon
                          size={19}
                          className={isActive ? "text-white" : "text-slate-500 transition-colors group-hover:text-slate-200"}
                        />
                        <span className="min-w-0">
                          <span className="block leading-5">{item.label}</span>
                          <span
                            className={`hidden truncate text-[11px] font-semibold leading-4 ${
                              isActive ? "text-white/70" : "text-slate-500"
                            }`}
                          >
                            {item.description}
                          </span>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ) : null,
          )}
        </nav>

        <div className="mt-auto border-t border-white/10 pt-4">
          <div className="ct-sidebar-org rounded-[22px] px-4 py-4">
            <p className="text-[9px] font-extrabold uppercase text-blue-200">
              Organizacion
            </p>
            <p className="mt-1 truncate text-sm font-black text-white">
              {organization}
            </p>
          </div>
          <form action="/api/auth/logout" method="post" className="mt-3">
            <button className="flex w-full items-center justify-center gap-3 rounded-[20px] border border-white/10 bg-white/[0.045] px-3 py-3 text-sm font-black text-slate-300 transition hover:bg-red-400/10 hover:text-red-200 active:scale-[0.98]">
              <LogOut size={18} />
              Salir
            </button>
          </form>
        </div>
      </aside>

      <header
        className={`ct-app-header sticky top-0 z-30 bg-transparent lg:fixed lg:left-[320px] lg:right-0 ${
          chrome === "compact" ? "lg:h-[94px]" : "lg:h-[94px]"
        }`}
      >
        <div
          className={`ct-topbar-shell mx-3 mt-3 grid gap-3 px-4 py-3 sm:mx-4 sm:px-5 lg:mx-8 lg:mt-6 lg:items-center lg:px-0 ${
            chrome === "compact"
              ? "lg:h-12 lg:grid-cols-[minmax(0,1fr)_auto] lg:py-0"
              : "lg:h-12 lg:grid-cols-[minmax(0,1fr)_auto] lg:py-0"
          }`}
        >
          {chrome === "compact" ? (
            <div className="hidden min-w-0 lg:block" aria-hidden="true" />
          ) : (
            <div className="hidden min-w-0 items-center gap-2 lg:flex">
              <div className="ct-context-pill inline-flex min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-slate-300">
                <BarChart3 size={14} className="text-[var(--secondary)]" />
                <span className="truncate">{organization}</span>
                <span className="text-slate-300">/</span>
                <span className="text-slate-500">{activeGroupLabel}</span>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-start justify-start gap-3 lg:justify-end">
            <GlobalSearch />
            {actionContent ? (
              <details className="group relative">
                <summary className="ct-button ct-button-primary cursor-pointer">
                  Acciones
                  <ChevronDown size={15} className="transition group-open:rotate-180" />
                </summary>
                <div className="absolute right-0 z-50 mt-2.5 w-[min(92vw,560px)] rounded-lg border border-white/10 bg-[#121827]/95 p-4 shadow-lg ring-1 ring-white/10 backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="flex flex-wrap items-center gap-2">{actionContent}</div>
                </div>
              </details>
            ) : null}
            <div className="ct-account-pill flex h-12 max-w-[250px] items-center rounded-full px-4 text-xs font-black text-slate-100 transition-all hover:text-white cursor-default">
              <span className="h-2 w-2 rounded-full bg-emerald-500 mr-2.5 ct-active-glow"></span>
              <span className="truncate">{userEmail}</span>
            </div>
          </div>
        </div>
        <nav className="ct-mobile-nav mx-3 mt-2 flex gap-1 overflow-x-auto rounded-lg px-3 py-2 lg:hidden">
          {mobileNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = isNavItemActive(item, active);

            return (
              <Link
                key={item.key}
                href={item.href}
                prefetch={false}
                aria-current={isActive ? "page" : undefined}
                className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition-all ${
                  isActive
                    ? "bg-white/[0.12] text-white ring-1 ring-white/15"
                    : "border border-white/10 bg-white/[0.06] text-slate-300 hover:text-white"
                }`}
              >
                <Icon size={16} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <div className={`lg:ml-[320px] ${chrome === "compact" ? "lg:pt-[94px]" : "lg:pt-[94px]"}`}>
        <div className="ct-content-frame mx-auto max-w-[1720px] space-y-7 px-4 py-5 sm:px-6 lg:px-10">
          {showPageHeading ? (
            <section className="ct-page-heading">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-400 lg:hidden">
                  <BarChart3 size={14} className="text-[var(--secondary)]" />
                  <span className="truncate">{organization}</span>
                  <span className="text-slate-300">/</span>
                  <span>{activeGroupLabel}</span>
                </div>
                <p className="hidden text-[11px] font-black uppercase tracking-[0.16em] text-blue-200 lg:block">
                  {eyebrow ?? activeGroupLabel}
                </p>
                <h2 className="mt-1 text-4xl font-black leading-tight text-white lg:text-[44px]">
                  {title}
                </h2>
                <p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-slate-400">
                  {subtitle}
                </p>
              </div>
            </section>
          ) : null}
          {children}
        </div>
      </div>
      {!platformMode ? <ControlAssistantLoader /> : null}
    </main>
  );
}
