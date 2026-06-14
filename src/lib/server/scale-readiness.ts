import { prisma } from "./prisma";
import { hasDatabaseUrl } from "./database-url";
import { getMeliSyncLimits } from "./sync-config";

const storageGbDivisor = 1024 ** 3;
const monthDays = 30;
const dayHours = 24;

export type ScaleReadinessCheck = {
  key: string;
  title: string;
  detail: string;
  ok: boolean;
};

export type ScaleReadiness = {
  targetMonthlyOrders: number;
  targetDailyOrders: number;
  targetHourlyOrders: number;
  hourlyCapacityOrders: number;
  hourlyCapacityMonthlyOrders: number;
  hourlyHeadroom: number | null;
  initialBackfillMonths: number;
  estimatedHistoricalOrders: number;
  estimatedCatchupHours: number | null;
  estimatedCatchupDays: number | null;
  adminBatchSize: number;
  estimatedAdminBatches: number | null;
  observedOrders: number;
  observedItems: number;
  observedCharges: number;
  observedComponents: number;
  averageDbBytesPerOrder: number | null;
  averagePayloadBytesPerOrder: number | null;
  projectedMonthlyDbBytes: number | null;
  projected12MonthDbGb: number | null;
  projected12MonthExtraStorageUsd: number | null;
  ready: boolean;
  verdict: string;
  checks: ScaleReadinessCheck[];
};

export async function buildScaleReadiness(
  organizationId: string,
): Promise<ScaleReadiness> {
  const targetMonthlyOrders = readIntEnv(
    "SCALE_TARGET_MONTHLY_ORDERS",
    30_000,
    1,
    1_000_000,
  );
  const includedStorageGb = readMoneyEnv("DATABASE_INCLUDED_STORAGE_GB", 30);
  const extraStorageUsdPerGb = readMoneyEnv(
    "DATABASE_EXTRA_STORAGE_USD_PER_GB_MONTH",
    0.25,
  );
  const syncLimits = getMeliSyncLimits();
  const targetDailyOrders = Math.ceil(targetMonthlyOrders / monthDays);
  const targetHourlyOrders = targetMonthlyOrders / monthDays / dayHours;
  const hourlyCapacityOrders = syncLimits.hourlyBackfillLimit;
  const hourlyCapacityMonthlyOrders = hourlyCapacityOrders * dayHours * monthDays;
  const hourlyHeadroom =
    targetHourlyOrders > 0 ? hourlyCapacityOrders / targetHourlyOrders : null;
  const estimatedHistoricalOrders =
    targetMonthlyOrders * syncLimits.initialBackfillMonths;
  const estimatedCatchupHours =
    hourlyCapacityOrders > 0
      ? Math.ceil(estimatedHistoricalOrders / hourlyCapacityOrders)
      : null;
  const estimatedCatchupDays =
    estimatedCatchupHours === null ? null : estimatedCatchupHours / dayHours;
  const adminBatchSize = syncLimits.adminBackfillDefault;
  const estimatedAdminBatches =
    adminBatchSize > 0 ? Math.ceil(estimatedHistoricalOrders / adminBatchSize) : null;

  const observed = await readObservedSaleStorage(organizationId);
  const totalDbBytes =
    observed.orderBytes +
    observed.itemBytes +
    observed.componentBytes +
    observed.chargeBytes;
  const averageDbBytesPerOrder =
    observed.orderCount > 0 ? totalDbBytes / observed.orderCount : null;
  const averagePayloadBytesPerOrder =
    observed.orderCount > 0 && observed.payloadBytes !== null
      ? observed.payloadBytes / observed.orderCount
      : null;
  const projectedMonthlyDbBytes =
    averageDbBytesPerOrder === null
      ? null
      : Math.round(averageDbBytesPerOrder * targetMonthlyOrders);
  const projected12MonthDbGb =
    projectedMonthlyDbBytes === null
      ? null
      : (projectedMonthlyDbBytes * 12) / storageGbDivisor;
  const projected12MonthExtraStorageUsd =
    projected12MonthDbGb === null
      ? null
      : Math.max(0, projected12MonthDbGb - includedStorageGb) *
        extraStorageUsdPerGb;

  const checks: ScaleReadinessCheck[] = [
    {
      key: "hourly-capacity",
      title: "Cron alcanza ventas nuevas",
      detail: `${hourlyCapacityOrders.toLocaleString("es-MX")} ordenes/hora contra ${targetHourlyOrders.toFixed(1)} esperadas/hora.`,
      ok: hourlyHeadroom !== null && hourlyHeadroom >= 2,
    },
    {
      key: "monthly-capacity",
      title: "Capacidad mensual teorica",
      detail: `${hourlyCapacityMonthlyOrders.toLocaleString("es-MX")} ordenes/mes si el cron corre cada hora.`,
      ok: hourlyCapacityMonthlyOrders >= targetMonthlyOrders * 1.5,
    },
    {
      key: "initial-sync",
      title: "Conexion inicial controlada",
      detail: `Primer jalon limitado a ${syncLimits.initialBackfillLimit.toLocaleString("es-MX")} ordenes; el resto entra por lotes.`,
      ok:
        syncLimits.initialBackfillLimit <= 1_000 &&
        syncLimits.initialBackfillMonths <= 2,
    },
    {
      key: "history-catchup",
      title: "Historial no entra de golpe",
      detail:
        estimatedCatchupDays === null
          ? "Sin limite horario valido para estimar catch-up."
          : `${estimatedHistoricalOrders.toLocaleString("es-MX")} ordenes historicas aprox. tardarian ${estimatedCatchupDays.toFixed(1)} dias si solo usamos cron horario.`,
      ok: estimatedCatchupDays !== null && estimatedCatchupDays <= 30,
    },
    {
      key: "storage-projection",
      title: "Storage DB proyectado",
      detail:
        projected12MonthDbGb === null
          ? "Aun no hay ventas suficientes para estimar storage con datos reales."
          : `12 meses a este tamano serian aprox. ${formatStorageGb(projected12MonthDbGb)} de tablas de ventas.`,
      ok: projected12MonthDbGb !== null && projected12MonthDbGb < includedStorageGb,
    },
  ];

  const ready = checks.every((check) => check.ok);
  const verdict = ready
    ? "Listo para piloto controlado de 30k/mes"
    : "Piloto posible, pero con condiciones";

  return {
    targetMonthlyOrders,
    targetDailyOrders,
    targetHourlyOrders,
    hourlyCapacityOrders,
    hourlyCapacityMonthlyOrders,
    hourlyHeadroom,
    initialBackfillMonths: syncLimits.initialBackfillMonths,
    estimatedHistoricalOrders,
    estimatedCatchupHours,
    estimatedCatchupDays,
    adminBatchSize,
    estimatedAdminBatches,
    observedOrders: observed.orderCount,
    observedItems: observed.itemCount,
    observedCharges: observed.chargeCount,
    observedComponents: observed.componentCount,
    averageDbBytesPerOrder,
    averagePayloadBytesPerOrder,
    projectedMonthlyDbBytes,
    projected12MonthDbGb,
    projected12MonthExtraStorageUsd,
    ready,
    verdict,
    checks,
  };
}

