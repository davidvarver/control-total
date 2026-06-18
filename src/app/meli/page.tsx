export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  AlertTriangle,
  BadgeDollarSign,
  Boxes,
  ExternalLink,
  ReceiptText,
  ShoppingCart,
  Store,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AsyncForm } from "@/components/async-form";
import { UnmappedSkuBulkForm } from "@/components/unmapped-sku-bulk-form";
import { formatDateTimeMx } from "@/lib/format";
import { requirePermission } from "@/lib/server/auth-store";
import { readLocalStore, type LocalFullBillingCharge } from "@/lib/server/local-store";
import { listRecentSyncRuns } from "@/lib/server/sync-runs";

type FullBillingBucket = LocalFullBillingCharge["ageBucket"];

type MeliSummary = {
  organization: {
    id: string;
    name: string;
  };
  accounts: Array<{
    id: string;
    alias: string;
    externalAccountId: string;
    nickname?: string;
    siteId?: string;
    tokenExpiresAt: string;
    status: string;
    lastSyncAt?: string;
    salesBackfill?: {
      from: string;
      to: string;
      offset: number;
      startedAt: string;
      completedAt?: string;
      lastRunAt?: string;
      lastTotal?: number;
    };
    salesAutomation?: {
      lastRecentRunAt?: string;
      lastRunAt?: string;
      lastMode?: "backfill" | "basic_import" | "recent" | "skip_recent";
      lastChecked?: number;
      lastImported?: number;
      lastTotal?: number;
      lastBacklogRemaining?: number;
      nextRecommendedMinutes?: number;
      lastError?: string;
    };
  }>;
  stats: {
    importedOrders: number;
    grossAmount: number;
    charges: number;
    unmappedItems: number;
    fullUnits: number;
    fullMappedUnits: number;
    fullUnmappedItems: number;
    fullSyncedAt?: string;
    pendingBillingOrders: number;
    fullBillingAmount: number;
    fullBillingUnits: number;
    fullBillingPeriod?: string;
    fullBillingSyncedAt?: string;
    nextSyncLabel: string;
  };
  fullBillingRows: Array<{
    key: string;
    productTitle: string;
    externalSku?: string | null;
    externalProductId?: string | null;
    inventoryId?: string | null;
    size?: string | null;
    buckets: Record<FullBillingBucket, { amount: number; units: number }>;
    totalAmount: number;
    totalUnits: number;
  }>;
  unmappedItems: Array<{
    id: string;
    orderId: string;
    externalSku: string;
    title: string;
    quantity: number;
    channel: string;
    marketplaceAccountId: string;
    accountAlias: string;
    archived: boolean;
  }>;
  masterProducts: Array<{
    masterSku: string;
    name: string;
  }>;
  recentOrders: Array<{
    externalOrderId: string;
    status: string;
    orderedAt: string;
    grossAmount: number;
    currency: string;
    items: Array<{
      externalSku: string;
      title: string;
      quantity: number;
      unitPrice: number;
      masterSku: string | null;
      consumedQuantity: number | null;
      warehouseId: string;
      logisticType: string | null;
    }>;
    charges: Array<{
      type: string;
      amount: number;
    }>;
  }>;
  recentSyncRuns: Array<{
    id: string;
    jobType: string;
    status: string;
    startedAt: string;
    finishedAt?: string;
    durationMs?: number;
    checked: number;
    imported: number;
    pending: number;
    total: number;
    errorMessage?: string;
  }>;
};

type GroupedUnmappedItem = MeliSummary["unmappedItems"][number] & {
  orderIds: string[];
};

type MeliPageProps = {
  searchParams: Promise<{
    error?: string;
    orders_synced?: string;
    orders_unmapped?: string;
    full_synced?: string;
    full_mapped?: string;
    full_unmapped?: string;
    full_audited?: string;
    full_audit_unmapped?: string;
    listing_images_scanned?: string;
    listing_images_updated?: string;
    full_billing_synced?: string;
    full_billing_total?: string;
    full_billing_period?: string;
    sku_mapped?: string;
    connected?: string;
    reconnected?: string;
    disconnected?: string;
    sync_pending?: string;
    archivados?: string;
  }>;
};

const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});

const fullBillingBuckets: Array<{
  key: FullBillingBucket;
  label: string;
}> = [
  { key: "up_to_2_months", label: "Hasta 2 meses" },
  { key: "2_to_4_months", label: "2 a 4 meses" },
  { key: "4_to_6_months", label: "4 a 6 meses" },
  { key: "6_to_12_months", label: "6 a 12 meses" },
  { key: "over_12_months", label: "Mas de 12 meses" },
  { key: "other", label: "Otros" },
];

