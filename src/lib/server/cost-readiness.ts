import { prisma } from "./prisma";
import { readLocalStore } from "./local-store";
import { hasDatabaseUrl } from "./database-url";
import { getCurrentUser } from "./auth-store";
import { getDataRetentionPolicy } from "./data-retention";

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const storageGbDivisor = 1024 ** 3;

export type CostReadiness = {
  monthlyDbCostUsd: number;
  salesLast30Days: number;
  totalOrders: number;
  costPerSaleUsd: number | null;
  payloadBytes: number | null;
  averagePayloadBytesPerOrder: number | null;
  projected12MonthPayloadBytes: number | null;
  projected12MonthStorageGb: number | null;
  projected12MonthExtraStorageUsd: number | null;
  rawPayloadRetentionMonths: number;
  projectedRetainedPayloadBytes: number | null;
  projectedRetainedPayloadStorageGb: number | null;
  summary: string;
  detail: string;
};

export async function buildCostReadiness(): Promise<CostReadiness> {
  const user = await getCurrentUser();
  const fallbackStore = user ? null : await readLocalStore();
  const organizationId = user?.organizationId ?? fallbackStore?.organization.id ?? "";
  const monthlyDbCostUsd = readMoneyEnv("DATABASE_MONTHLY_COST_USD", 35);
  const includedStorageGb = readMoneyEnv("DATABASE_INCLUDED_STORAGE_GB", 30);
  const extraStorageUsdPerGb = readMoneyEnv("DATABASE_EXTRA_STORAGE_USD_PER_GB_MONTH", 0.25);
  const retentionPolicy = getDataRetentionPolicy();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const salesStats = await readSalesStats(organizationId, thirtyDaysAgo, fallbackStore);
  const salesLast30Days = salesStats.salesLast30Days;
  const totalOrders = salesStats.totalOrders;
  const payloadStats = await readPayloadStats(organizationId);
  const costPerSaleUsd =
    salesLast30Days > 0 ? monthlyDbCostUsd / salesLast30Days : null;
  const averagePayloadBytesPerOrder =
    payloadStats.orderCount > 0 && payloadStats.payloadBytes !== null
      ? payloadStats.payloadBytes / payloadStats.orderCount
      : null;
  const projected12MonthOrders = salesLast30Days * 12;
  const projected12MonthPayloadBytes =
    averagePayloadBytesPerOrder === null
      ? null
      : Math.round(averagePayloadBytesPerOrder * projected12MonthOrders);
  const projected12MonthStorageGb =
    projected12MonthPayloadBytes === null
      ? null
      : projected12MonthPayloadBytes / storageGbDivisor;
  const projected12MonthExtraStorageUsd =
    projected12MonthStorageGb === null
      ? null
      : Math.max(0, projected12MonthStorageGb - includedStorageGb) *
        extraStorageUsdPerGb;
  const projectedRetainedPayloadBytes =
    averagePayloadBytesPerOrder === null
      ? null
      : Math.round(
          averagePayloadBytesPerOrder *
            salesLast30Days *
            retentionPolicy.rawPayloadRetentionMonths,
        );
  const projectedRetainedPayloadStorageGb =
    projectedRetainedPayloadBytes === null
      ? null
      : projectedRetainedPayloadBytes / storageGbDivisor;

  return {
    monthlyDbCostUsd,
    salesLast30Days,
    totalOrders,
    costPerSaleUsd,
    payloadBytes: payloadStats.payloadBytes,
    averagePayloadBytesPerOrder,
    projected12MonthPayloadBytes,
    projected12MonthStorageGb,
    projected12MonthExtraStorageUsd,
    rawPayloadRetentionMonths: retentionPolicy.rawPayloadRetentionMonths,
    projectedRetainedPayloadBytes,
    projectedRetainedPayloadStorageGb,
    summary:
      costPerSaleUsd === null
        ? `${usdFormatter.format(monthlyDbCostUsd)} / mes sin ventas recientes`
        : `${usdFormatter.format(costPerSaleUsd)} por venta reciente`,
    detail:
      projected12MonthStorageGb === null
        ? "Aun no hay datos suficientes para proyectar 12 meses."
        : `Con retencion activa, el raw Meli vivo se mantiene alrededor de ${formatGb(
            projectedRetainedPayloadStorageGb ?? 0,
          )} (${retentionPolicy.rawPayloadRetentionMonths} meses). El historial viejo queda en tablas/resumen, no en payload pesado.`,
  };
}

async function readPayloadStats(organizationId: string) {
  if (!hasDatabaseUrl() || !organizationId) {
    return { orderCount: 0, payloadBytes: null };
  }

  try {
    const rows = await prisma.$queryRaw<
      Array<{ order_count: bigint | number | string; payload_bytes: bigint | number | string | null }>
    >`
      SELECT
        COUNT(*) AS order_count,
        COALESCE(SUM(pg_column_size(payload)), 0) AS payload_bytes
      FROM "SaleOrder"
      WHERE "organizationId" = ${organizationId}
    `;
    const row = rows[0];
    return {
      orderCount: toNumber(row?.order_count),
      payloadBytes: toNumber(row?.payload_bytes),
    };
  } catch {
    return { orderCount: 0, payloadBytes: null };
  }
}

async function readSalesStats(
  organizationId: string,
  thirtyDaysAgo: Date,
  fallbackStore: Awaited<ReturnType<typeof readLocalStore>> | null,
) {
  if (hasDatabaseUrl() && organizationId) {
    try {
      const [totalOrders, salesLast30Days] = await Promise.all([
        prisma.saleOrder.count({ where: { organizationId } }),
        prisma.saleOrder.count({
          where: { organizationId, orderedAt: { gte: thirtyDaysAgo } },
        }),
      ]);

      return { totalOrders, salesLast30Days };
    } catch {
      // Fall through to local fallback below.
    }
  }

  const marketplaceOrders = fallbackStore?.marketplaceOrders ?? [];
  return {
    totalOrders: marketplaceOrders.length,
    salesLast30Days: marketplaceOrders.filter((order) => {
      const orderedAt = new Date(order.orderedAt).getTime();
      return Number.isFinite(orderedAt) && orderedAt >= thirtyDaysAgo.getTime();
    }).length,
  };
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

function formatGb(value: number) {
  if (value < 1) {
    return `${Math.max(0, value * 1024).toFixed(1)} MB`;
  }

  return `${value.toFixed(2)} GB`;
}
