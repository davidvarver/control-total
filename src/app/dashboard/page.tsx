export const dynamic = "force-dynamic";

import Link from "next/link";
import { Suspense } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BadgeDollarSign,
  BarChart3,
  Boxes,
  CalendarDays,
  ClipboardCheck,
  Filter,
  Link2,
  PackageCheck,
  ShoppingCart,
  TrendingUp,
  Warehouse,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import {
  type CurrentUser,
  requirePermission,
  userHasPermission,
} from "@/lib/server/auth-store";
import { buildDashboardPageData } from "@/lib/server/dashboard-store";

const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});
const number = new Intl.NumberFormat("es-MX");

type HomeProps = {
  searchParams: Promise<{
    error?: string;
    sku_mappings?: string;
    inventory_products?: string;
  }>;
};

type DashboardPayload = Awaited<ReturnType<typeof buildDashboardPageData>>;
type DashboardData = DashboardPayload["dashboard"];
type DashboardStatus = DashboardPayload["status"];
type UnmappedSkuRow = DashboardStatus["unmappedSkus"][number];

export default async function Home({ searchParams }: HomeProps) {
  const user = await requirePermission("dashboard.view");
  const canViewHealth = userHasPermission(user, "health.view");
  return (
    <AppShell
      active="dashboard"
      title="Dashboard"
      subtitle="Lo importante de ventas, inventario y riesgos en una sola vista."
      eyebrow="Operacion"
      organization={user.organizationName}
      userEmail={user.email}
      chrome="compact"
      actions={
        <>
          {canViewHealth ? (
            <Link
              href="/salud"
              prefetch={false}
              className="ct-button ct-button-secondary"
            >
              <Activity size={16} />
              Ver estado
            </Link>
          ) : null}
          <Link
            href="/alertas"
            prefetch={false}
            className="ct-button ct-button-secondary"
          >
            <AlertTriangle size={16} />
            Alertas
          </Link>
          <Link
            href="/setup"
            prefetch={false}
            className="ct-button ct-button-primary"
          >
            <ClipboardCheck size={16} />
            Ver pendientes
          </Link>
        </>
      }
    >
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent searchParams={searchParams} user={user} />
      </Suspense>
    </AppShell>
  );
}

