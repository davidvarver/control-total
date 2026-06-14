import { cache } from "react";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { hasDatabaseUrl } from "./database-url";

const storageGbDivisor = 1024 ** 3;
const monthWindowDays = 30;

const usageTables = [
  "LocalDataStore",
  "MasterProduct",
  "OnlineSku",
  "SkuComponent",
  "Warehouse",
  "InventoryBalance",
  "InventoryMovement",
  "MarketplaceAccount",
  "SaleOrder",
  "SaleOrderItem",
  "SaleItemComponent",
  "SaleCharge",
  "OperatingExpense",
  "FullInventoryLayer",
  "StockSyncQueue",
  "SyncRun",
  "AuditLog",
  "OrganizationUser",
  "Subscription",
  "SubscriptionPayment",
] as const;

export type ClientUsageRow = {
  organizationId: string;
  estimatedRowBytes: number;
  estimatedDbMb: number;
  salePayloadBytes: number;
  salePayloadMb: number;
  totalOrders: number;
  ordersLast30Days: number;
  grossLast30DaysMxn: number;
  syncRunsLast30Days: number;
  syncDurationMsLast30Days: number;
  syncMinutesLast30Days: number;
  syncCheckedLast30Days: number;
  syncImportedLast30Days: number;
  rows: {
    products: number;
    onlineSkus: number;
    orders: number;
    orderItems: number;
    charges: number;
    syncRuns: number;
  };
  share: {
    storage: number;
    recentOrders: number;
    syncTime: number;
    blended: number;
  };
  estimatedMonthlyDbCostUsd: number;
  estimatedMonthlyStorageOnlyUsd: number;
};

export type PlatformUsageReport = {
  since: Date;
  monthlyDbCostUsd: number;
  totalEstimatedDbBytes: number;
  totalEstimatedDbGb: number;
  totalOrdersLast30Days: number;
  totalSyncDurationMsLast30Days: number;
  byOrganizationId: Map<string, ClientUsageRow>;
};

export type MarketplaceAccountSummary = {
  id: string;
  channel: string;
  alias: string;
  nickname?: string | null;
  status: string;
  lastSyncAt?: string | null;
};

export const buildPlatformUsageReport = cache(async function buildPlatformUsageReport(
  input?: {
    monthlyDbCostUsd?: number;
    since?: Date;
  },
): Promise<PlatformUsageReport> {
  const since =
    input?.since ?? new Date(Date.now() - monthWindowDays * 24 * 60 * 60 * 1000);
  const monthlyDbCostUsd = input?.monthlyDbCostUsd ?? readMoneyEnv("DATABASE_MONTHLY_COST_USD", 35);
  const organizations = await prisma.organization.findMany({ select: { id: true } });
  const byOrganizationId = new Map<string, ClientUsageRow>();

  for (const organization of organizations) {
    byOrganizationId.set(organization.id, emptyUsageRow(organization.id));
  }

  if (!hasDatabaseUrl() || organizations.length === 0) {
    return {
      since,
      monthlyDbCostUsd,
      totalEstimatedDbBytes: 0,
      totalEstimatedDbGb: 0,
      totalOrdersLast30Days: 0,
      totalSyncDurationMsLast30Days: 0,
      byOrganizationId,
    };
  }

  for (const table of usageTables) {
    try {
      const rows = await prisma.$queryRawUnsafe<
        Array<{
          organizationId: string;
          row_count: bigint | number | string;
          row_bytes: bigint | number | string | null;
        }>
      >(
        `SELECT "organizationId", COUNT(*)::bigint AS row_count, COALESCE(SUM(pg_column_size(t.*)), 0)::bigint AS row_bytes FROM "${table}" t GROUP BY "organizationId"`,
      );

      for (const row of rows) {
        const usage = byOrganizationId.get(row.organizationId);
        if (!usage) continue;
        const rowCount = toNumber(row.row_count);
        const rowBytes = toNumber(row.row_bytes);
        usage.estimatedRowBytes += rowBytes;
        setMainRowCount(usage, table, rowCount);
      }
    } catch {
      // Keep admin usage best-effort. Older DBs may miss tables during migration windows.
    }
  }

  const [orderStats, recentOrderStats, payloadStats, syncStats] = await Promise.all([
    prisma.saleOrder.groupBy({
      by: ["organizationId"],
      _count: { _all: true },
    }),
    prisma.saleOrder.groupBy({
      by: ["organizationId"],
      where: { orderedAt: { gte: since } },
      _count: { _all: true },
      _sum: { grossAmount: true },
    }),
    prisma.$queryRaw<
      Array<{
        organizationId: string;
        payload_bytes: bigint | number | string | null;
      }>
    >`
      SELECT "organizationId", COALESCE(SUM(pg_column_size(payload)), 0)::bigint AS payload_bytes
      FROM "SaleOrder"
      GROUP BY "organizationId"
    `,
    prisma.syncRun.groupBy({
      by: ["organizationId"],
      where: { startedAt: { gte: since } },
      _count: { _all: true },
      _sum: {
        durationMs: true,
        checked: true,
        imported: true,
      },
    }),
  ]);

  for (const row of orderStats) {
    const usage = byOrganizationId.get(row.organizationId);
    if (!usage) continue;
    usage.totalOrders = row._count._all;
  }

  for (const row of recentOrderStats) {
    const usage = byOrganizationId.get(row.organizationId);
    if (!usage) continue;
    usage.ordersLast30Days = row._count._all;
    usage.grossLast30DaysMxn = Number(row._sum.grossAmount ?? 0);
  }

  for (const row of payloadStats) {
    const usage = byOrganizationId.get(row.organizationId);
    if (!usage) continue;
    usage.salePayloadBytes = toNumber(row.payload_bytes);
  }

  for (const row of syncStats) {
    const usage = byOrganizationId.get(row.organizationId);
    if (!usage) continue;
    usage.syncRunsLast30Days = row._count._all;
    usage.syncDurationMsLast30Days = row._sum.durationMs ?? 0;
    usage.syncCheckedLast30Days = row._sum.checked ?? 0;
    usage.syncImportedLast30Days = row._sum.imported ?? 0;
  }

  const totalEstimatedDbBytes = [...byOrganizationId.values()].reduce(
    (sum, row) => sum + row.estimatedRowBytes,
    0,
  );
  const totalOrdersLast30Days = [...byOrganizationId.values()].reduce(
    (sum, row) => sum + row.ordersLast30Days,
    0,
  );
  const totalSyncDurationMsLast30Days = [...byOrganizationId.values()].reduce(
    (sum, row) => sum + row.syncDurationMsLast30Days,
    0,
  );

  for (const row of byOrganizationId.values()) {
    const storageShare = totalEstimatedDbBytes > 0 ? row.estimatedRowBytes / totalEstimatedDbBytes : 0;
    const recentOrderShare =
      totalOrdersLast30Days > 0 ? row.ordersLast30Days / totalOrdersLast30Days : 0;
    const syncTimeShare =
      totalSyncDurationMsLast30Days > 0
        ? row.syncDurationMsLast30Days / totalSyncDurationMsLast30Days
        : 0;
    const blendedShare = storageShare * 0.5 + recentOrderShare * 0.3 + syncTimeShare * 0.2;

    row.estimatedDbMb = toMb(row.estimatedRowBytes);
    row.salePayloadMb = toMb(row.salePayloadBytes);
    row.syncMinutesLast30Days = round(row.syncDurationMsLast30Days / 60_000, 2);
    row.share = {
      storage: storageShare,
      recentOrders: recentOrderShare,
      syncTime: syncTimeShare,
      blended: blendedShare,
    };
    row.estimatedMonthlyDbCostUsd = round(monthlyDbCostUsd * blendedShare, 2);
    row.estimatedMonthlyStorageOnlyUsd = round(monthlyDbCostUsd * storageShare, 2);
  }

  return {
    since,
    monthlyDbCostUsd,
    totalEstimatedDbBytes,
    totalEstimatedDbGb: round(totalEstimatedDbBytes / storageGbDivisor, 4),
    totalOrdersLast30Days,
    totalSyncDurationMsLast30Days,
    byOrganizationId,
  };
});

