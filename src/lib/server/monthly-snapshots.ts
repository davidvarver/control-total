import type { Channel, Prisma } from "@prisma/client";
import {
  calculateExpenseAmountForMonth,
  normalizeExpenseFrequency,
} from "../domain/expenses";
import { hasDatabaseUrl } from "./database-url";
import { getDataRetentionPolicy } from "./data-retention";
import { prisma } from "./prisma";

const defaultCreateBatchSize = 1_000;

type SalesMonthlyRow = {
  organizationId: string;
  month: string;
  channel: string;
  marketplaceAccountId: string | null;
  ordersCount: number | bigint;
  unitsSold: unknown;
  grossAmount: unknown;
  netReceivedAmount: unknown;
  meliChargesAmount: unknown;
  productCostAmount: unknown;
  additionalCostsAmount: unknown;
  profitAmount: unknown;
  unmappedItemsCount: number | bigint;
  missingCostItemsCount: number | bigint;
};

type ProductMonthlyRow = SalesMonthlyRow & {
  masterProductId: string | null;
  masterSku: string;
  productName: string | null;
  isMapped: boolean;
  saleFullCostsAmount: unknown;
};

type SnapshotStatusRow = {
  salesSummaryRows: number | bigint;
  productSummaryRows: number | bigint;
  monthsCovered: number | bigint;
  oldestMonth: string | null;
  latestMonth: string | null;
  latestCalculatedAt: Date | null;
};

type MonthlySnapshotProfitRow = {
  month: string;
  orders: number | bigint;
  grossAmount: unknown;
  estimatedReceived: unknown;
  productCost: unknown;
  additionalCosts: unknown;
  contributionProfit: unknown;
};

type LocalFullBillingSnapshotCharge = {
  period?: string | null;
  amount?: number | string | null;
};

export type MonthlySnapshotPolicy = {
  summaryRetentionYears: number;
  rebuildMonths: number;
  createBatchSize: number;
};

export type MonthlySnapshotResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  fromMonth: string;
  policy: MonthlySnapshotPolicy;
  salesSummariesWritten: number;
  productSummariesWritten: number;
  calculatedAt: string;
};

export type MonthlySnapshotStatus = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  policy: MonthlySnapshotPolicy;
  salesSummaryRows: number;
  productSummaryRows: number;
  monthsCovered: number;
  oldestMonth: string | null;
  latestMonth: string | null;
  latestCalculatedAt: Date | null;
};

export type MonthlyProfitHistorySnapshotRow = {
  month: string;
  orders: number;
  grossAmount: number;
  estimatedReceived: number;
  productCost: number;
  additionalCosts: number;
  fullBillingCharges: number;
  contributionProfit: number;
  operatingExpenses: number;
  finalNetProfit: number;
  contributionMargin: number;
  finalMargin: number;
};

export function getMonthlySnapshotPolicy(): MonthlySnapshotPolicy {
  const retention = getDataRetentionPolicy();
  const defaultRebuildMonths = retention.summaryRetentionYears * 12;

  return {
    summaryRetentionYears: retention.summaryRetentionYears,
    rebuildMonths: readIntEnv(
      "MONTHLY_SNAPSHOT_REBUILD_MONTHS",
      defaultRebuildMonths,
      1,
      retention.summaryRetentionYears * 12,
    ),
    createBatchSize: readIntEnv(
      "MONTHLY_SNAPSHOT_CREATE_BATCH_SIZE",
      defaultCreateBatchSize,
      100,
      10_000,
    ),
  };
}