async function DashboardContent({
  searchParams,
  user,
}: HomeProps & { user: CurrentUser }) {
  const params = await searchParams;
  const { dashboard, status } = await buildDashboardPageData({
    organizationId: user.organizationId,
    organizationName: user.organizationName,
  });
  const canViewSales = userHasPermission(user, "sales.view");
  const canViewInventory = userHasPermission(user, "inventory.view");
  const canViewProfit = userHasPermission(user, "profit.view");
  const canViewSkuPending = canViewSales || canViewInventory;
  const pendingRows = buildPendingRows({
    dashboard,
    status,
    canViewInventory,
    canViewProfit,
    canViewSales,
  });
  const pendingTotal = pendingRows.reduce((sum, row) => sum + row.count, 0);
  const unmappedSkuRows = canViewSkuPending ? status.unmappedSkus.slice(0, 3) : [];
  const hasUnmappedSkuFocus = canViewSkuPending && status.counts.unmappedSkus > 0;
  const dayRoiText = truncatePercent(dashboard.currentDay.roiPercent);
  const todayDate = new Date();
  const yesterdayDate = addDays(todayDate, -1);
  const weekFromDate = addDays(todayDate, -6);
  const todayInput = formatDateInput(todayDate);
  const yesterdayInput = formatDateInput(yesterdayDate);
  const weekFromInput = formatDateInput(weekFromDate);
  const todayDisplay = formatDateDisplay(todayDate);

  return (
    <div className="space-y-6">
      <Messages params={params} />

      <DashboardHero
        organization={user.organizationName}
        todayDisplay={todayDisplay}
        month={dashboard.currentMonth.month}
        orders={canViewSales ? dashboard.currentDay.orders : null}
        pendingTotal={pendingTotal}
        roiText={canViewProfit ? dayRoiText : "Privado"}
        unmappedSkus={canViewSkuPending ? status.counts.unmappedSkus : null}
      />

      <DashboardRangeBar
        month={dashboard.currentMonth.month}
        today={todayInput}
        yesterday={yesterdayInput}
        weekFrom={weekFromInput}
        todayDisplay={todayDisplay}
      />

      <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        <DashboardKpi
          label="Venta hoy"
          value={
            canViewSales
              ? money.format(dashboard.currentDay.grossMeliSales)
              : "Privado"
          }
          detail={
            canViewSales
              ? `${number.format(dashboard.currentDay.orders)} ordenes`
              : "Requiere permiso de ventas"
          }
          icon={<ShoppingCart size={22} />}
          href={canViewSales ? "/ventas" : "/dashboard"}
          tone="blue"
        />
        <DashboardKpi
          label="Recibido hoy"
          value={
            canViewProfit
              ? money.format(dashboard.currentDay.receivedConfirmed)
              : "Privado"
          }
          detail={
            canViewProfit
              ? "Dinero confirmado por Meli"
              : "Requiere permiso financiero"
          }
          icon={<BadgeDollarSign size={22} />}
          href={canViewProfit ? "/utilidad" : "/dashboard"}
          tone="neutral"
        />
        <DashboardKpi
          label="Utilidad hoy"
          value={
            canViewProfit
              ? money.format(dashboard.currentDay.netProfit)
              : "Privado"
          }
          detail={canViewProfit ? `ROI ${dayRoiText}` : "Requiere permiso financiero"}
          icon={<TrendingUp size={22} />}
          href={canViewProfit ? "/utilidad" : "/dashboard"}
          tone={
            canViewProfit
              ? dashboard.currentDay.netProfit >= 0 ? "green" : "red"
              : "neutral"
          }
        />
        <DashboardKpi
          label="Pendientes"
          value={number.format(pendingTotal)}
          detail={
            canViewSkuPending
              ? `${number.format(status.counts.unmappedSkus)} SKU sin mapear`
              : "Segun tus permisos"
          }
          icon={<AlertTriangle size={22} />}
          href="/setup"
          tone={pendingTotal > 0 ? "red" : "green"}
        />
      </section>

      <section className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="ct-dashboard-panel overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-white/10 px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase text-blue-200">
                {hasUnmappedSkuFocus ? "Operacion critica" : "Operacion diaria"}
              </p>
              <h2 className="mt-1 text-2xl font-black text-white">
                {hasUnmappedSkuFocus ? "Detalle de SKUs sin mapear" : "Detalle de pendientes"}
              </h2>
              <p className="mt-1 max-w-2xl text-sm font-semibold text-slate-400">
                {hasUnmappedSkuFocus
                  ? "Vincula publicaciones importadas con inventario maestro para sincronizar stock y utilidad."
                  : "Lo que puede frenar inventario, utilidad o sincronizacion. Todo lleva a su pantalla real."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/setup" prefetch={false} className="ct-button ct-button-secondary">
                <Filter size={16} />
                Filtrar
              </Link>
              <Link href="/setup#mapear" prefetch={false} className="ct-button ct-button-primary">
                <Link2 size={16} />
                Mapear
              </Link>
            </div>
          </div>

          {hasUnmappedSkuFocus ? (
            <UnmappedSkuFocusTable
              rows={unmappedSkuRows}
              fallbackCount={status.counts.unmappedSkus}
            />
          ) : (
            <PendingFocusTable rows={pendingRows} />
          )}

          <Link
            href="/setup"
            prefetch={false}
            className="flex items-center justify-center gap-2 border-t border-white/10 px-4 py-4 text-sm font-black text-slate-300 transition hover:bg-white/[0.05] hover:text-white"
          >
            Ver todos los pendientes
            <ArrowRight size={15} />
          </Link>
        </div>

        <div className="ct-dashboard-danger-panel">
          <div className="border-b border-white/10 px-5 py-5">
            <p className="text-xs font-black uppercase text-red-200">
              Riesgos del negocio
            </p>
            <h2 className="mt-1 text-xl font-black text-white">
              Lo que puede pegarle a caja
            </h2>
          </div>
          <div className="space-y-2.5 p-4">
            {canViewProfit ? (
              <RiskPill
                href={`/utilidad?month=${encodeURIComponent(dashboard.currentMonth.month)}#ventas-con-perdida`}
                label="Ventas con perdida hoy"
                value={dashboard.currentDay.lossOrders}
                tone="red"
              />
            ) : null}
            {canViewInventory ? (
              <>
                <RiskPill
                  href="/inventario?stock=negative"
                  label="Stock negativo"
                  value={dashboard.kpis.negativeStock}
                  tone="red"
                />
                <RiskPill
                  href="/resurtido"
                  label="Stock bajo"
                  value={dashboard.kpis.lowStock}
                  tone="amber"
                />
              </>
            ) : null}
            {canViewProfit ? (
              <RiskPill
                href="/alertas"
                label="Cargos raros / Full"
                value={dashboard.kpis.rareCharges + dashboard.kpis.fullAuditAlerts}
                tone="neutral"
              />
            ) : null}
            {!canViewInventory && !canViewProfit ? (
              <div className="rounded-lg border border-white/10 bg-white/[0.055] px-3 py-4 text-sm font-semibold text-slate-400">
                No tienes riesgos privados asignados.
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="ct-dashboard-panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-5">
            <div>
              <p className="text-xs font-black uppercase text-blue-200">
                Flujo de ordenes
              </p>
              <h2 className="mt-1 text-xl font-black text-white">
                Productos que mas vendieron hoy
              </h2>
            </div>
            {canViewProfit ? (
              <Link href="/utilidad" prefetch={false} className="ct-button ct-button-secondary">
                Ver utilidad
              </Link>
            ) : null}
          </div>
          <div className="divide-y divide-white/[0.08]">
            {canViewSales && dashboard.todayTopProducts.slice(0, 5).map((product, index) => (
              <Link
                key={product.masterSku}
                href={`/inventario/${encodeURIComponent(product.masterSku)}`}
                prefetch={false}
                className="grid gap-4 px-5 py-4 transition hover:bg-white/[0.045] md:grid-cols-[52px_minmax(0,1fr)_160px_140px]"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/10 bg-white/[0.07] text-sm font-black text-blue-100">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-black text-white">{product.title}</p>
                  <p className="mt-1 font-mono text-xs font-bold text-slate-400">
                    {product.masterSku}
                  </p>
                </div>
                <p className="font-black text-white md:text-right">
                  {number.format(product.soldUnits)} pzas
                </p>
                <p className="font-black text-white md:text-right">
                  {canViewProfit ? money.format(product.grossAmount) : "Privado"}
                </p>
              </Link>
            ))}
            {!canViewSales ? (
              <p className="px-5 py-8 text-sm font-semibold text-slate-400">
                Requiere permiso de ventas para ver este ranking.
              </p>
            ) : dashboard.todayTopProducts.length === 0 ? (
              <p className="px-5 py-8 text-sm font-semibold text-slate-400">
                Aun no hay ventas de hoy para rankear productos.
              </p>
            ) : null}
          </div>
        </div>

        <div className="ct-dashboard-panel p-5">
          <p className="text-xs font-black uppercase text-blue-200">
            Inventario
          </p>
          <h2 className="mt-1 text-xl font-black text-white">
            Salud operativa
          </h2>
          <div className="mt-5 grid gap-3">
            <MiniMetric
              label="Valor inventario"
              value={canViewProfit ? money.format(dashboard.kpis.inventoryValue) : "Privado"}
            />
            <MiniMetric
              label="Stock fisico"
              value={canViewInventory ? number.format(dashboard.kpis.totalStock) : "Privado"}
            />
            <MiniMetric
              label="SKUs online"
              value={canViewInventory ? number.format(dashboard.kpis.onlineSkus) : "Privado"}
            />
            <MiniMetric
              label="Full detectado"
              value={canViewInventory ? number.format(dashboard.kpis.fullStock) : "Privado"}
            />
          </div>
          {canViewInventory ? (
            <Link
              href="/inventario"
              prefetch={false}
              className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-white/[0.12] bg-white/[0.07] text-sm font-black text-white transition hover:bg-white/[0.11]"
            >
              Abrir inventario
              <ArrowRight size={15} />
            </Link>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function DashboardHero({
  organization,
  todayDisplay,
  month,
  orders,
  pendingTotal,
  roiText,
  unmappedSkus,
}: {
  organization: string;
  todayDisplay: string;
  month: string;
  orders: number | null;
  pendingTotal: number;
  roiText: string;
  unmappedSkus: number | null;
}) {
  return (
    <section className="ct-dashboard-hero grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:p-8">
      <div className="min-w-0">
        <p className="ct-ops-kicker">Centro operativo</p>
        <h2 className="ct-dashboard-hero-title mt-3">
          Resumen operativo
        </h2>
        <p className="ct-dashboard-hero-copy mt-3 max-w-3xl">
          Venta, utilidad, inventario y pendientes reales para decidir que corregir primero.
        </p>
        <p className="mt-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
          Cuenta {organization}
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link href="/setup" prefetch={false} className="ct-button ct-button-primary">
            <ClipboardCheck size={16} />
            Resolver pendientes
          </Link>
          <Link href="/reportes" prefetch={false} className="ct-button ct-button-secondary">
            <BarChart3 size={16} />
            Ver reportes
          </Link>
          <Link href="/meli" prefetch={false} className="ct-button ct-button-secondary">
            <Link2 size={16} />
            Conexiones
          </Link>
        </div>
      </div>

      <div className="ct-dashboard-hero-summary">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
              Periodo
            </p>
            <p className="mt-1 text-lg font-black text-white">{todayDisplay}</p>
            <p className="text-sm font-semibold text-slate-400">{formatMonthLabel(month)}</p>
          </div>
          <CalendarDays size={22} className="text-blue-100" />
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2">
          <HeroMiniMetric
            label="Ordenes"
            value={orders === null ? "Privado" : number.format(orders)}
          />
          <HeroMiniMetric label="Pendientes" value={number.format(pendingTotal)} />
          <HeroMiniMetric label="ROI" value={roiText} />
        </div>
        <Link
          href="/setup#mapear"
          prefetch={false}
          className="mt-4 flex items-center justify-between rounded-[22px] border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-black text-slate-200 transition hover:bg-white/[0.1] hover:text-white"
        >
          <span>SKUs sin mapear</span>
          <span>{unmappedSkus === null ? "Privado" : number.format(unmappedSkus)}</span>
        </Link>
      </div>
    </section>
  );
}

function HeroMiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-white/10 bg-black/15 px-3 py-3">
      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 truncate text-lg font-black text-white">{value}</p>
    </div>
  );
}

function DashboardRangeBar({
  month,
  today,
  yesterday,
  weekFrom,
  todayDisplay,
}: {
  month: string;
  today: string;
  yesterday: string;
  weekFrom: string;
  todayDisplay: string;
}) {
  return (
    <section className="ct-dashboard-rangebar">
      <div className="ct-dashboard-period">
        <Link href="/dashboard" prefetch={false}>
          Hoy
        </Link>
        <Link href={`/ventas?from=${yesterday}&to=${yesterday}`} prefetch={false}>
          Ayer
        </Link>
        <Link href={`/ventas?from=${weekFrom}&to=${today}`} prefetch={false}>
          Semana
        </Link>
        <Link href={`/utilidad?month=${encodeURIComponent(month)}`} prefetch={false}>
          Mes
        </Link>
      </div>
      <div className="ct-dashboard-date-pair">
        <label>
          <span>Desde</span>
          <span className="ct-dashboard-date-display">
            {todayDisplay}
            <CalendarDays size={15} />
          </span>
        </label>
        <label>
          <span>Hasta</span>
          <span className="ct-dashboard-date-display">
            {todayDisplay}
            <CalendarDays size={15} />
          </span>
        </label>
      </div>
    </section>
  );
}

function UnmappedSkuFocusTable({
  rows,
  fallbackCount,
}: {
  rows: UnmappedSkuRow[];
  fallbackCount: number;
}) {
  const displayRows =
    rows.length > 0
      ? rows
      : [
          {
            orderId: "",
            externalSku: `${number.format(fallbackCount)} SKU sin mapear`,
            title: "Publicaciones detectadas sin SKU maestro",
          },
        ];

  return (
    <div className="overflow-x-auto border-0 bg-transparent shadow-none">
      <table className="w-full min-w-[780px] text-left">
        <thead>
          <tr>
            <th>Producto</th>
            <th>SKU externo</th>
            <th>Marketplace</th>
            <th>Impacto</th>
            <th className="text-right">Accion</th>
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row) => {
            const externalSku = row.externalSku || "SIN_SKU";
            const title = row.title || externalSku;
            const initials = title
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((part) => part[0]?.toUpperCase())
              .join("") || "SKU";

            return (
              <tr key={`${externalSku}-${title}`}>
                <td>
                  <div className="flex items-center gap-3">
                    <span className="ct-dashboard-product-avatar">
                      {initials}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-black text-white">{title}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-400">
                        Publicacion detectada sin SKU maestro
                      </p>
                    </div>
                  </div>
                </td>
                <td>
                  <code className="rounded-md border border-white/10 bg-white/[0.06] px-2 py-1 text-xs font-black text-blue-100">
                    {externalSku}
                  </code>
                </td>
                <td>
                  <span className="ct-dashboard-chip">Mercado Libre</span>
                </td>
                <td>
                  <p className="font-black text-white">No descuenta stock</p>
                  <p className="text-xs font-semibold text-slate-500">utilidad incompleta</p>
                </td>
                <td className="text-right">
                  <Link
                    href={`/setup#mapear`}
                    prefetch={false}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-blue-200/30 bg-blue-200/12 px-3 text-sm font-black text-blue-100 transition hover:bg-blue-200/20"
                  >
                    Mapear
                    <ArrowRight size={14} />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PendingFocusTable({ rows }: { rows: ReturnType<typeof buildPendingRows> }) {
  return (
    <div className="overflow-x-auto border-0 bg-transparent shadow-none">
      <table className="w-full min-w-[780px] text-left">
        <thead>
          <tr>
            <th>Problema</th>
            <th>Modulo</th>
            <th>Impacto</th>
            <th>Estado</th>
            <th className="text-right">Accion</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td>
                <div className="flex items-center gap-3">
                  <span className={`ct-dashboard-row-icon ${row.iconTone}`}>
                    {row.icon}
                  </span>
                  <div>
                    <p className="font-black text-white">{row.label}</p>
                    <p className="mt-1 max-w-lg text-xs font-semibold text-slate-400">
                      {row.detail}
                    </p>
                  </div>
                </div>
              </td>
              <td>
                <span className="ct-dashboard-chip">{row.module}</span>
              </td>
              <td>
                <p className="text-lg font-black text-white">
                  {number.format(row.count)}
                </p>
                <p className="text-xs font-semibold text-slate-500">{row.impact}</p>
              </td>
              <td>
                <span className={`ct-dashboard-status ${row.statusTone}`}>
                  {row.status}
                </span>
              </td>
              <td className="text-right">
                <Link
                  href={row.href}
                  prefetch={false}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-blue-200/25 bg-blue-200/10 px-3 text-sm font-black text-blue-100 transition hover:bg-blue-200/[0.18]"
                >
                  Abrir
                  <ArrowRight size={14} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Messages({
  params,
}: {
  params: Awaited<HomeProps["searchParams"]>;
}) {
  return (
    <>
      {params.error ? (
        <div className="rounded-lg border border-red-300/30 bg-red-500/12 px-4 py-3 text-sm font-semibold text-red-100">
          {params.error}
        </div>
      ) : null}
      {params.sku_mappings ? (
        <div className="rounded-lg border border-emerald-300/30 bg-emerald-500/12 px-4 py-3 text-sm font-semibold text-emerald-100">
          Se importaron {params.sku_mappings} equivalencias y se remapearon las ordenes existentes.
        </div>
      ) : null}
      {params.inventory_products ? (
        <div className="rounded-lg border border-emerald-300/30 bg-emerald-500/12 px-4 py-3 text-sm font-semibold text-emerald-100">
          Se importaron {params.inventory_products} productos de inventario.
        </div>
      ) : null}
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div
            key={item}
            className="h-44 animate-pulse rounded-lg border border-white/10 bg-white/[0.06]"
          />
        ))}
      </section>
      <section className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="h-[420px] animate-pulse rounded-lg border border-white/10 bg-white/[0.06]" />
        <div className="h-[420px] animate-pulse rounded-lg border border-white/10 bg-white/[0.06]" />
      </section>
    </div>
  );
}

function DashboardKpi({
  label,
  value,
  detail,
  icon,
  href,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  href: string;
  tone: "neutral" | "blue" | "green" | "red";
}) {
  const toneStyles = {
    neutral: {
      card: "border-white/[0.12] bg-white/[0.065]",
      icon: "bg-white/[0.08] text-slate-200",
      tag: "text-slate-300",
      bar: "bg-slate-300/70",
    },
    blue: {
      card: "border-blue-200/20 bg-blue-300/[0.09]",
      icon: "bg-blue-200/12 text-blue-100",
      tag: "text-blue-100",
      bar: "bg-blue-200",
    },
    green: {
      card: "border-emerald-300/20 bg-emerald-300/[0.08]",
      icon: "bg-emerald-300/12 text-emerald-100",
      tag: "text-emerald-100",
      bar: "bg-emerald-300",
    },
    red: {
      card: "border-red-300/25 bg-red-400/[0.16]",
      icon: "bg-red-200/14 text-red-100",
      tag: "text-red-100",
      bar: "bg-red-300",
    },
  }[tone];

  return (
    <Link
      href={href}
      prefetch={false}
      className={`group flex min-h-44 flex-col justify-between rounded-lg border p-5 shadow-[0_18px_42px_rgba(0,0,0,0.22)] transition hover:-translate-y-0.5 hover:border-blue-200/[0.35] hover:bg-white/[0.09] ${toneStyles.card}`}
    >
      <div className="flex items-start justify-between gap-4">
        <span className={`flex h-12 w-12 items-center justify-center rounded-lg ${toneStyles.icon}`}>
          {icon}
        </span>
        <span className={`rounded-full bg-white/[0.08] px-3 py-1 text-xs font-black ${toneStyles.tag}`}>
          Actual
        </span>
      </div>
      <div>
        <p className="text-sm font-black text-slate-400">{label}</p>
        <p className="mt-2 break-words text-[clamp(1.6rem,2.5vw,2.15rem)] font-black leading-tight text-white">
          {value}
        </p>
        <p className="mt-2 text-sm font-semibold text-slate-400">{detail}</p>
      </div>
      <span className="mt-4 h-1 overflow-hidden rounded-full bg-white/[0.12]">
        <span className={`block h-full w-full rounded-full ${toneStyles.bar}`} />
      </span>
    </Link>
  );
}

function RiskPill({
  label,
  value,
  href,
  tone,
}: {
  label: string;
  value: number;
  href: string;
  tone: "red" | "amber" | "neutral";
}) {
  const styles = {
    red: value > 0
      ? "border-red-300/20 bg-red-300/12 text-red-100"
      : "border-white/10 bg-white/[0.055] text-slate-400",
    amber: value > 0
      ? "border-amber-300/25 bg-amber-300/12 text-amber-100"
      : "border-white/10 bg-white/[0.055] text-slate-400",
    neutral: value > 0
      ? "border-white/[0.14] bg-white/[0.08] text-white"
      : "border-white/10 bg-white/[0.055] text-slate-400",
  }[tone];

  return (
    <Link
      href={href}
      prefetch={false}
      className={`flex min-h-12 items-center justify-between gap-3 rounded-lg border px-3 text-sm font-black transition hover:bg-white/[0.12] ${styles}`}
    >
      <span>{label}</span>
      <span className="text-xl">{number.format(value)}</span>
    </Link>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.055] px-4 py-3">
      <p className="text-xs font-black uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black text-white">{value}</p>
    </div>
  );
}

function buildPendingRows({
  dashboard,
  status,
  canViewInventory,
  canViewProfit,
  canViewSales,
}: {
  dashboard: DashboardData;
  status: DashboardStatus;
  canViewInventory: boolean;
  canViewProfit: boolean;
  canViewSales: boolean;
}) {
  return [
    canViewSales || canViewInventory
      ? {
      label: "SKUs sin mapear",
      detail: "Ventas que todavia no saben que producto maestro descuentan.",
      module: "Mercado Libre",
      count: status.counts.unmappedSkus,
      impact: "utilidad e inventario",
      status: status.counts.unmappedSkus > 0 ? "Critico" : "Limpio",
      href: "/setup#mapear",
      icon: <Link2 size={18} />,
      iconTone: status.counts.unmappedSkus > 0 ? "is-red" : "is-green",
      statusTone: status.counts.unmappedSkus > 0 ? "is-red" : "is-green",
        }
      : null,
    canViewProfit
      ? {
      label: "Productos sin costo",
      detail: "Sin costo promedio la utilidad puede verse inflada.",
      module: "Inventario",
      count: dashboard.kpis.productsWithoutCost,
      impact: "margen real",
      status: dashboard.kpis.productsWithoutCost > 0 ? "Pendiente" : "Limpio",
      href: "/inventario?stock=no_cost",
      icon: <BadgeDollarSign size={18} />,
      iconTone: dashboard.kpis.productsWithoutCost > 0 ? "is-amber" : "is-green",
      statusTone: dashboard.kpis.productsWithoutCost > 0 ? "is-amber" : "is-green",
        }
      : null,
    canViewInventory
      ? {
      label: "Stock negativo",
      detail: "Productos donde el sistema cree que vendiste mas de lo disponible.",
      module: "Inventario",
      count: dashboard.kpis.negativeStock,
      impact: "stock y resurtido",
      status: dashboard.kpis.negativeStock > 0 ? "Revisar" : "Limpio",
      href: "/inventario?stock=negative",
      icon: <Boxes size={18} />,
      iconTone: dashboard.kpis.negativeStock > 0 ? "is-red" : "is-green",
      statusTone: dashboard.kpis.negativeStock > 0 ? "is-red" : "is-green",
        }
      : null,
    canViewInventory
      ? {
      label: "Stock bajo",
      detail: "SKUs que ya estan cerca de quedarse sin inventario.",
      module: "Resurtido",
      count: dashboard.kpis.lowStock,
      impact: "ventas futuras",
      status: dashboard.kpis.lowStock > 0 ? "Atencion" : "Limpio",
      href: "/resurtido",
      icon: <PackageCheck size={18} />,
      iconTone: dashboard.kpis.lowStock > 0 ? "is-amber" : "is-green",
      statusTone: dashboard.kpis.lowStock > 0 ? "is-amber" : "is-green",
        }
      : null,
    canViewProfit
      ? {
      label: "Costos sin ligar",
      detail: "Costos importados que no coinciden con un SKU maestro.",
      module: "Costos",
      count: dashboard.kpis.pendingCostImports,
      impact: "costeo",
      status: dashboard.kpis.pendingCostImports > 0 ? "Pendiente" : "Limpio",
      href: "/setup#costos-sin-ligar",
      icon: <ClipboardCheck size={18} />,
      iconTone: dashboard.kpis.pendingCostImports > 0 ? "is-amber" : "is-green",
      statusTone: dashboard.kpis.pendingCostImports > 0 ? "is-amber" : "is-green",
        }
      : null,
    canViewProfit
      ? {
      label: "Full / cargos raros",
      detail: "Alertas que pueden explicar diferencias de dinero o almacenaje.",
      module: "Alertas",
      count: dashboard.kpis.rareCharges + dashboard.kpis.fullAuditAlerts,
      impact: "cargos Meli",
      status: dashboard.kpis.rareCharges + dashboard.kpis.fullAuditAlerts > 0 ? "Revisar" : "Limpio",
      href: "/alertas",
      icon: <Warehouse size={18} />,
      iconTone: dashboard.kpis.rareCharges + dashboard.kpis.fullAuditAlerts > 0 ? "is-amber" : "is-green",
      statusTone: dashboard.kpis.rareCharges + dashboard.kpis.fullAuditAlerts > 0 ? "is-amber" : "is-green",
        }
      : null,
  ].filter((row): row is Exclude<typeof row, null> => row !== null);
}

function truncatePercent(value: number) {
  if (!Number.isFinite(value)) {
    return "0.00%";
  }

  const sign = value < 0 ? "-" : "";
  const truncated = Math.trunc(Math.abs(value) * 100) / 100;
  return `${sign}${truncated.toFixed(2)}%`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDateInput(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Mexico_City",
    year: "numeric",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return year && month && day ? `${year}-${month}-${day}` : date.toISOString().slice(0, 10);
}

function formatDateDisplay(date: Date) {
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Mexico_City",
  }).format(date);
}

function formatMonthLabel(month: string) {
  const parsed = new Date(`${month}-01T00:00:00-06:00`);
  if (Number.isNaN(parsed.getTime())) {
    return month;
  }

  return new Intl.DateTimeFormat("es-MX", {
    month: "long",
    year: "numeric",
    timeZone: "America/Mexico_City",
  }).format(parsed);
}
