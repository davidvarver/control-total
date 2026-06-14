export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  RefreshCcw,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AsyncForm } from "@/components/async-form";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { formatDateTimeMx } from "@/lib/format";
import {
  getOrganizationAccess,
  requirePermission,
  userHasPermission,
} from "@/lib/server/auth-store";
import { buildMvpStatus } from "@/lib/server/mvp-status";
import { readReportStore } from "@/lib/server/reports";

const number = new Intl.NumberFormat("es-MX");
const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});

type SetupPageProps = {
  searchParams: Promise<{
    recalculated?: string;
    sku_mappings?: string;
    inventory_products?: string;
    costs_imported?: string;
    costs_ignored?: string;
    costs_ignored_examples?: string;
    cost_mapped?: string;
    cost_discarded?: string;
    billing_checked?: string;
    billing_updated?: string;
    billing_pending?: string;
    repair_checked?: string;
    repair_repaired?: string;
    repair_failed?: string;
    repair_after?: string;
    error?: string;
  }>;
};

export default async function SetupPage({ searchParams }: SetupPageProps) {
  const user = await requirePermission("dashboard.view");
  const params = await searchParams;
  const store = await readReportStore();
  const status = await buildMvpStatus({ store });
  const access = await getOrganizationAccess(user.organizationId);
  const canViewInventory = userHasPermission(user, "inventory.view");
  const canViewProfit = userHasPermission(user, "profit.view");
  const canViewSales = userHasPermission(user, "sales.view");
  const firstAccount = status.accounts[0];
  const skuIssueHref =
    status.counts.unmappedSkus > 0
      ? "/setup#mapear"
      : status.incompleteSkuEquivalences[0]
        ? `/setup#${equivalenceRowId(status.incompleteSkuEquivalences[0].onlineSku)}`
        : "/setup#equivalencias";
  const criticalItems = [
    canViewProfit
      ? {
      label: "Dinero Meli +48h",
      count: status.counts.staleBillingOrders,
      href: "/ventas?pending=billing",
      detail: `${number.format(status.counts.pendingBillingOrders)} ventas esperan dinero final de Meli. Solo revisa las viejas.`,
        }
      : null,
    canViewSales || canViewInventory
      ? {
      label: "Problemas de equivalencias",
      count: status.counts.skuEquivalenceIssues,
      href: skuIssueHref,
      detail: `${number.format(status.counts.unmappedSkus)} sin equivalencia, ${number.format(status.counts.incompleteSkuEquivalences)} incompleta(s).`,
        }
      : null,
    canViewProfit
      ? {
      label: "Productos sin costo",
      count: status.counts.productsWithoutCost,
      href: "/inventario?stock=no_cost",
      detail: "Sin costo producto la utilidad queda incompleta.",
        }
      : null,
    canViewProfit
      ? {
      label: "Costos sin ligar",
      count: status.counts.pendingCostImports,
      href: "/setup#costos-sin-ligar",
      detail: "Costos genericos del Excel que debes ligar o descartar.",
        }
      : null,
  ].filter((item): item is Exclude<typeof item, null> => item !== null);
  const steps = [
    canViewSales || canViewInventory
      ? {
      label: "Equivalencias SKU",
      done: status.readiness.hasMappings,
      detail: `${number.format(status.counts.skuEquivalences)} equivalencias`,
        }
      : null,
    canViewInventory
      ? {
      label: "Inventario",
      done: status.readiness.hasInventory,
      detail: `${number.format(status.counts.products)} productos`,
        }
      : null,
    canViewProfit
      ? {
      label: "Costos",
      done: status.readiness.hasCosts,
      detail: `${number.format(status.counts.productsWithoutCost)} sin costo`,
        }
      : null,
    canViewSales
      ? {
      label: "Meli conectado",
      done: status.readiness.hasMeliAccount,
      detail: `${number.format(status.counts.meliAccounts)} cuenta(s)`,
        }
      : null,
    canViewInventory
      ? {
      label: "Stock Full",
      done: status.readiness.hasFullSync,
      detail: status.dates.fullSyncedAt
        ? formatDateTimeMx(status.dates.fullSyncedAt)
        : "pendiente",
        }
      : null,
    {
      label: "Suscripcion",
      done: access.canWrite,
      detail: access.canWrite ? "activa para editar" : `bloqueo ${access.lockMode}`,
    },
  ].filter((step): step is Exclude<typeof step, null> => step !== null);
  const pendingCriticalItems = criticalItems.filter((item) => item.count > 0);
  const pendingSteps = steps.filter((step) => !step.done);
  const primaryIssue = buildPrimaryIssue({
    status,
    pendingCriticalItems,
    pendingSteps,
    canViewInventory,
    canViewProfit,
    canViewSales,
  });

  return (
    <AppShell
      active="setup"
      title="Pendientes"
      subtitle="Todo lo que falta resolver para que inventario, billing, Full y utilidad sean confiables."
      organization={status.organization.name}
      userEmail={user.email}
      actions={
        <>
          <form action="/api/recalculate" method="post">
            <ConfirmSubmitButton
              className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white hover:bg-slate-800"
              confirmTitle="Recalculo masivo"
              confirmMessage="Esto recalcula ventas, inventario y FIFO Full. Puede tardar y cambiar muchos resultados."
              confirmText="RECALCULAR"
            >
              <RefreshCcw size={16} />
              Recalcular todo
            </ConfirmSubmitButton>
          </form>
          {canViewProfit ? (
            <Link
              href="/utilidad"
              className="inline-flex h-10 items-center rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Ver utilidad
            </Link>
          ) : null}
        </>
      }
    >
      <Messages params={params} />

      <div className="ct-ops-page">
      <section className="ct-ops-hero">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="ct-ops-kicker">
              Operaciones
            </p>
            <h2 className="mt-2 text-2xl font-black text-white">
              Pendientes de accion
            </h2>
            <p className="ct-ops-copy max-w-3xl">
              Aqui solo deben vivir cosas que bloquean calculo, inventario o dinero. Si algo ya quedo limpio, se oculta.
            </p>
          </div>
          <div className="ct-ops-button-row">
            {canViewSales || canViewInventory ? (
              <a href="#mapear" className="ct-button ct-button-primary">
                SKUs
              </a>
            ) : null}
            {canViewProfit ? (
              <>
                <a href="#costos-sin-ligar" className="ct-button ct-button-secondary">
                  Costos
                </a>
                <a href="#dinero-meli" className="ct-button ct-button-secondary">
                  Dinero Meli
                </a>
              </>
            ) : null}
          </div>
        </div>
        <nav className="ct-ops-subnav mt-5">
          <a href="#pendientes">
            1. Pendientes
          </a>
          {canViewSales || canViewInventory ? (
            <a href="#mapear">
              2. Equivalencias
            </a>
          ) : null}
          {canViewProfit ? (
            <>
              <a href="#costos-sin-ligar">
                3. Costos
              </a>
              <a href="#dinero-meli">
                4. Dinero
              </a>
            </>
          ) : null}
        </nav>
      </section>

      <MasterSkuDatalist masterSkus={status.masterSkus} />

      <section
        id="pendientes"
        className={`ct-ops-alert scroll-mt-24 ${
          primaryIssue.tone === "green"
            ? "is-ok"
            : "is-warn"
        }`}
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="flex items-start gap-3">
            <div className="ct-ops-icon">
              {primaryIssue.tone === "green" ? (
                <CheckCircle2 size={22} className="text-emerald-700" />
              ) : (
                <AlertTriangle size={22} className="text-amber-700" />
              )}
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] opacity-70">
                Haz esto primero
              </p>
              <h2 className="ct-ops-title mt-1">{primaryIssue.title}</h2>
              <p className="ct-ops-copy max-w-3xl">
                {primaryIssue.detail}
              </p>
            </div>
          </div>
          <Link
            href={primaryIssue.href}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-black text-white hover:bg-slate-800"
          >
            {primaryIssue.button}
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {pendingCriticalItems.length > 0 ? (
        <section className="ct-ops-kpi-grid">
          {pendingCriticalItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="ct-ops-kpi is-warn"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="ct-ops-kpi-label">{item.label}</p>
                  <p className="ct-ops-kpi-value is-warn">
                    {number.format(item.count)}
                  </p>
                </div>
                <AlertTriangle size={20} className="text-amber-700" />
              </div>
              <p className="ct-ops-kpi-detail">{item.detail}</p>
            </Link>
          ))}
        </section>
      ) : null}

      {pendingSteps.length > 0 ? (
        <section className="ct-ops-kpi-grid">
          {pendingSteps.map((step) => (
            <div
              key={step.label}
              className="ct-ops-kpi"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="ct-ops-kpi-label">{step.label}</p>
                <AlertTriangle size={18} className="text-amber-700" />
              </div>
              <p className="ct-ops-kpi-detail">{step.detail}</p>
            </div>
          ))}
        </section>
      ) : null}

      {pendingCriticalItems.length === 0 && pendingSteps.length === 0 ? (
        <section className="ct-ops-alert is-ok">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={22} className="mt-0.5 text-emerald-700" />
            <div>
              <h2 className="ct-ops-title">
                No hay pendientes operativos
              </h2>
              <p className="ct-ops-copy">
                Inventario, equivalencias, Meli, costos y suscripcion estan en
                estado listo segun las reglas actuales.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-4">
          <QuickActions firstAccount={firstAccount} />
          <PendingCard
            title="Resumen operativo"
            rows={[
              ["Ordenes Meli", status.counts.meliOrders],
              ["Stock negativo", status.counts.negativeBalances],
              ["Stock bajo", status.counts.lowStock],
              ["Full mapeado", status.counts.fullOrders],
              ["Capas Full", status.counts.fullLayers],
            ]}
          />
        </div>

        <div className="space-y-4">
          <details className="ct-action-panel">
            <summary>
              <span>
                <span className="block font-semibold">Como usar esta pantalla</span>
                <span className="ct-muted-note block">Regla simple para no perderse.</span>
              </span>
            </summary>
            <p className="ct-muted-note border-t border-zinc-100 p-4">
              Aqui solo aparecen cosas que requieren accion. Si algo esta en verde o ya quedo
              completo, se oculta para no estorbar. Toca cualquier tarjeta amarilla para ir
              directo al lugar donde se corrige.
            </p>
          </details>
          {canViewProfit ? (
            <section id="dinero-meli" className="ct-ops-panel scroll-mt-24">
              <div className="ct-ops-panel-header">
                <div>
                <h2 className="ct-ops-title">Dinero esperando a Meli</h2>
                <p className="ct-ops-copy">
                  Normalmente no es problema del cliente: Meli puede tardar en confirmar el dinero final. Revisa solo las que llevan mas de 48 horas.
                </p>
                </div>
              </div>
              <div>
                {status.pendingBillingOrders.slice(0, 8).map((order) => (
                  <Link
                    key={order.externalOrderId}
                    href={`/ventas/${encodeURIComponent(order.externalOrderId)}`}
                    className="ct-ops-row text-sm"
                  >
                    <div>
                      <p className="font-mono text-xs font-semibold">
                        {order.externalOrderId}
                      </p>
                      <p className="ct-ops-copy">
                        {order.status} | {formatDateTimeMx(order.orderedAt)} |{" "}
                        {order.isStale ? "revisar +48h" : "esperando Meli"}
                      </p>
                    </div>
                    <p className="font-semibold">{money.format(order.grossAmount)}</p>
                  </Link>
                ))}
                {status.pendingBillingOrders.length === 0 ? (
                  <p className="ct-ops-empty">
                    No hay ventas con billing pendiente.
                  </p>
                ) : null}
              </div>
            </section>
          ) : null}

          <details className="ct-action-panel">
            <summary>
              <span>
                <span className="block font-semibold">Investigacion pendiente: costos Full</span>
                <span className="ct-muted-note block">Contexto tecnico, solo si necesitas revisarlo.</span>
              </span>
            </summary>
            <p className="ct-ops-copy border-t border-white/10 p-4">
              Full no se muestra como pendiente accionable por ahora. Primero hay que confirmar bien como obtener o calcular envio a Full, almacenaje y antiguedad por pieza.
            </p>
          </details>

          {canViewSales || canViewInventory ? (
            <>
              <UnmappedSkusSection status={status} />
              <EquivalenceCatalogSection status={status} />
            </>
          ) : null}
          {canViewProfit ? <PendingCostImportsSection status={status} /> : null}
        </div>
      </section>
      </div>
    </AppShell>
  );
}

