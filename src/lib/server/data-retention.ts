import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { hasDatabaseUrl } from "./database-url";

const defaultRawPayloadRetentionMonths = 6;
const defaultDetailedSalesRetentionMonths = 24;
const defaultSummaryRetentionYears = 10;
const defaultBatchSize = 500;

export type DataRetentionPolicy = {
  rawPayloadRetentionMonths: number;
  detailedSalesRetentionMonths: number;
  summaryRetentionYears: number;
  batchSize: number;
};

export type DataRetentionResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  rawPayloadCutoff: string;
  detailedSalesCutoff: string;
  policy: DataRetentionPolicy;
  saleOrderPayloadsChecked: number;
  saleOrderPayloadsCompacted: number;
  localStoreOrganizationsChecked: number;
  localStoreOrganizationsUpdated: number;
  localStoreOrdersCompacted: number;
  estimatedBytesRemoved: number;
};

type SalePayloadRow = {
  id: string;
  payload: unknown;
};

export function getDataRetentionPolicy(): DataRetentionPolicy {
  return {
    rawPayloadRetentionMonths: readIntEnv(
      "MELI_RAW_PAYLOAD_RETENTION_MONTHS",
      defaultRawPayloadRetentionMonths,
      1,
      60,
    ),
    detailedSalesRetentionMonths: readIntEnv(
      "SALES_DETAIL_RETENTION_MONTHS",
      defaultDetailedSalesRetentionMonths,
      6,
      120,
    ),
    summaryRetentionYears: readIntEnv(
      "REPORT_SUMMARY_RETENTION_YEARS",
      defaultSummaryRetentionYears,
      1,
      20,
    ),
    batchSize: readIntEnv("DATA_RETENTION_BATCH_SIZE", defaultBatchSize, 50, 5_000),
  };
}

export async function runDataRetention(params?: {
  now?: Date;
  batchSize?: number;
}): Promise<DataRetentionResult> {
  const policy = getDataRetentionPolicy();
  const now = params?.now ?? new Date();
  const rawPayloadCutoff = subtractCalendarMonths(
    now,
    policy.rawPayloadRetentionMonths,
  );
  const detailedSalesCutoff = subtractCalendarMonths(
    now,
    policy.detailedSalesRetentionMonths,
  );
  const batchSize = params?.batchSize ?? policy.batchSize;
  const result: DataRetentionResult = {
    ok: true,
    rawPayloadCutoff: rawPayloadCutoff.toISOString(),
    detailedSalesCutoff: detailedSalesCutoff.toISOString(),
    policy: { ...policy, batchSize },
    saleOrderPayloadsChecked: 0,
    saleOrderPayloadsCompacted: 0,
    localStoreOrganizationsChecked: 0,
    localStoreOrganizationsUpdated: 0,
    localStoreOrdersCompacted: 0,
    estimatedBytesRemoved: 0,
  };

  if (!hasDatabaseUrl()) {
    return {
      ...result,
      skipped: true,
      reason: "DATABASE_URL is not configured",
    };
  }

  const candidates = await prisma.$queryRaw<SalePayloadRow[]>`
    SELECT id, payload
    FROM "SaleOrder"
    WHERE "orderedAt" < ${rawPayloadCutoff}
      AND payload IS NOT NULL
      AND COALESCE(payload #>> '{raw,retentionCompact}', 'false') <> 'true'
    ORDER BY "orderedAt" ASC
    LIMIT ${batchSize}
  `;
  result.saleOrderPayloadsChecked = candidates.length;

  for (const row of candidates) {
    const compacted = compactMarketplaceOrderPayloadForRetention(row.payload, now);
    if (compacted === row.payload) {
      continue;
    }

    result.estimatedBytesRemoved += Math.max(
      0,
      estimateJsonBytes(row.payload) - estimateJsonBytes(compacted),
    );
    await prisma.saleOrder.update({
      where: { id: row.id },
      data: { payload: toJsonValue(compacted) },
    });
    result.saleOrderPayloadsCompacted += 1;
  }

  const stores = await prisma.localDataStore.findMany({
    select: {
      organizationId: true,
      payload: true,
    },
  });
  result.localStoreOrganizationsChecked = stores.length;

  for (const store of stores) {
    const compacted = compactLocalDataStoreForRetention(
      store.payload,
      rawPayloadCutoff,
      now,
    );
    if (!compacted.changed) {
      continue;
    }

    result.estimatedBytesRemoved += Math.max(
      0,
      estimateJsonBytes(store.payload) - estimateJsonBytes(compacted.payload),
    );
    await prisma.localDataStore.update({
      where: { organizationId: store.organizationId },
      data: { payload: toJsonValue(compacted.payload) },
    });
    result.localStoreOrganizationsUpdated += 1;
    result.localStoreOrdersCompacted += compacted.ordersCompacted;
  }

  return result;
}