async function readObservedSaleStorage(organizationId: string) {
  const empty = {
    orderCount: 0,
    itemCount: 0,
    componentCount: 0,
    chargeCount: 0,
    orderBytes: 0,
    itemBytes: 0,
    componentBytes: 0,
    chargeBytes: 0,
    payloadBytes: null as number | null,
  };

  if (!hasDatabaseUrl() || !organizationId) {
    return empty;
  }

  try {
    const rows = await prisma.$queryRaw<
      Array<{
        order_count: bigint | number | string;
        item_count: bigint | number | string;
        component_count: bigint | number | string;
        charge_count: bigint | number | string;
        order_bytes: bigint | number | string | null;
        item_bytes: bigint | number | string | null;
        component_bytes: bigint | number | string | null;
        charge_bytes: bigint | number | string | null;
        payload_bytes: bigint | number | string | null;
      }>
    >`
      WITH org_orders AS (
        SELECT id
        FROM "SaleOrder"
        WHERE "organizationId" = ${organizationId}
      ),
      order_stats AS (
        SELECT
          COUNT(*)::bigint AS order_count,
          COALESCE(SUM(pg_column_size(so.*)), 0)::bigint AS order_bytes,
          COALESCE(SUM(pg_column_size(so.payload)), 0)::bigint AS payload_bytes
        FROM "SaleOrder" so
        WHERE so."organizationId" = ${organizationId}
      ),
      item_stats AS (
        SELECT
          COUNT(*)::bigint AS item_count,
          COALESCE(SUM(pg_column_size(soi.*)), 0)::bigint AS item_bytes
        FROM "SaleOrderItem" soi
        JOIN org_orders oo ON oo.id = soi."saleOrderId"
      ),
      component_stats AS (
        SELECT
          COUNT(*)::bigint AS component_count,
          COALESCE(SUM(pg_column_size(sic.*)), 0)::bigint AS component_bytes
        FROM "SaleItemComponent" sic
        JOIN "SaleOrderItem" soi ON soi.id = sic."saleOrderItemId"
        JOIN org_orders oo ON oo.id = soi."saleOrderId"
      ),
      charge_stats AS (
        SELECT
          COUNT(*)::bigint AS charge_count,
          COALESCE(SUM(pg_column_size(sc.*)), 0)::bigint AS charge_bytes
        FROM "SaleCharge" sc
        JOIN org_orders oo ON oo.id = sc."saleOrderId"
      )
      SELECT *
      FROM order_stats, item_stats, component_stats, charge_stats
    `;
    const row = rows[0];
    if (!row) {
      return empty;
    }

    return {
      orderCount: toNumber(row.order_count),
      itemCount: toNumber(row.item_count),
      componentCount: toNumber(row.component_count),
      chargeCount: toNumber(row.charge_count),
      orderBytes: toNumber(row.order_bytes),
      itemBytes: toNumber(row.item_bytes),
      componentBytes: toNumber(row.component_bytes),
      chargeBytes: toNumber(row.charge_bytes),
      payloadBytes: toNumber(row.payload_bytes),
    };
  } catch {
    return empty;
  }
}

function readIntEnv(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(Math.floor(value), max));
}

function readMoneyEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function toNumber(value: bigint | number | string | null | undefined) {
  if (typeof value === "bigint") {
    return Number(value);
  }
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatStorageGb(value: number) {
  if (value < 1) {
    return `${Math.max(0, value * 1024).toFixed(1)} MB`;
  }

  return `${value.toFixed(2)} GB`;
}
