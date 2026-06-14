export const dynamic = "force-dynamic";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  DollarSign,
  PackageCheck,
  ShieldCheck,
  ShoppingCart,
  Store,
  Warehouse,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { formatDateTimeMx } from "@/lib/format";
import { getOrganizationAccess, requirePermission } from "@/lib/server/auth-store";
import { buildCostReadiness } from "@/lib/server/cost-readiness";
import { buildMvpStatus } from "@/lib/server/mvp-status";
import { buildSalesAuditReport } from "@/lib/server/sales-audit";
import { buildSecurityReadiness } from "@/lib/server/security-readiness";
import { buildScaleReadiness } from "@/lib/server/scale-readiness";
import { getMeliSyncLimits } from "@/lib/server/sync-config";
import { getDataRetentionPolicy } from "@/lib/server/data-retention";
import { buildMonthlySnapshotStatus } from "@/lib/server/monthly-snapshots";

const number = new Intl.NumberFormat("es-MX");
const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});
const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

type CheckSeverity = "critical" | "warning";

type HealthCheck = {
  key: string;
  title: string;
  detail: string;
  ok: boolean;
  applicable: boolean;
  severity: CheckSeverity;
  metric: string;
  href: string;
  action: string;
  icon: ReactNode;
};

export default async function HealthPage() {
  const user = await requirePermission("health.view");
  const [status, audit, access, security, cost, scale, monthlySnapshots] =
    await Promise.all([
      buildMvpStatus(),
      buildSalesAuditReport(),
      getOrganizationAccess(user.organizationId),
      buildSecurityReadiness(),
      buildCostReadiness(),
      buildScaleReadiness(user.organizationId),
      buildMonthlySnapshotStatus(),
    ]);
  const syncLimits = getMeliSyncLimits();
  const retentionPolicy = getDataRetentionPolicy();

  const hasInventory = status.readiness.hasInventory;
  const hasMeliAccount = status.readiness.hasMeliAccount;
  const hasMeliOrders = status.readiness.hasMeliOrders;
  const hasMeliData = hasMeliAccount || hasMeliOrders;
  const hasMappings =
    status.counts.skuEquivalences > 0 || status.counts.skuEquivalenceIssues > 0;
  const hasAnySetup =
    hasInventory || hasMappings || hasMeliData || audit.totalRealSales > 0;
  const isBlankAccount = !hasAnySetup;

  const checks: HealthCheck[] = [
    {
      key: "inventory",
      title: "Inventario inicial",
      detail: `${number.format(status.counts.products)} SKU maestro(s) activos.`,
      ok: hasInventory,
      applicable: true,
      severity: "critical",
      metric: number.format(status.counts.products),
      href: "/importar#inventario",
      action: "Importar inventario",
      icon: <Warehouse size={18} />,
    },
    {
      key: "mappings",
      title: "Equivalencias SKU",
      detail: `${number.format(status.counts.unmappedSkus)} sin equivalencia, ${number.format(status.counts.incompleteSkuEquivalences)} incompleta(s).`,
      ok: hasMappings && status.counts.skuEquivalenceIssues === 0,
      applicable: hasInventory || hasMappings || hasMeliOrders,
      severity: "critical",
      metric: number.format(status.counts.skuEquivalenceIssues),
      href: "/setup#mapear",
      action: "Resolver SKUs",
      icon: <ClipboardCheck size={18} />,
    },
    {
      key: "costs",
      title: "Costos de producto",
      detail: `${number.format(status.counts.productsWithoutCost)} producto(s) sin costo promedio.`,
      ok:
        hasInventory &&
        status.counts.productsWithoutCost === 0 &&
        status.counts.pendingCostImports === 0,
      applicable: hasInventory,
      severity: "critical",
      metric: number.format(
        status.counts.productsWithoutCost + status.counts.pendingCostImports,
      ),
      href: "/inventario?stock=no_cost",
      action: "Cargar costos",
      icon: <DollarSign size={18} />,
    },
    {
      key: "meli",
      title: "Mercado Libre",
      detail: `${number.format(status.counts.meliAccounts)} cuenta(s), ${number.format(status.counts.meliOrders)} venta(s) importadas.`,
      ok: hasMeliAccount && hasMeliOrders,
      applicable: true,
      severity: "critical",
      metric: number.format(status.counts.meliAccounts),
      href: "/meli",
      action: "Conectar Meli",
      icon: <Store size={18} />,
    },
    {
      key: "meli-sync-health",
      title: "Sync automatico Meli",
      detail: status.dates.latestMeliSyncRun
        ? `Ultimo exito real: ${formatDateTimeMx(status.dates.latestMeliSyncRun)}.`
        : "Aun no hay una corrida exitosa registrada en bitacora.",
      ok: status.readiness.hasFreshMeliSync,
      applicable: hasMeliAccount,
      severity: "critical",
      metric: status.readiness.hasFreshMeliSync ? "ok" : "+2h",
      href: "/meli",
      action: "Ver bitacora",
      icon: <Activity size={18} />,
    },
    {
      key: "audit",
      title: "Auditoría de ventas",
      detail: `${number.format(audit.criticalCount)} error(es) crítico(s) y ${number.format(audit.warningCount)} aviso(s).`,
      ok: hasMeliOrders && audit.criticalCount === 0,
      applicable: hasMeliOrders,
      severity: "critical",
      metric: number.format(audit.criticalCount),
      href: "/auditoria",
      action: "Abrir auditoría",
      icon: <ShieldCheck size={18} />,
    },
    {
      key: "stock",
      title: "Stock sin negativos",
      detail: `${number.format(status.counts.negativeBalances)} balance(s) negativo(s).`,
      ok: hasInventory && status.counts.negativeBalances === 0,
      applicable: hasInventory,
      severity: "critical",
      metric: number.format(status.counts.negativeBalances),
      href: "/inventario?stock=negative",
      action: "Corregir stock",
      icon: <PackageCheck size={18} />,
    },
    {
      key: "inventory-baseline",
      title: "Ventas viejas protegidas",
      detail: status.dates.inventoryBaselineAt
        ? `${number.format(status.counts.baselineProtectedOrders)} venta(s) anteriores al conteo no descuentan inventario actual.`
        : "Falta fecha base de inventario; sincronizar historial podria afectar stock actual.",
      ok: status.readiness.hasInventoryBaseline,
      applicable: hasInventory && hasMeliOrders,
      severity: "critical",
      metric: status.dates.inventoryBaselineAt ? "ok" : "sin base",
      href: "/inventario",
      action: "Revisar inventario",
      icon: <PackageCheck size={18} />,
    },
    {
      key: "subscription",
      title: "Cuenta activa para operar",
      detail: access.canWrite
        ? "La cuenta puede editar, importar y sincronizar."
        : "La cuenta está en solo lectura o bloqueada por suscripción.",
      ok: access.canWrite,
      applicable: !access.canWrite,
      severity: "critical",
      metric: access.status,
      href: "/cuenta",
      action: "Ver cuenta",
      icon: <ShieldCheck size={18} />,
    },
    ...security.checks.map((check) => ({
      key: `security-${check.key}`,
      title: check.title,
      detail: check.detail,
      ok: check.ok,
      applicable: true,
      severity: check.severity,
      metric: check.ok ? "ok" : "pendiente",
      href: "/salud#seguridad",
      action: "Configurar env",
      icon: <ShieldCheck size={18} />,
    })),
    {
      key: "billing",
      title: "Billing viejo",
      detail: `${number.format(status.counts.staleBillingOrders)} venta(s) llevan más de 48h esperando neto real.`,
      ok: hasMeliOrders && status.counts.staleBillingOrders === 0,
      applicable: hasMeliOrders,
      severity: "warning",
      metric: number.format(status.counts.staleBillingOrders),
      href: "/ventas?pending=billing",
      action: "Revisar billing",
      icon: <ShoppingCart size={18} />,
    },
    {
      key: "full-sync",
      title: "Stock Full",
      detail: status.dates.fullSyncedAt
        ? `Última sincronización: ${formatDateTimeMx(status.dates.fullSyncedAt)}.`
        : "Aún no hay foto separada de Full.",
      ok: status.readiness.hasFullSync,
      applicable: hasMeliAccount,
      severity: "warning",
      metric: status.readiness.hasFullSync ? "ok" : "pendiente",
      href: "/meli",
      action: "Ver estado Full",
      icon: <Warehouse size={18} />,
    },
    {
      key: "full-billing",
      title: "Cargos Full mensuales",
      detail: status.dates.latestFullBillingPeriod
        ? `Ultimo periodo ${status.dates.latestFullBillingPeriod}: ${money.format(status.counts.fullBillingAmount)} en ${number.format(status.counts.fullBillingCharges)} cargo(s).`
        : "Aun no hay cargos Full mensuales importados.",
      ok: status.readiness.hasFullBilling,
      applicable: status.counts.fullOrders > 0,
      severity: "warning",
      metric: status.dates.latestFullBillingPeriod ?? "pendiente",
      href: "/meli#full-billing",
      action: "Traer cargos Full",
      icon: <DollarSign size={18} />,
    },
    {
      key: "full-fifo",
      title: "Costos logísticos Full",
      detail: `${number.format(status.counts.fullOrdersWithoutFifo)} venta(s) Full sin capa FIFO de envío/almacenaje.`,
      ok: status.readiness.hasFullFifo,
      applicable: status.counts.fullOrders > 0,
      severity: "warning",
      metric: number.format(status.counts.fullOrdersWithoutFifo),
      href: "/inventario#full-fifo",
      action: "Crear capas",
      icon: <PackageCheck size={18} />,
    },
  ];

  const applicableChecks = checks.filter((check) => check.applicable);
  const weightedTotal = applicableChecks.reduce(
    (sum, check) => sum + (check.severity === "critical" ? 2 : 1),
    0,
  );
  const weightedPassed = applicableChecks.reduce(
    (sum, check) =>
      sum + (check.ok ? (check.severity === "critical" ? 2 : 1) : 0),
    0,
  );
  const score =
    weightedTotal > 0 ? Math.round((weightedPassed / weightedTotal) * 100) : 0;
  const criticalOpen = applicableChecks.filter(
    (check) => !check.ok && check.severity === "critical",
  );
  const warningsOpen = applicableChecks.filter(
    (check) => !check.ok && check.severity === "warning",
  );
  const passed = applicableChecks.filter((check) => check.ok);
  const nextAction = criticalOpen[0] ?? warningsOpen[0];
  const readyForFriends = criticalOpen.length === 0 && score >= 85;
  const firstClientChecks = [
    {
      title: "Seguridad minima",
      detail:
        security.ok
          ? "Secretos, admin y cron criticos estan configurados."
          : `${number.format(security.criticalOpen)} bloqueo(s) de seguridad criticos siguen abiertos.`,
      ok: security.ok,
    },
    {
      title: "Backfill inicial controlado",
      detail: `Al conectar Meli importa hasta ${number.format(syncLimits.initialBackfillLimit)} orden(es) de ${number.format(syncLimits.initialBackfillMonths)} mes(es), y sigue por lotes.`,
      ok: syncLimits.initialBackfillLimit <= 500 && syncLimits.initialBackfillMonths <= 2,
    },
    {
      title: "Cron horario acotado",
      detail: `Cada hora procesa hasta ${number.format(syncLimits.hourlyBackfillLimit)} orden(es), ${number.format(syncLimits.hourlyPendingBillingLimit)} billing pendiente y ${number.format(syncLimits.hourlyFullStockMaxItems)} items Full.`,
      ok:
        syncLimits.hourlyBackfillLimit <= 200 &&
        syncLimits.hourlyPendingBillingLimit <= 50 &&
        syncLimits.hourlyFullStockMaxItems <= 1_000,
    },
    {
      title: "Costo base medido",
      detail: `DB estimada en ${usd.format(cost.monthlyDbCostUsd)}/mes. Admin reparte costo por storage, ventas recientes y tiempo de sync.`,
      ok: cost.monthlyDbCostUsd > 0,
    },
    {
      title: "Resumen mensual listo",
      detail: monthlySnapshots.ok
        ? `${number.format(monthlySnapshots.monthsCovered)} mes(es), ${number.format(monthlySnapshots.salesSummaryRows)} resumen(es) por cuenta/canal y ${number.format(monthlySnapshots.productSummaryRows)} por SKU.`
        : "Falta correr snapshots mensuales antes de depender de historial largo barato.",
      ok: monthlySnapshots.ok,
    },
    {
      title: "Backup confirmado",
      detail: process.env.PRODUCTION_BACKUPS_CONFIRMED_AT
        ? `Confirmado: ${process.env.PRODUCTION_BACKUPS_CONFIRMED_AT}.`
        : "Falta confirmar backup/restore antes de cargar datos reales del cliente.",
      ok: Boolean(process.env.PRODUCTION_BACKUPS_CONFIRMED_AT?.trim()),
    },
  ];
  const firstClientReady = firstClientChecks.every((check) => check.ok);
  const statusCopy = readyForFriends
    ? "Lista para Friends & Family"
    : isBlankAccount
      ? "Sin configurar"
      : criticalOpen.length <= 2
        ? "Usable con vigilancia"
        : "Todavía no la sueltes";

  const stateClass = readyForFriends
    ? "is-ok"
    : isBlankAccount
      ? ""
      : criticalOpen.length <= 2
        ? "is-warn"
        : "is-danger";

  const barClass = readyForFriends
    ? "bg-gradient-to-r from-emerald-400 to-blue-400 shadow-[0_0_6px_rgba(16,185,129,0.4)]"
    : criticalOpen.length <= 2
      ? "bg-gradient-to-r from-amber-400 to-orange-400 shadow-[0_0_6px_rgba(245,158,11,0.4)]"
      : "bg-gradient-to-r from-red-400 to-rose-500 shadow-[0_0_6px_rgba(239,68,68,0.4)]";

  return (
    <AppShell
      active="salud"
      title="Estado de la cuenta"
      subtitle="Lo mínimo que debe estar bien antes de confiar en inventario, ventas y utilidad."
      organization={status.organization.name}
      userEmail={user.email}
      actions={
        <>
          <Link
            href="/auditoria"
            className="ct-button ct-button-secondary"
          >
            Auditoría
          </Link>
          <Link
            href="/setup"
            className="ct-button ct-button-secondary"
          >
            Pendientes
          </Link>
        </>
      }
    >
      <div className="ct-ops-page">
      <section className={`ct-ops-alert ${stateClass}`}>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center">
          <div>
            <div className="ct-ops-kicker flex items-center gap-2">
              <Activity size={15} />
              Estado operativo
            </div>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-white">
              {statusCopy}
            </h2>
            <p className="mt-2 text-lg font-bold text-slate-100">
              {isBlankAccount
                ? "Empieza importando inventario o conectando Mercado Libre."
                : `Avance operativo: ${score}%.`}
            </p>
            <p className="ct-ops-copy max-w-3xl">
              Solo contamos revisiones que aplican. Una cuenta nueva empieza en
              cero hasta que cargue inventario o conecte Mercado Libre.
            </p>
            {!isBlankAccount ? (
              <div className="mt-5 max-w-xl shrink-0">
                <div className="h-3 overflow-hidden rounded-full border border-white/10 bg-white/10">
                  <div
                    className={`h-3 rounded-full ${barClass} transition-all duration-500`}
                    style={{ width: `${score}%` }}
                  />
                </div>
                <p className="mt-2 text-xs font-bold text-slate-300">
                  {number.format(passed.length)} listo(s),{" "}
                  {number.format(criticalOpen.length)} bloqueo(s),{" "}
                  {number.format(warningsOpen.length)} aviso(s).
                </p>
              </div>
            ) : null}
          </div>

          <div className="ct-ops-panel p-5">
            <p className="ct-ops-kicker">
              Siguiente mejor acción
            </p>
            {nextAction ? (
              <>
                <h3 className="ct-ops-title mt-2.5">{nextAction.title}</h3>
                <p className="ct-ops-copy">{nextAction.detail}</p>
                <Link
                  href={nextAction.href}
                  className="mt-4 ct-button ct-button-primary shadow-[0_4px_12px_rgba(79,70,229,0.15)] w-full"
                >
                  {nextAction.action}
                </Link>
              </>
            ) : (
              <>
                <h3 className="ct-ops-title mt-2.5">No hay bloqueos</h3>
                <p className="ct-ops-copy">
                  Puedes invitar usuarios de prueba y seguir monitoreando
                  auditoría.
                </p>
                <Link
                  href="/usuarios"
                  className="mt-4 ct-button ct-button-primary shadow-[0_4px_12px_rgba(79,70,229,0.15)] w-full"
                >
                  Invitar usuarios
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="ct-ops-kpi-grid">
        <MetricCard
          label="Bloqueos reales"
          value={criticalOpen.length}
          detail="Sólo cuenta problemas aplicables a esta cuenta."
          tone={criticalOpen.length > 0 ? "red" : "green"}
        />
        <MetricCard
          label="Avisos"
          value={warningsOpen.length}
          detail="No frenan la prueba, pero conviene revisar."
          tone={warningsOpen.length > 0 ? "amber" : "green"}
        />
        <MetricCard
          label="Ventas auditadas"
          value={audit.totalRealSales}
          detail={`${number.format(audit.cleanRealSales)} sin problemas detectados.`}
        />
        <MetricCard
          label="Última sync Meli"
          value={status.dates.lastMeliSync ? "ok" : "no"}
          detail={
            status.dates.lastMeliSync
              ? formatDateTimeMx(status.dates.lastMeliSync)
              : "Sin sincronización registrada."
          }
          textValue
        />
        <MetricCard
          label="Costo DB / venta"
          value={cost.costPerSaleUsd === null ? "sin datos" : usd.format(cost.costPerSaleUsd)}
          detail={`${usd.format(cost.monthlyDbCostUsd)}/mes estimado, ${number.format(cost.salesLast30Days)} ventas ult. 30 dias.`}
          tone={cost.costPerSaleUsd !== null && cost.costPerSaleUsd <= 0.05 ? "green" : "amber"}
          textValue
        />
        <MetricCard
          label="Raw Meli retenido"
          value={
            cost.projectedRetainedPayloadStorageGb === null
              ? "sin datos"
              : formatStorageGb(cost.projectedRetainedPayloadStorageGb)
          }
          detail={cost.detail}
          tone={
            cost.projected12MonthExtraStorageUsd !== null &&
            cost.projected12MonthExtraStorageUsd > 0
              ? "amber"
              : "green"
          }
          textValue
        />
      </section>

      <section id="seguridad" className="ct-ops-panel overflow-hidden">
        <div className="ct-ops-panel-header block">
          <h2 className="ct-ops-title">Seguridad y costo</h2>
          <p className="ct-ops-copy">
            Lo que debe estar cerrado antes de vender cuentas en serio.
          </p>
        </div>
        <div className="grid gap-4 p-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid gap-4 md:grid-cols-2">
            {security.checks.map((check) => (
              <div
                key={check.key}
                className={`ct-ops-alert ${
                  check.ok
                    ? "is-ok"
                    : check.severity === "critical"
                      ? "is-danger"
                      : "is-warn"
                }`}
              >
                <p className="text-sm font-black text-white">{check.title}</p>
                <p className="ct-ops-copy">{check.detail}</p>
                <p className="ct-ops-kicker mt-2">
                  {check.ok ? "Listo" : check.severity === "critical" ? "Critico" : "Aviso"}
                </p>
              </div>
            ))}
          </div>
          <div className="ct-ops-inline-card">
            <p className="ct-ops-kicker">
              Lectura de costos
            </p>
            <p className="ct-ops-kpi-value">{cost.summary}</p>
            <p className="ct-ops-copy">
              {cost.detail}
            </p>
            <p className="mt-3 text-xs font-semibold text-slate-400">
              Ajusta `DATABASE_MONTHLY_COST_USD` si cambia el plan de base de datos.
            </p>
          </div>
        </div>
      </section>

      <section id="primer-cliente" className="ct-ops-panel overflow-hidden">
        <div className="ct-ops-panel-header block">
          <h2 className="ct-ops-title">
            Primer cliente piloto
          </h2>
          <p className="ct-ops-copy">
            Guardrails de costo y riesgo antes de conectar una cuenta real.
          </p>
        </div>
        <div className="grid gap-4 p-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <div className={`ct-ops-alert ${firstClientReady ? "is-ok" : "is-warn"}`}>
            <p className="ct-ops-kicker">
              Estado piloto
            </p>
            <p className="ct-ops-kpi-value">
              {firstClientReady ? "Listo" : "Casi listo"}
            </p>
            <p className="ct-ops-copy">
              {firstClientReady
                ? "Puedes conectar cliente con monitoreo diario."
                : "Resuelve lo pendiente antes de meter datos reales grandes."}
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {firstClientChecks.map((check) => (
              <PilotCheckCard key={check.title} check={check} />
            ))}
          </div>
        </div>
      </section>

      <section id="retencion" className="ct-ops-panel overflow-hidden">
        <div className="ct-ops-panel-header block">
          <h2 className="ct-ops-title">Retencion de historial</h2>
          <p className="ct-ops-copy">
            Politica para no cargar la base con raw viejo y mantener reportes historicos.
          </p>
        </div>
        <div className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Detalle operativo"
            value={`${number.format(retentionPolicy.detailedSalesRetentionMonths)} meses`}
            detail="Ventas recientes conservan detalle completo para soporte, auditoria y reparaciones."
            textValue
          />
          <MetricCard
            label="Raw Meli pesado"
            value={`${number.format(retentionPolicy.rawPayloadRetentionMonths)} meses`}
            detail="Despues se compacta por cron: conserva ids, pack, pagos y envio; quita duplicados pesados."
            tone="green"
            textValue
          />
          <MetricCard
            label="Snapshots mensuales"
            value={
              monthlySnapshots.ok
                ? `${number.format(monthlySnapshots.monthsCovered)} meses`
                : "pendiente"
            }
            detail={
              monthlySnapshots.ok
                ? `Ultimo calculo: ${monthlySnapshots.latestCalculatedAt ? formatDateTimeMx(monthlySnapshots.latestCalculatedAt) : "sin fecha"}.`
                : "El cron mensual debe materializar ventas por cuenta, canal y SKU."
            }
            tone={monthlySnapshots.ok ? "green" : "amber"}
            textValue
          />
          <MetricCard
            label="Resumen historico"
            value={`${number.format(retentionPolicy.summaryRetentionYears)} anos`}
            detail={`${number.format(monthlySnapshots.salesSummaryRows)} resumen(es) por cuenta/canal y ${number.format(monthlySnapshots.productSummaryRows)} por SKU.`}
            tone="green"
            textValue
          />
        </div>
      </section>

      <section id="escala-30k" className="ct-ops-panel overflow-hidden">
        <div className="ct-ops-panel-header block">
          <h2 className="ct-ops-title">
            Escala 30k ventas/mes
          </h2>
          <p className="ct-ops-copy">
            Lectura rapida para saber si conviene meter un cliente grande sin inflar costo.
          </p>
        </div>
        <div className="grid gap-4 p-6 xl:grid-cols-[280px_minmax(0,1fr)]">
          <div className={`ct-ops-alert ${scale.ready ? "is-ok" : "is-warn"}`}>
            <p className="ct-ops-kicker">
              Veredicto
            </p>
            <p className="ct-ops-kpi-value">{scale.verdict}</p>
            <p className="ct-ops-copy">
              Objetivo: {number.format(scale.targetMonthlyOrders)} ventas/mes,{" "}
              {number.format(scale.targetDailyOrders)} por dia.
            </p>
          </div>
          <div className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Ventas / hora"
                value={scale.targetHourlyOrders.toFixed(1)}
                detail={`${number.format(scale.targetDailyOrders)} ventas/dia promedio.`}
                textValue
              />
              <MetricCard
                label="Cron / hora"
                value={scale.hourlyCapacityOrders}
                detail={`${number.format(scale.hourlyCapacityMonthlyOrders)} ordenes/mes teoricas.`}
                tone={
                  scale.hourlyHeadroom !== null && scale.hourlyHeadroom >= 2
                    ? "green"
                    : "amber"
                }
              />
              <MetricCard
                label={`Catch-up ${number.format(scale.initialBackfillMonths)} mes(es)`}
                value={
                  scale.estimatedCatchupDays === null
                    ? "sin dato"
                    : `${scale.estimatedCatchupDays.toFixed(1)} dias`
                }
                detail={`${number.format(scale.estimatedHistoricalOrders)} ordenes historicas estimadas a ${number.format(scale.hourlyCapacityOrders)}/h.`}
                tone={
                  scale.estimatedCatchupDays !== null && scale.estimatedCatchupDays <= 30
                    ? "green"
                    : "amber"
                }
                textValue
              />
              <MetricCard
                label="DB 12 meses"
                value={
                  scale.projected12MonthDbGb === null
                    ? "sin dato"
                    : formatStorageGb(scale.projected12MonthDbGb)
                }
                detail={
                  scale.projected12MonthExtraStorageUsd === null
                    ? "Se calcula con ventas reales de esta cuenta."
                    : `Extra storage estimado: ${usd.format(scale.projected12MonthExtraStorageUsd)}/mes.`
                }
                tone={
                  scale.projected12MonthExtraStorageUsd !== null &&
                  scale.projected12MonthExtraStorageUsd > 0
                    ? "amber"
                    : "green"
                }
                textValue
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {scale.checks.map((check) => (
                <PilotCheckCard key={check.key} check={check} />
              ))}
            </div>
            <p className="text-xs font-semibold leading-relaxed text-slate-500">
              Observado en esta cuenta: {number.format(scale.observedOrders)} orden(es),{" "}
              {number.format(scale.observedItems)} item(s),{" "}
              {number.format(scale.observedCharges)} cargo(s). El costo real por cliente se revisa en Admin.
            </p>
          </div>
        </div>
      </section>

      <HealthSection
        title="Falta resolver"
        subtitle="Estas son las acciones concretas que todavía afectan la confianza de la cuenta."
        checks={criticalOpen}
        empty="No hay bloqueos críticos."
      />

      <HealthSection
        title="Avisos"
        subtitle="No frenan la prueba, pero pueden afectar precisión fina o seguimiento."
        checks={warningsOpen}
        empty="No hay avisos pendientes."
      />

      {passed.length > 0 ? (
        <section className="ct-ops-panel overflow-hidden">
          <div className="ct-ops-panel-header block">
            <h2 className="ct-ops-title">Ya está bien</h2>
            <p className="ct-ops-copy">
              Sólo se muestran revisiones que aplican a esta cuenta.
            </p>
          </div>
          <div className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-3">
            {passed.map((check) => (
              <CheckCard key={check.key} check={check} compact />
            ))}
          </div>
        </section>
      ) : null}

      <section className="ct-ops-panel p-6">
        <h2 className="ct-ops-title">Cómo leer esta pantalla</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <ReadinessNote
            title="Cuenta nueva"
            body="Debe empezar en 0%. No cuenta como listo que no existan errores si todavía no hay datos."
          />
          <ReadinessNote
            title="Para probar"
            body="Primero importa inventario, sube equivalencias, carga costos y conecta Meli."
          />
          <ReadinessNote
            title="Para confiar"
            body="Después revisa auditoría, billing pendiente y cualquier stock negativo."
          />
        </div>
      </section>
      </div>
    </AppShell>
  );
}

function MetricCard({
  label,
  value,
  detail,
  tone = "neutral",
  textValue = false,
}: {
  label: string;
  value: number | string;
  detail: string;
  tone?: "neutral" | "green" | "amber" | "red";
  textValue?: boolean;
}) {
  const toneStyles = {
    neutral: "",
    green: "is-ok",
    amber: "is-warn",
    red: "is-danger",
  }[tone];

  return (
    <div className={`ct-ops-kpi ${toneStyles}`}>
      <p className="ct-ops-kpi-label">{label}</p>
      <p className="ct-ops-kpi-value">
        {textValue ? value : number.format(Number(value))}
      </p>
      <p className="ct-ops-kpi-detail">{detail}</p>
    </div>
  );
}

function formatStorageGb(value: number) {
  if (value < 1) {
    return `${Math.max(0, value * 1024).toFixed(1)} MB`;
  }

  return `${value.toFixed(2)} GB`;
}

function PilotCheckCard({
  check,
}: {
  check: { title: string; detail: string; ok: boolean };
}) {
  return (
    <div className={`ct-ops-alert ${check.ok ? "is-ok" : "is-warn"}`}>
      <div className="flex items-center gap-2">
        {check.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
        <p className="text-sm font-black text-white">{check.title}</p>
      </div>
      <p className="ct-ops-copy">{check.detail}</p>
      <p className="ct-ops-kicker mt-2">
        {check.ok ? "Listo" : "Pendiente"}
      </p>
    </div>
  );
}

function HealthSection({
  title,
  subtitle,
  checks,
  empty,
}: {
  title: string;
  subtitle: string;
  checks: HealthCheck[];
  empty: string;
}) {
  return (
    <section className="ct-ops-panel overflow-hidden">
      <div className="ct-ops-panel-header block">
        <h2 className="ct-ops-title">{title}</h2>
        <p className="ct-ops-copy">{subtitle}</p>
      </div>
      {checks.length > 0 ? (
        <div className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-3">
          {checks.map((check) => (
            <CheckCard key={check.key} check={check} />
          ))}
        </div>
      ) : (
        <div className="p-6">
          <div className="ct-ops-alert is-ok text-sm font-semibold">
            {empty}
          </div>
        </div>
      )}
    </section>
  );
}

function CheckCard({
  check,
  compact = false,
}: {
  check: HealthCheck;
  compact?: boolean;
}) {
  const isOk = check.ok;

  const toneClass = isOk
    ? "is-ok"
    : check.severity === "critical"
      ? "is-danger"
      : "is-warn";

  return (
    <article className={`ct-ops-kpi flex flex-col justify-between ${toneClass}`}>
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="ct-ops-icon">
              {check.icon}
            </span>
            <h3 className="ct-ops-title text-sm">{check.title}</h3>
          </div>
          {isOk ? (
            <CheckCircle2 className="text-emerald-500" size={20} />
          ) : (
            <AlertTriangle
              className={
                check.severity === "critical" ? "text-red-500 animate-pulse" : "text-amber-500 animate-pulse"
              }
              size={20}
            />
          )}
        </div>
        <p className="ct-ops-kpi-value">{check.metric}</p>
        <p className="ct-ops-kpi-detail">{check.detail}</p>
      </div>
      {!compact || !isOk ? (
        <Link
          href={check.href}
          className="mt-5 ct-button ct-button-primary shadow-[0_4px_12px_rgba(79,70,229,0.15)] w-full"
        >
          {check.action}
        </Link>
      ) : null}
    </article>
  );
}

function ReadinessNote({ title, body }: { title: string; body: string }) {
  return (
    <div className="ct-ops-inline-card">
      <h3 className="ct-ops-title text-sm">{title}</h3>
      <p className="ct-ops-copy">{body}</p>
    </div>
  );
}