export async function buildMonthlySnapshotStatus(): Promise<MonthlySnapshotStatus> {
  const policy = getMonthlySnapshotPolicy();
  const empty: MonthlySnapshotStatus = {
    ok: false,
    skipped: true,
    reason: "DATABASE_URL is not configured",
    policy,
    salesSummaryRows: 0,
    productSummaryRows: 0,
    monthsCovered: 0,
    oldestMonth: null,
    latestMonth: null,
    latestCalculatedAt: null,
  };

  if (!hasDatabaseUrl()) {
    return empty;
  }

  const rows = await prisma.$queryRaw<SnapshotStatusRow[]>`
    SELECT
      (SELECT COUNT(*) FROM "SalesMonthlySummary")::int AS "salesSummaryRows",
      (SELECT COUNT(*) FROM "ProductMonthlySummary")::int AS "productSummaryRows",
      (SELECT COUNT(DISTINCT month) FROM "SalesMonthlySummary")::int AS "monthsCovered",
      (SELECT MIN(month) FROM "SalesMonthlySummary") AS "oldestMonth",
      (SELECT MAX(month) FROM "SalesMonthlySummary") AS "latestMonth",
      GREATEST(
        COALESCE(
          (SELECT MAX("calculatedAt") FROM "SalesMonthlySummary"),
          'epoch'::timestamp
        ),
        COALESCE(
          (SELECT MAX("calculatedAt") FROM "ProductMonthlySummary"),
          'epoch'::timestamp
        )
      ) AS "latestCalculatedAt"
  `;
  const status = rows[0];
  const salesSummaryRows = toNumber(status?.salesSummaryRows);
  const productSummaryRows = toNumber(status?.productSummaryRows);
  const latestCalculatedAt =
    status?.latestCalculatedAt && status.latestCalculatedAt.getTime() > 0
      ? status.latestCalculatedAt
      : null;

  return {
    ok: salesSummaryRows > 0 && productSummaryRows > 0,
    policy,
    salesSummaryRows,
    productSummaryRows,
    monthsCovered: toNumber(status?.monthsCovered),
    oldestMonth: status?.oldestMonth ?? null,
    latestMonth: status?.latestMonth ?? null,
    latestCalculatedAt,
  };
}

export async function rebuildMonthlySnapshots(params?: {
  now?: Date;
  rebuildMonths?: number;
}): Promise<MonthlySnapshotResult> {
  const policy = getMonthlySnapshotPolicy();
  const calculatedAt = params?.now ?? new Date();
  const rebuildMonths = params?.rebuildMonths ?? policy.rebuildMonths;
  const fromDate = startOfMonthUtc(subtractCalendarMonths(calculatedAt, rebuildMonths - 1));
  const fromMonth = formatMonthKey(fromDate);

  const result: MonthlySnapshotResult = {
    ok: true,
    fromMonth,
    policy: { ...policy, rebuildMonths },
    salesSummariesWritten: 0,
    productSummariesWritten: 0,
    calculatedAt: calculatedAt.toISOString(),
  };

  if (!hasDatabaseUrl()) {
    return {
      ...result,
      ok: false,
      skipped: true,
      reason: "DATABASE_URL is not configured",
    };
  }

  const salesRows = await readSalesMonthlyRows(fromDate);
  const productRows = await readProductMonthlyRows(fromDate);

  const salesData = salesRows.map((row) => toSalesCreateInput(row, calculatedAt));
  const productData = productRows.map((row) => toProductCreateInput(row, calculatedAt));

  await prisma.$transaction(async (tx) => {
    await tx.productMonthlySummary.deleteMany({
      where: { month: { gte: fromMonth } },
    });
    await tx.salesMonthlySummary.deleteMany({
      where: { month: { gte: fromMonth } },
    });

    for (const batch of chunk(salesData, policy.createBatchSize)) {
      if (batch.length > 0) {
        await tx.salesMonthlySummary.createMany({ data: batch });
      }
    }

    for (const batch of chunk(productData, policy.createBatchSize)) {
      if (batch.length > 0) {
        await tx.productMonthlySummary.createMany({ data: batch });
      }
    }
  });

  return {
    ...result,
    salesSummariesWritten: salesData.length,
    productSummariesWritten: productData.length,
  };
}