function createEmptyFullBillingBuckets() {
  return Object.fromEntries(
    fullBillingBuckets.map((bucket) => [bucket.key, { amount: 0, units: 0 }]),
  ) as Record<FullBillingBucket, { amount: number; units: number }>;
}

function getLatestFullBillingPeriod(charges: LocalFullBillingCharge[]) {
  return charges
    .map((charge) => charge.period)
    .filter(Boolean)
    .sort()
    .at(-1);
}

function buildUnmappedSkuArchiveId(input: {
  channel: string;
  marketplaceAccountId: string;
  externalSku: string;
}) {
  return [
    input.channel || "unknown",
    input.marketplaceAccountId || "manual",
    input.externalSku,
  ]
    .join("::")
    .toLowerCase();
}

function groupFullBillingCharges(charges: LocalFullBillingCharge[]) {
  const grouped = new Map<
    string,
    MeliSummary["fullBillingRows"][number]
  >();

  for (const charge of charges) {
    const key =
      charge.inventoryId ??
      charge.externalProductId ??
      charge.externalSku ??
      charge.productTitle;
    const row =
      grouped.get(key) ??
      {
        key,
        productTitle: charge.productTitle,
        externalSku: charge.externalSku,
        externalProductId: charge.externalProductId,
        inventoryId: charge.inventoryId,
        size: charge.size,
        buckets: createEmptyFullBillingBuckets(),
        totalAmount: 0,
        totalUnits: 0,
      };

    row.buckets[charge.ageBucket].amount += charge.amount;
    row.buckets[charge.ageBucket].units += charge.units;
    row.totalAmount += charge.amount;
    row.totalUnits += charge.units;
    grouped.set(key, row);
  }

  return [...grouped.values()].sort((a, b) => b.totalAmount - a.totalAmount);
}

function getAccountSyncView(account: MeliSummary["accounts"][number]) {
  if (account.status === "disabled") {
    return {
      label: "Desvinculada",
      detail: "Esta cuenta no sincroniza ventas, Full ni cargos. El historial importado se conserva.",
      tone: "zinc" as const,
      backlog: 0,
      total: 0,
      checked: 0,
      imported: 0,
      completed: 0,
      lastRunAt: account.salesAutomation?.lastRunAt ?? account.lastSyncAt,
      progress: 0,
    };
  }

  const automation = account.salesAutomation;
  const backfill = account.salesBackfill;
  const backlog =
    automation?.lastBacklogRemaining ??
    (backfill && !backfill.completedAt && backfill.lastTotal
      ? Math.max(0, backfill.lastTotal - backfill.offset)
      : 0);
  const total = automation?.lastTotal ?? backfill?.lastTotal ?? 0;
  const checked = automation?.lastChecked ?? 0;
  const imported = automation?.lastImported ?? 0;
  const lastRunAt = automation?.lastRunAt ?? backfill?.lastRunAt ?? account.lastSyncAt;
  const progress =
    total > 0 ? Math.min(100, Math.max(0, ((total - backlog) / total) * 100)) : 0;
  const completed = total > 0 ? Math.max(0, total - backlog) : 0;

  if (automation?.lastError) {
    return {
      label: "Revisar error",
      detail: automation.lastError,
      tone: "red" as const,
      backlog,
      total,
      checked,
      imported,
      completed,
      lastRunAt,
      progress,
    };
  }

  if (backfill && !backfill.completedAt) {
    return {
      label: "Cargando historial",
      detail:
        backlog > 0
          ? `Faltan ${backlog.toLocaleString("es-MX")} ordenes del periodo.`
          : "Revisando historial del mes actual.",
      tone: "amber" as const,
      backlog,
      total,
      checked,
      imported,
      completed,
      lastRunAt,
      progress,
    };
  }

  if (automation?.lastMode === "skip_recent") {
    return {
      label: "Esperando siguiente hora",
      detail: `Vuelve a revisar en ${automation.nextRecommendedMinutes ?? 10} min.`,
      tone: "zinc" as const,
      backlog,
      total,
      checked,
      imported,
      completed,
      lastRunAt,
      progress: 100,
    };
  }

  if (automation?.lastMode === "recent" || backfill?.completedAt) {
    return {
      label: "Al dia",
      detail: "El historial base ya termino; ahora revisa ventas recientes.",
      tone: "emerald" as const,
      backlog,
      total,
      checked,
      imported,
      completed,
      lastRunAt,
      progress: 100,
    };
  }

  return {
    label: "Pendiente de cron",
    detail: "Aun no hay una corrida automatica registrada.",
    tone: "amber" as const,
    backlog,
    total,
    checked,
    imported,
    completed,
    lastRunAt,
    progress,
  };
}