export function compactMarketplaceOrderPayloadForRetention(
  value: unknown,
  now = new Date(),
) {
  const payload = asRecord(value);
  if (!payload) {
    return value;
  }

  const raw = asRecord(payload.raw);
  if (!raw || raw.retentionCompact === true) {
    return value;
  }

  return {
    ...payload,
    raw: compactMeliRawForRetention(raw, now),
  };
}

function compactLocalDataStoreForRetention(
  value: unknown,
  rawPayloadCutoff: Date,
  now: Date,
) {
  const payload = asRecord(value);
  if (!payload || !Array.isArray(payload.marketplaceOrders)) {
    return { changed: false, ordersCompacted: 0, payload: value };
  }

  let ordersCompacted = 0;
  const marketplaceOrders = payload.marketplaceOrders.map((order) => {
    const orderRecord = asRecord(order);
    if (!orderRecord) {
      return order;
    }

    const orderedAt = new Date(String(orderRecord.orderedAt ?? ""));
    if (
      !Number.isFinite(orderedAt.getTime()) ||
      orderedAt >= rawPayloadCutoff ||
      !orderRecord.raw ||
      asRecord(orderRecord.raw)?.retentionCompact === true
    ) {
      return order;
    }

    ordersCompacted += 1;
    return {
      ...orderRecord,
      raw: compactMeliRawForRetention(orderRecord.raw, now),
    };
  });

  if (ordersCompacted === 0) {
    return { changed: false, ordersCompacted: 0, payload: value };
  }

  return {
    changed: true,
    ordersCompacted,
    payload: {
      ...payload,
      marketplaceOrders,
    },
  };
}

function compactMeliRawForRetention(value: unknown, now: Date) {
  const raw = asRecord(value) ?? {};
  const pack = asRecord(raw.pack);
  const orderRequest = asRecord(raw.order_request);
  const shipping = asRecord(raw.shipping);
  const logistic = asRecord(shipping?.logistic);

  return {
    retentionCompact: true,
    compactedAt: now.toISOString(),
    id: raw.id,
    pack_id: raw.pack_id,
    packId: raw.packId,
    family_pack_id: raw.family_pack_id,
    pack: pack
      ? {
          id: pack.id,
          pack_id: pack.pack_id,
        }
      : null,
    order_request: orderRequest?.id
      ? {
          id: orderRequest.id,
        }
      : null,
    status: raw.status,
    date_created: raw.date_created,
    date_closed: raw.date_closed,
    total_amount: raw.total_amount,
    paid_amount: raw.paid_amount,
    currency_id: raw.currency_id,
    payments: asRecordArray(raw.payments).map((payment) => ({
      id: payment.id,
      payment_id: payment.payment_id,
    })),
    shipping: shipping
      ? {
          id: shipping.id,
          logistic_type: shipping.logistic_type,
          logistic: logistic
            ? {
                type: logistic.type,
              }
            : undefined,
        }
      : undefined,
  };
}

function subtractCalendarMonths(date: Date, months: number) {
  const copy = new Date(date);
  copy.setUTCMonth(copy.getUTCMonth() - months);
  return copy;
}

function readIntEnv(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(Math.floor(value), max));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value
        .map((entry) => asRecord(entry))
        .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    : [];
}

function estimateJsonBytes(value: unknown) {
  return Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