export async function buildMonthlyProfitHistoryFromSnapshots(params: {
  organizationId: string;
}): Promise<MonthlyProfitHistorySnapshotRow[]> {
  if (!hasDatabaseUrl()) {
    return [];
  }

  const [salesRows, expenses, fullBillingCharges] = await Promise.all([
    prisma.$queryRaw<MonthlySnapshotProfitRow[]>`
      SELECT
        month,
        COALESCE(SUM("ordersCount"), 0)::int AS orders,
        COALESCE(SUM("grossAmount"), 0) AS "grossAmount",
        COALESCE(SUM("netReceivedAmount"), 0) AS "estimatedReceived",
        COALESCE(SUM("productCostAmount"), 0) AS "productCost",
        COALESCE(SUM("additionalCostsAmount"), 0) AS "additionalCosts",
        COALESCE(SUM("profitAmount"), 0) AS "contributionProfit"
      FROM "SalesMonthlySummary"
      WHERE "organizationId" = ${params.organizationId}
      GROUP BY month
      ORDER BY month DESC
    `,
    prisma.operatingExpense.findMany({
      where: { organizationId: params.organizationId },
    }),
    readFullBillingCharges(params.organizationId),
  ]);

  const months = new Map<string, MonthlyProfitHistorySnapshotRow>();
  function getMonth(month: string) {
    const row = months.get(month) ?? {
      month,
      orders: 0,
      grossAmount: 0,
      estimatedReceived: 0,
      productCost: 0,
      additionalCosts: 0,
      fullBillingCharges: 0,
      contributionProfit: 0,
      operatingExpenses: 0,
      finalNetProfit: 0,
      contributionMargin: 0,
      finalMargin: 0,
    };
    months.set(month, row);
    return row;
  }

  const reportMonths = new Set<string>();
  for (const row of salesRows) {
    reportMonths.add(row.month);
    const month = getMonth(row.month);
    month.orders += toNumber(row.orders);
    month.grossAmount += toNumber(row.grossAmount);
    month.estimatedReceived += toNumber(row.estimatedReceived);
    month.productCost += toNumber(row.productCost);
    month.additionalCosts += toNumber(row.additionalCosts);
    month.contributionProfit += toNumber(row.contributionProfit);
  }

  const expenseRows = expenses.map((expense) => ({
    month: expense.month,
    amount: toNumber(expense.amount),
    frequency: normalizeExpenseFrequency(expense.frequency),
    paidAt: expense.paidAt?.toISOString() ?? null,
    periodStart: expense.periodStart?.toISOString().slice(0, 10) ?? null,
    activeUntil: expense.activeUntil?.toISOString().slice(0, 10) ?? null,
    isRecurring: expense.isRecurring,
  }));

  for (const expense of expenseRows) {
    reportMonths.add(expense.month);
    if (expense.periodStart) {
      reportMonths.add(toBusinessMonth(expense.periodStart));
    }
    if (expense.paidAt) {
      reportMonths.add(toBusinessMonth(expense.paidAt));
    }
  }

  for (const charge of fullBillingCharges) {
    const period = normalizeMonthKey(charge.period);
    if (!period) {
      continue;
    }
    reportMonths.add(period);
    getMonth(period).fullBillingCharges += toNumber(charge.amount);
  }

  const currentMonth = getCurrentBusinessMonth();
  const currentBusinessDate = getCurrentBusinessDateOnly();
  reportMonths.add(currentMonth);
  for (const expense of expenseRows) {
    const firstMonth = expense.periodStart
      ? toBusinessMonth(expense.periodStart)
      : expense.paidAt
        ? toBusinessMonth(expense.paidAt)
        : expense.month;
    for (const month of enumerateMonths(firstMonth, currentMonth, 36)) {
      reportMonths.add(month);
    }
  }

  for (const month of reportMonths) {
    getMonth(month);
  }

  for (const expense of expenseRows) {
    for (const month of reportMonths) {
      const amount = calculateExpenseAmountForMonth(expense, month, {
        asOf: month === currentMonth ? currentBusinessDate : null,
      });
      if (amount > 0) {
        getMonth(month).operatingExpenses += amount;
      }
    }
  }

  return [...months.values()]
    .map((row) => {
      const grossAmount = roundMoney(row.grossAmount);
      const contributionProfit = roundMoney(row.contributionProfit);
      const finalNetProfit = roundMoney(
        contributionProfit - row.fullBillingCharges - row.operatingExpenses,
      );

      return {
        ...row,
        grossAmount,
        estimatedReceived: roundMoney(row.estimatedReceived),
        productCost: roundMoney(row.productCost),
        additionalCosts: roundMoney(row.additionalCosts),
        fullBillingCharges: roundMoney(row.fullBillingCharges),
        contributionProfit,
        operatingExpenses: roundMoney(row.operatingExpenses),
        finalNetProfit,
        contributionMargin:
          grossAmount > 0 ? (contributionProfit / grossAmount) * 100 : 0,
        finalMargin: grossAmount > 0 ? (finalNetProfit / grossAmount) * 100 : 0,
      };
    })
    .sort((a, b) => b.month.localeCompare(a.month));
}