async function getSummary(): Promise<MeliSummary> {
  const store = await readLocalStore();
  const recentSyncRuns = await listRecentSyncRuns(store.organization.id, 12);
  const orders = store.marketplaceOrders.filter(
    (order) => order.channel === "mercado_libre",
  );
  const accounts = store.marketplaceAccounts.filter(
    (account) => account.channel === "mercado_libre",
  );
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const archivedIds = new Set((store.archivedUnmappedSkus ?? []).map((item) => item.id));
  const unmappedById = new Map<string, GroupedUnmappedItem>();
  for (const order of orders) {
    for (const item of order.items.filter((entry) => !entry.masterSku)) {
      const account = accountById.get(order.marketplaceAccountId);
      const id = buildUnmappedSkuArchiveId({
        channel: order.channel,
        marketplaceAccountId: order.marketplaceAccountId,
        externalSku: item.externalSku,
      });
      const existing = unmappedById.get(id);
      if (existing) {
        existing.quantity += item.quantity;
        if (!existing.orderIds.includes(order.externalOrderId)) {
          existing.orderIds.push(order.externalOrderId);
        }
        if (!existing.title && item.title) {
          existing.title = item.title;
        }
        continue;
      }

      unmappedById.set(id, {
        id,
        orderId: order.externalOrderId,
        orderIds: [order.externalOrderId],
        externalSku: item.externalSku,
        title: item.title,
        quantity: item.quantity,
        channel: order.channel,
        marketplaceAccountId: order.marketplaceAccountId,
        accountAlias:
          account?.nickname ??
          account?.alias ??
          order.marketplaceAccountId ??
          "sin cuenta",
        archived: archivedIds.has(id),
      });
    }
  }
  const unmappedItems = [...unmappedById.values()]
    .map(({ orderIds, ...item }) => ({
      ...item,
      orderId:
        orderIds.length > 1
          ? `${orderIds[0]} +${orderIds.length - 1}`
          : orderIds[0],
    }))
    .sort((left, right) => left.externalSku.localeCompare(right.externalSku));
  const fullBillingPeriod = getLatestFullBillingPeriod(store.fullBillingCharges ?? []);
  const fullBillingCharges = (store.fullBillingCharges ?? []).filter(
    (charge) => charge.period === fullBillingPeriod,
  );
  const fullBillingRows = groupFullBillingCharges(fullBillingCharges);

  return {
    organization: store.organization,
    accounts: accounts.map(({ accessToken, refreshToken, ...account }) => {
      void accessToken;
      void refreshToken;
      return account;
    }),
    stats: {
      importedOrders: orders.length,
      grossAmount: orders.reduce((sum, order) => sum + order.grossAmount, 0),
      charges: orders.reduce(
        (sum, order) =>
          sum + order.charges.reduce((chargeSum, charge) => chargeSum + charge.amount, 0),
        0,
      ),
      unmappedItems: unmappedItems.filter((item) => !item.archived).length,
      fullUnits: store.fullStockSync?.totalFulfillmentUnits ?? 0,
      fullMappedUnits: store.fullStockSync?.mappedUnits ?? 0,
      fullUnmappedItems: store.fullStockSync?.unmappedItems.length ?? 0,
      fullSyncedAt: store.fullStockSync?.syncedAt,
      pendingBillingOrders: orders.filter((order) => order.netReceivedAmount === null)
        .length,
      fullBillingAmount: fullBillingCharges.reduce(
        (sum, charge) => sum + charge.amount,
        0,
      ),
      fullBillingUnits: fullBillingCharges.reduce(
        (sum, charge) => sum + charge.units,
        0,
      ),
      fullBillingPeriod: fullBillingPeriod ?? undefined,
      fullBillingSyncedAt: fullBillingCharges
        .map((charge) => charge.syncedAt)
        .sort()
        .at(-1),
      nextSyncLabel: "automatica; ventas cada hora cerrada, Full diario y cargos Full mensual",
    },
    fullBillingRows,
    unmappedItems,
    masterProducts: store.products
      .slice()
      .sort((a, b) => a.masterSku.localeCompare(b.masterSku))
      .map((product) => ({
        masterSku: product.masterSku,
        name: product.name,
      })),
    recentOrders: orders
      .slice()
      .sort(
        (a, b) =>
          new Date(b.orderedAt).getTime() - new Date(a.orderedAt).getTime(),
      )
      .slice(0, 50),
    recentSyncRuns: recentSyncRuns.map((run) => ({
      id: run.id,
      jobType: run.jobType,
      status: run.status,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString(),
      durationMs: run.durationMs ?? undefined,
      checked: run.checked,
      imported: run.imported,
      pending: run.pending,
      total: run.total,
      errorMessage: run.errorMessage ?? undefined,
    })),
  };
}