function Messages({ params }: { params: Awaited<SetupPageProps["searchParams"]> }) {
  return (
    <>
      {params.recalculated ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          Recalculo listo. Se remapearon ventas, inventario y FIFO Full.
        </div>
      ) : null}
      {params.sku_mappings ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          Se importaron {params.sku_mappings} equivalencias.
        </div>
      ) : null}
      {params.inventory_products ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          Se importaron {params.inventory_products} productos de inventario.
        </div>
      ) : null}
      {params.costs_imported ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          Se importaron {params.costs_imported} costos de producto.
        </div>
      ) : null}
      {params.costs_ignored ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          Quedaron {params.costs_ignored} costos sin ligar porque no existen
          exactos en tu inventario maestro
          {params.costs_ignored_examples
            ? `: ${params.costs_ignored_examples}`
            : "."}
        </div>
      ) : null}
      {params.cost_mapped ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          Costo ligado: {params.cost_mapped}. Esta equivalencia se usara en
          proximas importaciones.
        </div>
      ) : null}
      {params.cost_discarded ? (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-medium text-zinc-700">
          Costo descartado: {params.cost_discarded}. No volvera a aparecer como
          pendiente al importar costos.
        </div>
      ) : null}
      {params.billing_checked ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          Billing revisado: {params.billing_checked} ventas. Actualizadas:{" "}
          {params.billing_updated ?? "0"}. Pendientes: {params.billing_pending ?? "0"}.
        </div>
      ) : null}
      {params.repair_checked ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          Auditoria reparada con Meli: se revisaron {params.repair_checked} venta(s),
          se refrescaron {params.repair_repaired ?? "0"}, fallaron{" "}
          {params.repair_failed ?? "0"} y quedan {params.repair_after ?? "0"} problema(s).
        </div>
      ) : null}
      {params.error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {params.error}
        </div>
      ) : null}
    </>
  );
}