export function formatMonthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function readSalesMonthlyRows(fromDate: Date) {
  return prisma.$queryRaw<SalesMonthlyRow[]>`
    WITH charge_by_order AS (
      SELECT
        "saleOrderId",
        COALESCE(SUM(amount), 0) AS "meliChargesAmount",
        COALESCE(
          SUM(amount) FILTER (WHERE COALESCE(source, '') LIKE 'full_fifo:%'),
          0
        ) AS "additionalCostsAmount"
      FROM "SaleCharge"
      GROUP BY "saleOrderId"
    ),
    order_scope AS (
      SELECT
        o.id,
        o."organizationId",
        to_char(date_trunc('month', o."orderedAt"), 'YYYY-MM') AS month,
        o.channel::text AS channel,
        COALESCE(o."marketplaceAccountId", '') AS "marketplaceAccountId",
        o."grossAmount",
        COALESCE(
          o."netReceivedAmount",
          o."grossAmount" - COALESCE(c."meliChargesAmount", 0),
          o."grossAmount"
        ) AS "netReceivedAmount",
        COALESCE(c."meliChargesAmount", 0) AS "meliChargesAmount",
        COALESCE(c."additionalCostsAmount", 0) AS "additionalCostsAmount"
      FROM "SaleOrder" o
      LEFT JOIN charge_by_order c ON c."saleOrderId" = o.id
      WHERE o."orderedAt" >= ${fromDate}
    ),
    item_rollup AS (
      SELECT
        i."saleOrderId",
        i.id,
        i.quantity,
        COUNT(c.id) AS "componentCount",
        COALESCE(SUM(c."totalCost"), 0) AS "productCostAmount"
      FROM "SaleOrderItem" i
      LEFT JOIN "SaleItemComponent" c ON c."saleOrderItemId" = i.id
      GROUP BY i."saleOrderId", i.id, i.quantity
    ),
    item_by_order AS (
      SELECT
        "saleOrderId",
        COALESCE(SUM(quantity), 0) AS "unitsSold",
        COALESCE(SUM("productCostAmount"), 0) AS "productCostAmount",
        COUNT(*) FILTER (WHERE "componentCount" = 0)::int AS "unmappedItemsCount",
        COUNT(*) FILTER (
          WHERE "componentCount" > 0 AND COALESCE("productCostAmount", 0) = 0
        )::int AS "missingCostItemsCount"
      FROM item_rollup
      GROUP BY "saleOrderId"
    )
    SELECT
      o."organizationId",
      o.month,
      o.channel,
      o."marketplaceAccountId",
      COUNT(*)::int AS "ordersCount",
      COALESCE(SUM(i."unitsSold"), 0) AS "unitsSold",
      COALESCE(SUM(o."grossAmount"), 0) AS "grossAmount",
      COALESCE(SUM(o."netReceivedAmount"), 0) AS "netReceivedAmount",
      COALESCE(SUM(o."meliChargesAmount"), 0) AS "meliChargesAmount",
      COALESCE(SUM(i."productCostAmount"), 0) AS "productCostAmount",
      COALESCE(SUM(o."additionalCostsAmount"), 0) AS "additionalCostsAmount",
      COALESCE(SUM(
        o."netReceivedAmount"
          - COALESCE(i."productCostAmount", 0)
          - o."additionalCostsAmount"
      ), 0)
        AS "profitAmount",
      COALESCE(SUM(i."unmappedItemsCount"), 0)::int AS "unmappedItemsCount",
      COALESCE(SUM(i."missingCostItemsCount"), 0)::int AS "missingCostItemsCount"
    FROM order_scope o
    LEFT JOIN item_by_order i ON i."saleOrderId" = o.id
    GROUP BY o."organizationId", o.month, o.channel, o."marketplaceAccountId"
    ORDER BY o.month ASC, o."organizationId" ASC
  `;
}