export const listLocalMarketplaceAccountSummaries = cache(
  async function listLocalMarketplaceAccountSummaries(
    organizationIds: string[],
  ): Promise<Map<string, MarketplaceAccountSummary[]>> {
    const result = new Map<string, MarketplaceAccountSummary[]>();
    for (const organizationId of organizationIds) {
      result.set(organizationId, []);
    }

    if (!hasDatabaseUrl() || organizationIds.length === 0) {
      return result;
    }

    try {
      const rows = await prisma.$queryRaw<
        Array<{ organizationId: string; accounts: unknown }>
      >`
        SELECT "organizationId", payload -> 'marketplaceAccounts' AS accounts
        FROM "LocalDataStore"
        WHERE "organizationId" IN (${Prisma.join(organizationIds)})
      `;

      for (const row of rows) {
        result.set(row.organizationId, normalizeMarketplaceAccounts(row.accounts));
      }
    } catch {
      return result;
    }

    return result;
  },
);

function emptyUsageRow(organizationId: string): ClientUsageRow {
  return {
    organizationId,
    estimatedRowBytes: 0,
    estimatedDbMb: 0,
    salePayloadBytes: 0,
    salePayloadMb: 0,
    totalOrders: 0,
    ordersLast30Days: 0,
    grossLast30DaysMxn: 0,
    syncRunsLast30Days: 0,
    syncDurationMsLast30Days: 0,
    syncMinutesLast30Days: 0,
    syncCheckedLast30Days: 0,
    syncImportedLast30Days: 0,
    rows: {
      products: 0,
      onlineSkus: 0,
      orders: 0,
      orderItems: 0,
      charges: 0,
      syncRuns: 0,
    },
    share: {
      storage: 0,
      recentOrders: 0,
      syncTime: 0,
      blended: 0,
    },
    estimatedMonthlyDbCostUsd: 0,
    estimatedMonthlyStorageOnlyUsd: 0,
  };
}

function setMainRowCount(
  usage: ClientUsageRow,
  table: (typeof usageTables)[number],
  count: number,
) {
  if (table === "MasterProduct") usage.rows.products = count;
  if (table === "OnlineSku") usage.rows.onlineSkus = count;
  if (table === "SaleOrder") usage.rows.orders = count;
  if (table === "SaleOrderItem") usage.rows.orderItems = count;
  if (table === "SaleCharge") usage.rows.charges = count;
  if (table === "SyncRun") usage.rows.syncRuns = count;
}

function normalizeMarketplaceAccounts(value: unknown): MarketplaceAccountSummary[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const accounts: MarketplaceAccountSummary[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }

    const record = entry as Record<string, unknown>;
    const id = stringValue(record.id);
    const channel = stringValue(record.channel);
    const alias = stringValue(record.alias) || stringValue(record.nickname) || id;
    const status = stringValue(record.status) || stringValue(record.authStatus);
    if (!id || channel !== "mercado_libre") {
      continue;
    }

    accounts.push({
      id,
      channel,
      alias,
      nickname: stringValue(record.nickname) || null,
      status: status || "unknown",
      lastSyncAt: stringValue(record.lastSyncAt) || null,
    });
  }

  return accounts;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
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

function toMb(bytes: number) {
  return round(bytes / 1024 / 1024, 3);
}

function round(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