function buildPrimaryIssue({
  status,
  pendingCriticalItems,
  pendingSteps,
  canViewInventory,
  canViewProfit,
  canViewSales,
}: {
  status: Awaited<ReturnType<typeof buildMvpStatus>>;
  pendingCriticalItems: Array<{ label: string; count: number; href: string; detail: string }>;
  pendingSteps: Array<{ label: string; done: boolean; detail: string }>;
  canViewInventory: boolean;
  canViewProfit: boolean;
  canViewSales: boolean;
}) {
  if ((canViewSales || canViewInventory) && status.counts.unmappedSkus > 0) {
    return {
      title: "Mapea los SKUs pendientes",
      detail: "Mientras un SKU no este mapeado, esa venta no sabe que producto descuenta ni puede calcular utilidad completa.",
      href: "/setup#mapear",
      button: "Mapear ahora",
      tone: "amber" as const,
    };
  }

  if (canViewProfit && status.counts.productsWithoutCost > 0) {
    return {
      title: "Completa costos de producto",
      detail: "Sin costo promedio, la utilidad puede verse mejor de lo que realmente es.",
      href: "/inventario?stock=no_cost",
      button: "Cargar costos",
      tone: "amber" as const,
    };
  }

  if (canViewProfit && status.counts.pendingCostImports > 0) {
    return {
      title: "Liga costos importados",
      detail: "Hay costos que vienen del Excel pero no coinciden exacto con un SKU maestro.",
      href: "/setup#costos-sin-ligar",
      button: "Ligar costos",
      tone: "amber" as const,
    };
  }

  if (canViewProfit && status.counts.staleBillingOrders > 0) {
    return {
      title: "Actualiza dinero Meli viejo",
      detail: "Estas ventas llevan mas de 48 horas esperando el dinero final. Conviene recalcularlas con Meli.",
      href: "/ventas?pending=billing",
      button: "Ver ventas",
      tone: "amber" as const,
    };
  }

  if (pendingCriticalItems.length > 0) {
    const first = pendingCriticalItems[0];
    return {
      title: first.label,
      detail: first.detail,
      href: first.href,
      button: "Resolver",
      tone: "amber" as const,
    };
  }

  if (pendingSteps.length > 0) {
    const first = pendingSteps[0];
    return {
      title: first.label,
      detail: first.detail,
      href: "/guia",
      button: "Ver guia",
      tone: "amber" as const,
    };
  }

  return {
    title: "No hay pendientes urgentes",
    detail: "La cuenta esta limpia segun las reglas actuales para tus permisos.",
    href: canViewProfit ? "/utilidad" : canViewInventory ? "/resurtido" : "/dashboard",
    button: canViewProfit ? "Ver utilidad" : canViewInventory ? "Ver resurtido" : "Volver al inicio",
    tone: "green" as const,
  };
}