function readProductMonthlyRows(fromDate: Date) {
  return prisma.$queryRaw<ProductMonthlyRow[]>`
    WITH charge_by_order AS (
      SELECT
        "saleOrderId",
        COALESCE(SUM(amount), 0) AS "meliChargesAmount",
        COALESCE(
          SUM(amount) FILTER (WHERE COALESCE(source, '') LIKE 'full_fifo:%'),
          0
        ) AS "additionalCostsAmount"
      FROM "SaleCharge"
      GROUP BY "saleOrderId"
    ),
    order_scope AS (
      SELECT
        o.id,
        o."organizationId",
        to_char(date_trunc('month', o."orderedAt"), 'YYYY-MM') AS month,
        o.channel::text AS channel,
        COALESCE(o."marketplaceAccountId", '') AS "marketplaceAccountId",
        o."grossAmount",
        COALESCE(
          o."netReceivedAmount",
          o."grossAmount" - COALESCE(c."meliChargesAmount", 0),
          o."grossAmount"
        ) AS "netReceivedAmount",
        COALESCE(c."meliChargesAmount", 0) AS "meliChargesAmount",
        COALESCE(c."additionalCostsAmount", 0) AS "additionalCostsAmount"
      FROM "SaleOrder" o
      LEFT JOIN charge_by_order c ON c."saleOrderId" = o.id
      WHERE o."orderedAt" >= ${fromDate}
    ),
    item_rollup AS (
      SELECT
        i.id,
        i."saleOrderId",
        i."externalSku",
        i.quantity,
        i."grossAmount",
        COUNT(c.id) AS "componentCount"
      FROM "SaleOrderItem" i
      LEFT JOIN "SaleItemComponent" c ON c."saleOrderItemId" = i.id
      GROUP BY i.id, i."saleOrderId", i."externalSku", i.quantity, i."grossAmount"
    ),
    product_rows AS (
      SELECT
        o."organizationId",
        o.month,
        o.channel,
        o."marketplaceAccountId",
        o.id AS "saleOrderId",
        c."masterProductId",
        CASE
          WHEN c.id IS NULL THEN CONCAT('SIN_MAPEAR:', i."externalSku")
          ELSE mp."masterSku"
        END AS "masterSku",
        CASE
          WHEN c.id IS NULL THEN i."externalSku"
          ELSE mp.name
        END AS "productName",
        (c.id IS NOT NULL) AS "isMapped",
        CASE
          WHEN c.id IS NULL THEN i.quantity
          ELSE c."quantityConsumed"
        END AS "unitsSold",
        CASE
          WHEN i."componentCount" > 0 THEN 1::numeric / i."componentCount"
          ELSE 1::numeric
        END AS "componentShare",
        CASE
          WHEN o."grossAmount" <> 0 THEN i."grossAmount" / o."grossAmount"
          ELSE 0::numeric
        END AS "orderItemShare",
        COALESCE(c."totalCost", 0) AS "productCostAmount"
      FROM order_scope o
      JOIN item_rollup i ON i."saleOrderId" = o.id
      LEFT JOIN "SaleItemComponent" c ON c."saleOrderItemId" = i.id
      LEFT JOIN "MasterProduct" mp ON mp.id = c."masterProductId"
    )
    SELECT
      pr."organizationId",
      pr.month,
      pr.channel,
      pr."marketplaceAccountId",
      pr."masterProductId",
      pr."masterSku",
      pr."productName",
      pr."isMapped",
      COUNT(DISTINCT pr."saleOrderId")::int AS "ordersCount",
      COALESCE(SUM(pr."unitsSold"), 0) AS "unitsSold",
      COALESCE(SUM(os."grossAmount" * pr."orderItemShare" * pr."componentShare"), 0)
        AS "grossAmount",
      COALESCE(SUM(os."netReceivedAmount" * pr."orderItemShare" * pr."componentShare"), 0)
        AS "netReceivedAmount",
      COALESCE(SUM(os."meliChargesAmount" * pr."orderItemShare" * pr."componentShare"), 0)
        AS "meliChargesAmount",
      COALESCE(SUM(pr."productCostAmount"), 0) AS "productCostAmount",
      COALESCE(SUM(os."additionalCostsAmount" * pr."orderItemShare" * pr."componentShare"), 0)
        AS "additionalCostsAmount",
      COALESCE(SUM(os."additionalCostsAmount" * pr."orderItemShare" * pr."componentShare"), 0)
        AS "saleFullCostsAmount",
      COALESCE(
        SUM(
          (os."netReceivedAmount" * pr."orderItemShare" * pr."componentShare")
            - pr."productCostAmount"
            - (os."additionalCostsAmount" * pr."orderItemShare" * pr."componentShare")
        ),
        0
      ) AS "profitAmount",
      0::int AS "unmappedItemsCount",
      COUNT(*) FILTER (
        WHERE pr."isMapped" = true AND COALESCE(pr."productCostAmount", 0) = 0
      )::int AS "missingCostItemsCount"
    FROM product_rows pr
    JOIN order_scope os ON os.id = pr."saleOrderId"
    GROUP BY
      pr."organizationId",
      pr.month,
      pr.channel,
      pr."marketplaceAccountId",
      pr."masterProductId",
      pr."masterSku",
      pr."productName",
      pr."isMapped"
    ORDER BY pr.month ASC, pr."organizationId" ASC, pr."masterSku" ASC
  `;
}