export default async function MeliPage({ searchParams }: MeliPageProps) {
  const user = await requirePermission("integrations.write");
  const params = await searchParams;
  const summary = await getSummary();
  const showArchived = params.archivados === "1";
  const visibleUnmappedItems = summary.unmappedItems.filter((item) =>
    showArchived ? item.archived : !item.archived,
  );

  return (
    <AppShell
      active="meli"
      title="Mercado Libre"
      subtitle="Conecta cuentas, trae ventas, separa stock Full y resuelve SKUs pendientes."
      organization={summary.organization.name}
      userEmail={user.email}
      actions={
        <>
            <a
              href="/api/integrations/meli/connect?returnTo=/meli"
              className="ct-button ct-button-secondary"
            >
              <ExternalLink size={16} />
              Conectar / reconectar
            </a>
        </>
      }
    >
      <div className="ct-ops-page">

        {params.error ? (
          <div className="ct-ops-alert is-danger text-sm font-medium">
            {params.error}
          </div>
        ) : null}
        {params.connected ? (
          <div className="ct-ops-alert is-ok text-sm font-medium">
            Cuenta de Mercado Libre conectada. El sistema arranco sincronizacion inicial
            con los limites seguros actuales.
          </div>
        ) : null}
        {params.reconnected ? (
          <div className="ct-ops-alert is-ok text-sm font-medium">
            Cuenta de Mercado Libre reconectada. Se conservan ventas, avance de backfill
            y sincronizacion automatica; no empieza desde cero.
          </div>
        ) : null}
        {params.disconnected ? (
          <div className="ct-ops-alert text-sm font-medium">
            Cuenta desvinculada. Se borraron los tokens y se conserva el historial importado.
          </div>
        ) : null}
        {params.sync_pending ? (
          <div className="ct-ops-alert is-warn text-sm font-medium">
            La cuenta quedo conectada, pero Meli no dejo terminar la sincronizacion inicial.
            El cron continuara desde el avance guardado.
          </div>
        ) : null}
        {params.orders_synced ? (
          <div className="ct-ops-alert is-ok text-sm font-medium">
            Ventas actualizadas en esta corrida: {params.orders_synced} ordenes.
            {params.orders_unmapped && Number(params.orders_unmapped) > 0
              ? ` Quedaron ${params.orders_unmapped} items sin mapear.`
              : ""}
          </div>
        ) : null}
        {params.full_synced ? (
          <div className="ct-ops-alert is-ok text-sm font-medium">
            Full sincronizado: {params.full_synced} unidades detectadas.
            {params.full_mapped ? ` ${params.full_mapped} unidades mapeadas.` : ""}
            {params.full_unmapped && Number(params.full_unmapped) > 0
              ? ` Quedaron ${params.full_unmapped} SKUs Full sin mapear.`
              : ""}
          </div>
        ) : null}
        {params.full_audited ? (
          <div className="ct-ops-alert text-sm font-medium">
            Auditoria Full lista: {params.full_audited} unidades consultadas en Meli sin reemplazar tu inventario esperado.
            {params.full_audit_unmapped && Number(params.full_audit_unmapped) > 0
              ? ` Quedaron ${params.full_audit_unmapped} SKUs Full sin mapear.`
              : ""}
          </div>
        ) : null}
        {params.listing_images_scanned ? (
          <div className="ct-ops-alert is-ok text-sm font-medium">
            Fotos de publicaciones actualizadas: {params.listing_images_scanned} publicaciones revisadas.
            {params.listing_images_updated
              ? ` ${params.listing_images_updated} SKUs online mejorados.`
              : ""}
          </div>
        ) : null}
        {params.full_billing_synced ? (
          <div className="ct-ops-alert is-ok text-sm font-medium">
            Cargos Full actualizados: {params.full_billing_synced} cargos del periodo{" "}
            {params.full_billing_period}.
            {params.full_billing_total
              ? ` Total: ${money.format(Number(params.full_billing_total))}.`
              : ""}
          </div>
        ) : null}
        {params.sku_mapped ? (
          <div className="ct-ops-alert is-ok text-sm font-medium">
            SKU {params.sku_mapped} creado/mapeado.
          </div>
        ) : null}

        <section className="ct-ops-hero">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="ct-ops-kicker">
                Automatico
              </p>
              <h2 className="ct-ops-title mt-1">Estado de sincronizacion</h2>
              <p className="ct-ops-copy max-w-3xl">
                El cron trabaja por lotes controlados: procesa hasta 150 ordenes por corrida,
                guarda avance y continua en la siguiente hora hasta quedar al dia.
              </p>
            </div>
            <div className="ct-ops-inline-card text-xs font-semibold text-slate-200">
              Cron activo: cada hora. Importa horas cerradas; la hora en curso espera al siguiente corte.
            </div>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {summary.accounts.map((account) => {
              const sync = getAccountSyncView(account);

              return (
                <div
                  key={`sync-${account.id}`}
                  className={`ct-ops-kpi ${
                    sync.tone === "emerald"
                      ? "is-ok"
                      : sync.tone === "amber"
                        ? "is-warn"
                        : sync.tone === "red"
                          ? "is-danger"
                          : ""
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="ct-ops-kpi-label">{account.alias}</p>
                      <p className="ct-ops-kpi-detail">{account.nickname ?? account.externalAccountId}</p>
                    </div>
                    <span className="ct-ops-status is-muted">
                      {sync.label}
                    </span>
                  </div>
                  <p className="ct-ops-kpi-detail">{sync.detail}</p>
                  {sync.total > 0 ? (
                    <p className="mt-2 text-xs font-semibold opacity-80">
                      Avance del periodo: {sync.completed.toLocaleString("es-MX")} de{" "}
                      {sync.total.toLocaleString("es-MX")} ordenes (
                      {Math.round(sync.progress).toLocaleString("es-MX")}%).
                    </p>
                  ) : null}
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/70">
                    <div
                      className="h-full rounded-full bg-current"
                      style={{ width: `${sync.progress}%` }}
                    />
                  </div>
                  <div className="mt-3 grid gap-2 text-xs sm:grid-cols-5">
                    <div>
                      <p className="opacity-70">Ultima corrida</p>
                      <p className="font-semibold">
                        {sync.lastRunAt ? formatDateTimeMx(sync.lastRunAt) : "Sin datos"}
                      </p>
                    </div>
                    <div>
                      <p className="opacity-70">Revisadas</p>
                      <p className="font-semibold">{sync.checked.toLocaleString("es-MX")}</p>
                    </div>
                    <div>
                      <p className="opacity-70">Guardadas</p>
                      <p className="font-semibold">{sync.imported.toLocaleString("es-MX")}</p>
                    </div>
                    <div>
                      <p className="opacity-70">Avance total</p>
                      <p className="font-semibold">
                        {sync.total > 0
                          ? `${sync.completed.toLocaleString("es-MX")}/${sync.total.toLocaleString("es-MX")}`
                          : "Sin datos"}
                      </p>
                    </div>
                    <div>
                      <p className="opacity-70">Pendientes</p>
                      <p className="font-semibold">{sync.backlog.toLocaleString("es-MX")}</p>
                    </div>
                  </div>
                </div>
              );
            })}
            {summary.accounts.length === 0 ? (
              <div className="ct-ops-alert is-warn text-sm font-medium">
                Conecta una cuenta para empezar a sincronizar.
              </div>
            ) : null}
          </div>
        </section>

        <section className="ct-ops-panel">
          <div className="ct-ops-panel-header">
            <div>
              <h2 className="ct-ops-title">Bitacora de sincronizacion</h2>
              <p className="ct-ops-copy">
                Ultimas corridas reales del cron: exito, errores, tiempo y avance por lote.
              </p>
            </div>
          </div>
          <div>
            {summary.recentSyncRuns.map((run) => (
              <div
                key={run.id}
                className="grid gap-2 border-t border-white/10 px-4 py-3 text-sm md:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr_1.2fr]"
              >
                <div>
                  <p className="font-semibold text-white">
                    {run.jobType === "meli-hourly"
                      ? "Ventas Meli"
                      : run.jobType === "meli-full-billing-monthly"
                        ? "Cargos Full"
                        : run.jobType}
                  </p>
                  <p className="ct-ops-copy text-xs">{formatDateTimeMx(run.startedAt)}</p>
                </div>
                <div>
                  <p className="ct-ops-mini-metric-label">Estado</p>
                  <span
                    className={`ct-ops-status ${
                      run.status === "success"
                        ? "is-ok"
                        : run.status === "failed"
                          ? "is-danger"
                          : run.status === "skipped"
                            ? "is-warn"
                            : "is-muted"
                    }`}
                  >
                    {run.status}
                  </span>
                </div>
                <div>
                  <p className="ct-ops-mini-metric-label">Revisadas</p>
                  <p className="font-semibold">{run.checked.toLocaleString("es-MX")}</p>
                </div>
                <div>
                  <p className="ct-ops-mini-metric-label">Guardadas</p>
                  <p className="font-semibold">{run.imported.toLocaleString("es-MX")}</p>
                </div>
                <div>
                  <p className="ct-ops-mini-metric-label">Pendiente / tiempo</p>
                  <p className="font-semibold">
                    {run.pending.toLocaleString("es-MX")}
                    {run.total > 0 ? ` de ${run.total.toLocaleString("es-MX")}` : ""}
                    {run.durationMs ? ` | ${Math.round(run.durationMs / 1000)}s` : ""}
                  </p>
                  {run.errorMessage ? (
                    <p className="mt-1 line-clamp-2 text-xs text-red-700">
                      {run.errorMessage}
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
            {summary.recentSyncRuns.length === 0 ? (
              <p className="ct-ops-empty">
                Aun no hay corridas registradas en tablas. La siguiente corrida del cron aparecera aqui.
              </p>
            ) : null}
          </div>
        </section>

        <section className="ct-ops-kpi-grid">
          <div className="ct-ops-kpi">
            <div className="flex items-center justify-between">
              <p className="ct-ops-kpi-label">Cuentas</p>
              <span className="ct-ops-icon"><Store size={18} /></span>
            </div>
            <p className="ct-ops-kpi-value">{summary.accounts.length}</p>
          </div>
          <div className="ct-ops-kpi">
            <div className="flex items-center justify-between">
              <p className="ct-ops-kpi-label">Ordenes</p>
              <span className="ct-ops-icon"><ShoppingCart size={18} /></span>
            </div>
            <p className="ct-ops-kpi-value">
              {summary.stats.importedOrders}
            </p>
          </div>
          <div className="ct-ops-kpi">
            <div className="flex items-center justify-between">
              <p className="ct-ops-kpi-label">Venta importada</p>
              <span className="ct-ops-icon"><BadgeDollarSign size={18} /></span>
            </div>
            <p className="ct-ops-kpi-value">
              {money.format(summary.stats.grossAmount)}
            </p>
          </div>
          <Link
            href="#skus-sin-mapear"
            className="ct-ops-kpi is-warn"
          >
            <div className="flex items-center justify-between">
              <p className="ct-ops-kpi-label">SKUs sin mapear</p>
              <AlertTriangle size={18} className="text-amber-600" />
            </div>
            <p className="ct-ops-kpi-value is-warn">
              {summary.stats.unmappedItems}
            </p>
            <p className="ct-ops-kpi-detail">
              Ir a resolver
            </p>
          </Link>
          <div className="ct-ops-kpi">
            <div className="flex items-center justify-between">
              <p className="ct-ops-kpi-label">Stock Full</p>
              <span className="ct-ops-icon"><Boxes size={18} /></span>
            </div>
            <p className="ct-ops-kpi-value">
              {summary.stats.fullMappedUnits}
            </p>
            <p className="ct-ops-kpi-detail">
              {summary.stats.fullSyncedAt
                ? `Sync ${formatDateTimeMx(summary.stats.fullSyncedAt)}`
                : "Pendiente"}
            </p>
          </div>
          <div className="ct-ops-kpi is-danger">
            <div className="flex items-center justify-between">
              <p className="ct-ops-kpi-label">Cargos Full</p>
              <ReceiptText size={18} className="text-red-500" />
            </div>
            <p className="ct-ops-kpi-value is-danger">
              {money.format(summary.stats.fullBillingAmount)}
            </p>
            <p className="ct-ops-kpi-detail">
              {summary.stats.fullBillingPeriod
                ? `Periodo ${summary.stats.fullBillingPeriod}`
                : "Sin sincronizar"}
            </p>
          </div>
          <div className="ct-ops-kpi is-warn">
            <div className="flex items-center justify-between">
              <p className="ct-ops-kpi-label">Dinero pendiente</p>
              <AlertTriangle size={18} className="text-amber-600" />
            </div>
            <p className="ct-ops-kpi-value is-warn">
              {summary.stats.pendingBillingOrders}
            </p>
            <p className="ct-ops-kpi-detail">
              Actualizacion automatica {summary.stats.nextSyncLabel}
            </p>
          </div>
        </section>

        <section id="cuentas" className="ct-ops-panel scroll-mt-28">
          <div className="ct-ops-panel-header">
            <h2 className="ct-ops-title">Cuentas conectadas</h2>
          </div>
          <div>
            {summary.accounts.map((account) => (
              <div
                key={account.id}
                className="grid gap-3 border-t border-white/10 px-4 py-3 text-sm xl:grid-cols-[minmax(170px,1fr)_140px_90px_100px_minmax(170px,1fr)_300px]"
              >
                <div>
                  <p className="font-semibold">{account.alias}</p>
                  <p className="ct-ops-copy text-xs">{account.id}</p>
                </div>
                <p>{account.nickname ?? "Sin nickname"}</p>
                <p>{account.siteId ?? "N/A"}</p>
                <p>
                  <span
                    className={`ct-ops-status ${
                      account.status === "connected"
                        ? "is-ok"
                        : account.status === "disabled"
                          ? "is-muted"
                          : "is-danger"
                    }`}
                  >
                    {account.status === "connected"
                      ? "Conectada"
                      : account.status === "disabled"
                        ? "Desvinculada"
                        : "Error"}
                  </span>
                </p>
                <p className="ct-ops-copy">
                  Sync:{" "}
                  {account.lastSyncAt
                    ? formatDateTimeMx(account.lastSyncAt)
                    : "pendiente"}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {account.status === "connected" ? (
                    <>
                      <AsyncForm
                        action="/api/integrations/meli/refresh-listing-images"
                        successMessage="Fotos actualizadas"
                      >
                        <input type="hidden" name="accountId" value={account.id} />
                        <input type="hidden" name="back" value="/meli#cuentas" />
                        <button
                          type="submit"
                          className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-3 py-2 text-xs font-black text-zinc-700 hover:bg-zinc-50"
                        >
                          <Store size={14} />
                          Actualizar fotos
                        </button>
                      </AsyncForm>
                      <AsyncForm
                        action="/api/integrations/meli/audit-full"
                        successMessage="Auditoria Full actualizada"
                      >
                        <input type="hidden" name="accountId" value={account.id} />
                        <input type="hidden" name="back" value="/meli" />
                        <button
                          type="submit"
                          className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-3 py-2 text-xs font-black text-zinc-700 hover:bg-zinc-50"
                        >
                          <Boxes size={14} />
                          Auditar Full/fotos
                        </button>
                      </AsyncForm>
                      <AsyncForm
                        action="/api/integrations/disconnect"
                        confirmTitle="Desvincular cuenta"
                        confirmMessage={`Vas a desvincular ${account.alias}. Se borraran los tokens y dejara de sincronizar, pero el historial importado se conserva.`}
                        confirmText="DESVINCULAR"
                        successMessage="Cuenta desvinculada"
                      >
                        <input type="hidden" name="accountId" value={account.id} />
                        <input type="hidden" name="back" value="/meli#cuentas" />
                        <button
                          type="submit"
                          className="ct-button ct-button-secondary text-xs text-red-200"
                        >
                          Desvincular
                        </button>
                      </AsyncForm>
                    </>
                  ) : (
                    <a
                      href="/api/integrations/meli/connect?returnTo=%2Fmeli%23cuentas"
                      className="ct-button ct-button-primary text-xs"
                    >
                      Reconectar
                    </a>
                  )}
                  <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-600">
                    {account.status === "connected"
                      ? "Sync automatico por cron externo."
                      : "No sincroniza mientras este desvinculada."}
                  </div>
                </div>
              </div>
            ))}
            {summary.accounts.length === 0 ? (
              <p className="ct-ops-empty">
                Aun no hay cuentas conectadas.
              </p>
            ) : null}
          </div>
        </section>

        <details id="full-billing" className="ct-action-panel scroll-mt-28">
          <summary>
            <div>
              <h2 className="font-semibold">Cargos Full por producto</h2>
              <p className="ct-muted-note">
                Almacenamiento, almacenamiento prolongado y otros cargos Full que Meli reporta por periodo.
              </p>
            </div>
            {summary.stats.fullBillingSyncedAt ? (
              <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600">
                Sync {formatDateTimeMx(summary.stats.fullBillingSyncedAt)}
              </span>
            ) : null}
          </summary>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-4 py-3">Producto</th>
                  {fullBillingBuckets.map((bucket) => (
                    <th key={bucket.key} className="px-4 py-3">
                      {bucket.label}
                    </th>
                  ))}
                  <th className="px-4 py-3">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {summary.fullBillingRows.map((row) => (
                  <tr key={row.key}>
                    <td className="px-4 py-3">
                      <p className="max-w-sm font-semibold">{row.productTitle}</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {row.externalSku ? `SKU ${row.externalSku}` : null}
                        {row.externalSku && row.inventoryId ? " | " : null}
                        {row.inventoryId ? `Inventory ${row.inventoryId}` : null}
                        {row.size ? ` | ${row.size}` : null}
                      </p>
                    </td>
                    {fullBillingBuckets.map((bucket) => {
                      const value = row.buckets[bucket.key];

                      return (
                        <td key={bucket.key} className="px-4 py-3">
                          {value.amount !== 0 || value.units !== 0 ? (
                            <>
                              <p className="font-semibold text-red-700">
                                {money.format(value.amount)}
                              </p>
                              {value.units > 0 ? (
                                <p className="text-xs text-zinc-500">
                                  {value.units} u.
                                </p>
                              ) : null}
                            </>
                          ) : (
                            <span className="text-zinc-300">-</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3">
                      <p className="font-semibold text-red-700">
                        {money.format(row.totalAmount)}
                      </p>
                      {row.totalUnits > 0 ? (
                        <p className="text-xs text-zinc-500">{row.totalUnits} u.</p>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {summary.fullBillingRows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-5 text-zinc-500" colSpan={8}>
                      Aun no se han sincronizado cargos Full. El cron mensual los actualiza automaticamente.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </details>

        <section
          id="skus-sin-mapear"
          className="ct-ops-panel scroll-mt-28 target:border-amber-300 target:ring-2 target:ring-amber-200"
        >
          <div className="ct-ops-panel-header">
            <div className="flex items-center gap-2">
              <Boxes size={18} className="text-slate-300" />
              <div>
                <h2 className="ct-ops-title">SKUs sin mapear</h2>
                <p className="ct-ops-copy">
                  Resuelve pendientes, crea productos por separado o archiva lo que no aplique.
                </p>
              </div>
            </div>
            {showArchived ? (
              <span className="ct-ops-status is-muted">
                Viendo archivados
              </span>
            ) : null}
          </div>
          <UnmappedSkuBulkForm
            items={visibleUnmappedItems}
            masterProducts={summary.masterProducts}
            showArchived={showArchived}
          />
        </section>

        <details className="ct-action-panel">
          <summary>
            <span>
              <span className="block font-semibold">Ordenes recientes</span>
              <span className="ct-muted-note block">Ultimas 50 ventas importadas desde Meli.</span>
            </span>
          </summary>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-4 py-3">Orden</th>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Venta</th>
                  <th className="px-4 py-3">Cargos</th>
                  <th className="px-4 py-3">Items</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {summary.recentOrders.map((order) => (
                  <tr key={order.externalOrderId}>
                    <td className="px-4 py-3 font-mono text-xs font-semibold">
                      <Link
                        href={`/ventas/${encodeURIComponent(order.externalOrderId)}`}
                        className="underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-950"
                      >
                        {order.externalOrderId}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {formatDateTimeMx(order.orderedAt)}
                    </td>
                    <td className="px-4 py-3">{order.status}</td>
                    <td className="px-4 py-3">{money.format(order.grossAmount)}</td>
                    <td className="px-4 py-3">
                      {money.format(
                        order.charges.reduce((sum, charge) => sum + charge.amount, 0),
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {order.items.map((item) => (
                        <div key={`${order.externalOrderId}-${item.externalSku}`}>
                          <span className="font-semibold">{item.externalSku}</span>
                          <span className="text-zinc-500">
                            {" "}
                            x {item.quantity}
                            {item.masterSku ? ` -> ${item.masterSku}` : " -> sin mapear"}
                            {` - ${(item.warehouseId ?? "wh_main") === "wh_full" ? "Full" : "Mi Bodega"}`}
                          </span>
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </AppShell>
  );
}