function QuickActions({
  firstAccount,
}: {
  firstAccount: Awaited<ReturnType<typeof buildMvpStatus>>["accounts"][number] | undefined;
}) {
  return (
    <details className="ct-action-panel" open>
      <summary>
        <span>
          <span className="block font-semibold">Acciones rapidas</span>
          <span className="ct-muted-note block">Importar, conectar Meli y reparar datos.</span>
        </span>
      </summary>
    <div className="border-t border-white/10 p-4">
      <p className="ct-ops-copy">
        Si tienes archivos, usa el importador. Si no, empieza con lo que Meli ya detecto y crea SKUs desde pendientes.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Link
          href="/meli#skus-sin-mapear"
          className="inline-flex h-10 items-center justify-center rounded-md bg-zinc-950 px-3 text-sm font-semibold text-white hover:bg-zinc-800"
        >
          Crear desde Meli
        </Link>
        <Link
          href="/importar#sin-excel"
          className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
        >
          Ver arranque
        </Link>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <TemplateLink href="/api/templates/equivalencias" label="Plantilla equivalencias" />
        <TemplateLink href="/api/templates/inventario" label="Plantilla inventario" />
        <TemplateLink href="/api/templates/costos" label="Plantilla costos" />
        <TemplateLink href="/api/templates/full" label="Plantilla Full FIFO" />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href="/api/integrations/meli/connect"
          className="inline-flex h-10 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-semibold hover:bg-zinc-50"
        >
          <Database size={16} />
          Conectar Meli
        </a>
        {firstAccount ? (
          <span className="inline-flex min-h-10 items-center rounded-md border border-zinc-200 bg-zinc-50 px-3 text-sm font-semibold text-zinc-600">
            Sync automatico activo; repara una venta desde su detalle.
          </span>
        ) : null}
      </div>
      <p className="ct-ops-copy mt-3 text-xs">
        Equivalencias: SKU online, SKU maestro y multiplicador. Si tienes duda, entra al importador guiado y baja la plantilla.
      </p>
    </div>
    </details>
  );
}

function TemplateLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-300 px-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
    >
      {label}
    </a>
  );
}

function UnmappedSkusSection({
  status,
}: {
  status: Awaited<ReturnType<typeof buildMvpStatus>>;
}) {
  return (
    <details
      id="mapear"
      className="ct-action-panel group"
      open={status.unmappedSkus.length > 0}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <div>
          <h2 className="font-semibold">SKUs sin equivalencia</h2>
          <p className="text-sm text-zinc-500">
            Cada SKU online necesita SKU maestro y cuantas unidades descuenta.
          </p>
        </div>
        <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-700">
          {number.format(status.unmappedSkus.length)}
        </span>
      </summary>
      <div className="divide-y divide-zinc-100">
        {status.unmappedSkus.map((item) => (
          <div key={item.externalSku} className="px-4 py-3 text-sm">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_440px]">
              <div>
                <p className="font-mono text-xs font-semibold">{item.externalSku}</p>
                <p className="text-zinc-600">{item.title}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  Origen: {item.sources.join(" + ")}
                  {item.orderIds.length > 0 ? ` | ventas: ${item.orderIds.slice(0, 3).join(", ")}` : ""}
                  {item.inventoryIds.length > 0 ? ` | Full IDs: ${item.inventoryIds.slice(0, 3).join(", ")}` : ""}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Vendido pendiente: {number.format(item.quantity)} | Full pendiente:{" "}
                  {number.format(item.fullQuantity)}
                </p>
              </div>
              <MappingForm
                onlineSku={item.externalSku}
              />
            </div>
          </div>
        ))}
        {status.unmappedSkus.length === 0 ? (
          <p className="px-4 py-5 text-sm text-zinc-500">
            No hay SKUs sin equivalencia. Si queda algun pendiente, revisa
            equivalencias incompletas en el catalogo de abajo.
          </p>
        ) : null}
      </div>
    </details>
  );
}