function toSalesCreateInput(
  row: SalesMonthlyRow,
  calculatedAt: Date,
): Prisma.SalesMonthlySummaryCreateManyInput {
  return {
    organizationId: row.organizationId,
    month: row.month,
    channel: row.channel as Channel,
    marketplaceAccountId: row.marketplaceAccountId ?? "",
    ordersCount: toNumber(row.ordersCount),
    unitsSold: decimalString(row.unitsSold),
    grossAmount: decimalString(row.grossAmount),
    netReceivedAmount: decimalString(row.netReceivedAmount),
    meliChargesAmount: decimalString(row.meliChargesAmount),
    productCostAmount: decimalString(row.productCostAmount),
    additionalCostsAmount: decimalString(row.additionalCostsAmount),
    profitAmount: decimalString(row.profitAmount),
    unmappedItemsCount: toNumber(row.unmappedItemsCount),
    missingCostItemsCount: toNumber(row.missingCostItemsCount),
    calculatedAt,
  };
}

function toProductCreateInput(
  row: ProductMonthlyRow,
  calculatedAt: Date,
): Prisma.ProductMonthlySummaryCreateManyInput {
  const base = toSalesCreateInput(row, calculatedAt);

  return {
    organizationId: base.organizationId,
    month: base.month,
    channel: base.channel,
    marketplaceAccountId: base.marketplaceAccountId,
    ordersCount: base.ordersCount,
    unitsSold: base.unitsSold,
    grossAmount: base.grossAmount,
    netReceivedAmount: base.netReceivedAmount,
    meliChargesAmount: base.meliChargesAmount,
    productCostAmount: base.productCostAmount,
    saleFullCostsAmount: decimalString(row.saleFullCostsAmount),
    profitAmount: base.profitAmount,
    missingCostItemsCount: base.missingCostItemsCount,
    calculatedAt: base.calculatedAt,
    masterProductId: row.masterProductId,
    masterSku: row.masterSku,
    productName: row.productName,
    isMapped: row.isMapped,
  };
}

function decimalString(value: unknown) {
  if (value === null || value === undefined) {
    return "0";
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  const stringValue = String(value);
  return stringValue === "NaN" ? "0" : stringValue;
}

function toNumber(value: unknown) {
  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "number") {
    return value;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function startOfMonthUtc(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
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

function chunk<T>(items: T[], size: number) {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

async function readFullBillingCharges(organizationId: string) {
  const row = await prisma.localDataStore.findUnique({
    where: { organizationId },
    select: { payload: true },
  });
  const payload = asRecord(row?.payload);

  return asRecordArray(payload?.fullBillingCharges).map((charge) => ({
    period: typeof charge.period === "string" ? charge.period : null,
    amount:
      typeof charge.amount === "number" || typeof charge.amount === "string"
        ? charge.amount
        : 0,
  })) satisfies LocalFullBillingSnapshotCharge[];
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

function normalizeMonthKey(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  if (/^\d{4}-\d{2}$/.test(value)) {
    return value;
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return toBusinessMonth(value);
  }

  return null;
}

function toBusinessMonth(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return getCurrentBusinessMonth();
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}`;
}

function getCurrentBusinessMonth() {
  return getCurrentBusinessDateOnly().slice(0, 7);
}

function getCurrentBusinessDateOnly() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function enumerateMonths(startMonth: string, endMonth: string, maxMonths: number) {
  const start = parseMonth(startMonth);
  const end = parseMonth(endMonth);
  if (!start || !end || start > end) {
    return [];
  }

  const months: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end && months.length < maxMonths) {
    months.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

function parseMonth(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return null;
  }

  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 1, 1));
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