function EquivalenceCatalogSection({
  status,
}: {
  status: Awaited<ReturnType<typeof buildMvpStatus>>;
}) {
  return (
    <details
      id="equivalencias"
      className="ct-action-panel group"
      open={status.incompleteSkuEquivalences.length > 0}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <div>
          <h2 className="font-semibold">Catalogo de equivalencias</h2>
          <p className="text-sm text-zinc-500">
            Define cuantas piezas descuenta cada SKU online de tu SKU maestro.
          </p>
        </div>
        <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-700">
          {status.incompleteSkuEquivalences.length > 0
            ? `${number.format(status.incompleteSkuEquivalences.length)} incompleta(s)`
            : `${number.format(status.counts.skuEquivalences)} listas`}
        </span>
      </summary>
      <div className="grid gap-3 border-t border-zinc-100 bg-zinc-50 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="text-sm text-zinc-600">
          <p>
            Usa esta seccion para validar o corregir tu catalogo: por ejemplo,
            si vendes <strong>SILLA 10 piezas</strong>, aqui debe decir que
            descuenta <strong>10</strong> del SKU maestro <strong>SILLA</strong>.
          </p>
          <p className="mt-1">
            Para cargar muchos de golpe, sube un Excel con columnas{" "}
            <strong>SKU online</strong>, <strong>SKU maestro</strong> y{" "}
            <strong>multiplicador</strong>.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/importar#equivalencias"
            className="inline-flex h-10 items-center rounded-md bg-zinc-950 px-3 text-sm font-semibold text-white hover:bg-zinc-800"
          >
            Subir Excel
          </Link>
          <Link
            href="/api/templates/equivalencias"
            className="inline-flex h-10 items-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            Descargar plantilla
          </Link>
        </div>
      </div>
      <div className="overflow-x-auto border-t border-zinc-100">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-3">SKU online</th>
              <th className="px-4 py-3">Descuenta</th>
              <th className="px-4 py-3">SKU maestro</th>
              <th className="px-4 py-3">Titulo completo</th>
              <th className="px-4 py-3">Editar equivalencia</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {status.skuEquivalences.map((sku) => {
              const firstComponent = sku.components[0];
              const hasIssue = !sku.isComplete;

              return (
                <tr
                  key={sku.onlineSku}
                  id={equivalenceRowId(sku.onlineSku)}
                  className={`scroll-mt-28 align-top ${
                    hasIssue
                      ? "bg-amber-50/60 target:bg-amber-100 target:ring-2 target:ring-amber-300"
                      : "target:bg-blue-50 target:ring-2 target:ring-blue-200"
                  }`}
                >
                  <td className="px-4 py-3 font-mono text-xs font-semibold">
                    {sku.onlineSku}
                  </td>
                  <td className="px-4 py-3">
                    {sku.components.length > 0 ? (
                      <div className="space-y-1">
                        {sku.components.map((component) => (
                          <p
                            key={`${sku.onlineSku}-${component.masterSku}-qty`}
                            className="inline-flex rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700"
                          >
                            {number.format(component.multiplier)} unidad(es)
                          </p>
                        ))}
                      </div>
                    ) : (
                      <span className="font-semibold text-amber-700">Pendiente</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {sku.components.length > 0 ? (
                      <div className="space-y-1">
                        {sku.components.map((component) => (
                          <p
                            key={`${sku.onlineSku}-${component.masterSku}`}
                            className={component.exists ? "" : "text-red-700"}
                          >
                            <span className="font-mono text-xs font-semibold">
                              {component.masterSku}
                            </span>{" "}
                            <span className="text-zinc-500">
                              {component.exists ? component.masterName : "no existe"}
                            </span>
                          </p>
                        ))}
                      </div>
                    ) : (
                      <span className="font-semibold text-amber-700">
                        Sin SKU maestro
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-[360px] rounded-md bg-slate-50 px-3 py-2 ring-1 ring-slate-100">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                        Publicacion
                      </p>
                      <p
                        className={`mt-1 leading-5 ${
                          sku.title === sku.onlineSku
                            ? "text-zinc-400"
                            : "text-zinc-600"
                        }`}
                      >
                        {sku.title === sku.onlineSku
                          ? "Sin titulo completo detectado todavia"
                          : sku.title}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <MappingForm
                      onlineSku={sku.onlineSku}
                      defaultMasterSku={firstComponent?.masterSku}
                      defaultMultiplier={firstComponent?.multiplier}
                    />
                  </td>
                </tr>
              );
            })}
            {status.skuEquivalences.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-zinc-500" colSpan={5}>
                  Aun no hay equivalencias cargadas.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function equivalenceRowId(onlineSku: string) {
  return `equivalencia-${onlineSku
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}`;
}

function PendingCostImportsSection({
  status,
}: {
  status: Awaited<ReturnType<typeof buildMvpStatus>>;
}) {
  return (
    <details
      id="costos-sin-ligar"
      className="ct-action-panel group"
      open={status.pendingCostImports.length > 0}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <div>
          <h2 className="font-semibold">Costos sin ligar</h2>
          <p className="text-sm text-zinc-500">
            Costos del Excel que debes ligar a SKU maestro o descartar.
          </p>
        </div>
        <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-700">
          {number.format(status.pendingCostImports.length)}
        </span>
      </summary>
      <div className="divide-y divide-zinc-100">
        {status.pendingCostImports.map((item) => (
          <div key={item.costSku} className="px-4 py-3 text-sm">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_560px]">
              <div>
                <p className="font-mono text-xs font-semibold">{item.costSku}</p>
                <p className="text-zinc-600">
                  Costo promedio: {money.format(item.averageUnitCost)}
                </p>
                {item.suggestedMasterSkus.length > 0 ? (
                  <p className="mt-1 text-xs text-zinc-500">
                    Sugerencias: {item.suggestedMasterSkus.join(", ")}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-zinc-500">
                    Sin sugerencia clara. Elige manualmente el SKU maestro.
                  </p>
                )}
              </div>
              <CostMappingForm item={item} />
            </div>
          </div>
        ))}
        {status.pendingCostImports.length === 0 ? (
          <p className="px-4 py-5 text-sm text-zinc-500">
            No hay costos pendientes de ligar.
          </p>
        ) : null}
      </div>
    </details>
  );
}

function CostMappingForm({
  item,
}: {
  item: Awaited<ReturnType<typeof buildMvpStatus>>["pendingCostImports"][number];
}) {
  return (
    <div className="min-w-0 space-y-2">
      <AsyncForm action="/api/costs/map" className="flex items-start gap-2" successMessage="Costo ligado">
        <input type="hidden" name="costSku" value={item.costSku} />
        <input type="hidden" name="averageUnitCost" value={item.averageUnitCost} />
        <input type="hidden" name="redirectTo" value="/setup" />
        <div className="flex-1">
          <textarea
            name="masterSkus"
            placeholder="SKUs maestros, uno por linea o separados por coma"
            defaultValue={item.suggestedMasterSkus.join("\n")}
            required
            rows={3}
            className="min-h-24 w-full rounded-md border border-zinc-300 px-2 py-2 text-sm outline-none focus:border-zinc-950"
          />
          <p className="mt-1 text-xs text-zinc-500">
            Ejemplo: CASCO NEGRO, CASCO ROSA, CASCO BLANCO.
          </p>
        </div>
        <button className="h-10 rounded-md bg-zinc-950 px-3 text-sm font-semibold text-white hover:bg-zinc-800">
          Ligar costo
        </button>
      </AsyncForm>
      <AsyncForm
        action="/api/costs/discard"
        successMessage="Costo descartado"
        confirmTitle="Descartar costo"
        confirmMessage="Este costo importado dejara de aparecer como pendiente. Solo hazlo si sabes que no corresponde a ningun SKU."
      >
        <input type="hidden" name="costSku" value={item.costSku} />
        <input type="hidden" name="redirectTo" value="/setup" />
        <button className="h-9 rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
          Descartar
        </button>
      </AsyncForm>
    </div>
  );
}

function MappingForm({
  onlineSku,
  defaultMasterSku = "",
  defaultMultiplier = 1,
}: {
  onlineSku: string;
  defaultMasterSku?: string;
  defaultMultiplier?: number;
}) {
  return (
    <AsyncForm
      action="/api/skus/map"
      className="grid min-w-0 gap-2 md:grid-cols-[1fr_120px_90px]"
      successMessage="Equivalencia guardada"
    >
      <input type="hidden" name="onlineSku" value={onlineSku} />
      <input type="hidden" name="redirectTo" value="/setup" />
      <label className="text-xs font-semibold text-zinc-600">
        SKU maestro
        <input
          name="masterSku"
          list="master-skus"
          placeholder="SKU maestro"
          defaultValue={defaultMasterSku}
          required
          className="mt-1 h-9 w-full rounded-md border border-zinc-300 px-2 text-sm font-normal text-zinc-950 outline-none focus:border-zinc-950"
        />
      </label>
      <label className="text-xs font-semibold text-zinc-600">
        Unidades
        <input
          name="multiplier"
          type="number"
          min="0.0001"
          step="0.0001"
          defaultValue={defaultMultiplier}
          required
          className="mt-1 h-9 w-full rounded-md border border-zinc-300 px-2 text-sm font-normal text-zinc-950 outline-none focus:border-zinc-950"
        />
      </label>
      <button className="mt-5 h-9 rounded-md bg-zinc-950 px-3 text-sm font-semibold text-white hover:bg-zinc-800">
        Guardar
      </button>
    </AsyncForm>
  );
}

function MasterSkuDatalist({
  masterSkus,
}: {
  masterSkus: Array<{ masterSku: string; name: string }>;
}) {
  return (
    <datalist id="master-skus">
      {masterSkus.map((product) => (
        <option key={product.masterSku} value={product.masterSku}>
          {product.name}
        </option>
      ))}
    </datalist>
  );
}

function PendingCard({
  title,
  rows,
}: {
  title: string;
  rows: Array<[string, number]>;
}) {
  return (
    <section className="ct-ops-panel">
      <div className="ct-ops-panel-header justify-start">
        <FileSpreadsheet size={18} className="text-slate-300" />
        <h2 className="ct-ops-title">{title}</h2>
      </div>
      <div className="grid gap-3 p-4 md:grid-cols-2">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className={`ct-ops-mini-metric ${
              value === 0 ? "border-emerald-400/20" : ""
            }`}
          >
            <p className="ct-ops-mini-metric-label">{label}</p>
            <p className={`ct-ops-mini-metric-value ${value === 0 ? "is-ok" : ""}`}>
              {number.format(value)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
