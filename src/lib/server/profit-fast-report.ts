import { Prisma } from "@prisma/client";
import { hasDatabaseUrl } from "./database-url";
import {
  buildMonthlyProfitHistoryFromSnapshots,
  type MonthlyProfitHistorySnapshotRow,
} from "./monthly-snapshots";
import { prisma } from "./prisma";

type ProfitFastAggregateRow = {
  orders: number | bigint;
  grossAmount: unknown;
  estimatedReceived: unknown;
  productCost: unknown;
  additionalCosts: unknown;
  contributionProfit: unknown;
  lossOrders: number | bigint;
  pendingBillingOrders: number | bigint;
};

export type ProfitFastSummary = {
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
  lossOrders: number;
  pendingBillingOrders: number;
};

export async function buildProfitFastSummary(params: {
  organizationId: string;
  range: { from: string; to: string };
}): Promise<ProfitFastSummary | null> {
  if (!hasDatabaseUrl()) {
    return null;
  }

  const bounds = getReportDateBounds(params.range);
  if (!bounds) {
    return null;
  }

  const [aggregateRows, monthlyRows] = await Promise.all([
    readFastProfitAggregate({
      organizationId: params.organizationId,
      from: bounds.from,
      to: bounds.to,
    }),
    buildMonthlyProfitHistoryFromSnapshots({
      organizationId: params.organizationId,
    }),
  ]);
  const row = aggregateRows[0];
  const grossAmount = roundMoney(toNumber(row?.grossAmount));
  const contributionProfit = roundMoney(toNumber(row?.contributionProfit));
  const fullBillingCharges = roundMoney(
    calculateProratedMonthlyAmount(
      monthlyRows,
      params.range,
      "fullBillingCharges",
    ),
  );
  const operatingExpenses = roundMoney(
    calculateProratedMonthlyAmount(
      monthlyRows,
      params.range,
      "operatingExpenses",
    ),
  );
  const finalNetProfit = roundMoney(
    contributionProfit - fullBillingCharges - operatingExpenses,
  );

  return {
    month: params.range.from.slice(0, 7),
    orders: toNumber(row?.orders),
    grossAmount,
    estimatedReceived: roundMoney(toNumber(row?.estimatedReceived)),
    productCost: roundMoney(toNumber(row?.productCost)),
    additionalCosts: roundMoney(toNumber(row?.additionalCosts)),
    fullBillingCharges,
    contributionProfit,
    operatingExpenses,
    finalNetProfit,
    contributionMargin:
      grossAmount > 0 ? (contributionProfit / grossAmount) * 100 : 0,
    finalMargin: grossAmount > 0 ? (finalNetProfit / grossAmount) * 100 : 0,
    lossOrders: toNumber(row?.lossOrders),
    pendingBillingOrders: toNumber(row?.pendingBillingOrders),
  };
}

function readFastProfitAggregate(params: {
  organizationId: string;
  from: Date;
  to: Date;
}) {
  return prisma.$queryRaw<ProfitFastAggregateRow[]>`
    WITH order_base AS (
      SELECT
        o.id,
        o.status,
        o."grossAmount",
        o."netReceivedAmount",
        LOWER(REPLACE(REPLACE(o.status, '-', '_'), ' ', '_')) AS "normalizedStatus"
      FROM "SaleOrder" o
      WHERE o."organizationId" = ${params.organizationId}
        AND o."orderedAt" >= ${params.from}
        AND o."orderedAt" < ${params.to}
    ),
    charge_by_order AS (
      SELECT
        c."saleOrderId",
        COALESCE(SUM(c.amount), 0) AS "meliChargesAmount",
        COALESCE(
          SUM(c.amount) FILTER (WHERE COALESCE(c.source, '') LIKE 'full_fifo:%'),
          0
        ) AS "additionalCostsAmount"
      FROM "SaleCharge" c
      JOIN order_base o ON o.id = c."saleOrderId"
      GROUP BY c."saleOrderId"
    ),
    item_by_order AS (
      SELECT
        i."saleOrderId",
        COALESCE(SUM(c."totalCost"), 0) AS "productCostAmount"
      FROM "SaleOrderItem" i
      JOIN order_base o ON o.id = i."saleOrderId"
      LEFT JOIN "SaleItemComponent" c ON c."saleOrderItemId" = i.id
      GROUP BY i."saleOrderId"
    ),
    order_scope AS (
      SELECT
        o.id,
        o.status,
        o."grossAmount",
        o."netReceivedAmount",
        COALESCE(
          o."netReceivedAmount",
          o."grossAmount" - COALESCE(c."meliChargesAmount", 0),
          o."grossAmount"
        ) AS "estimatedReceived",
        COALESCE(c."additionalCostsAmount", 0) AS "additionalCostsAmount",
        COALESCE(i."productCostAmount", 0) AS "productCostAmount",
        o."normalizedStatus"
      FROM order_base o
      LEFT JOIN charge_by_order c ON c."saleOrderId" = o.id
      LEFT JOIN item_by_order i ON i."saleOrderId" = o.id
    ),
    active_orders AS (
      SELECT *
      FROM order_scope
      WHERE "normalizedStatus" NOT IN (
        'cancelled',
        'canceled',
        'cancelled_partially'
      )
    ),
    settled_orders AS (
      SELECT
        *,
        (
          "estimatedReceived"
            - "productCostAmount"
            - "additionalCostsAmount"
        ) AS "netProfit"
      FROM active_orders
      WHERE "netReceivedAmount" IS NOT NULL
    )
    SELECT
      COUNT(*)::int AS orders,
      COALESCE(SUM("grossAmount"), 0) AS "grossAmount",
      COALESCE(SUM("estimatedReceived"), 0) AS "estimatedReceived",
      COALESCE(SUM("productCostAmount"), 0) AS "productCost",
      COALESCE(SUM("additionalCostsAmount"), 0) AS "additionalCosts",
      COALESCE(SUM("netProfit"), 0) AS "contributionProfit",
      COUNT(*) FILTER (WHERE "netProfit" < 0)::int AS "lossOrders",
      (
        SELECT COUNT(*)::int
        FROM active_orders
        WHERE "netReceivedAmount" IS NULL
      ) AS "pendingBillingOrders"
    FROM settled_orders
  `;
}

function calculateProratedMonthlyAmount(
  rows: MonthlyProfitHistorySnapshotRow[],
  range: { from: string; to: string },
  field: "fullBillingCharges" | "operatingExpenses",
) {
  return rows.reduce((sum, row) => {
    const ratio = getMonthOverlapRatio(row.month, range);
    return sum + row[field] * ratio;
  }, 0);
}

function getMonthOverlapRatio(month: string, range: { from: string; to: string }) {
  const monthStart = `${month}-01`;
  const monthEnd = getMonthEndDate(month);
  const overlapStart = range.from > monthStart ? range.from : monthStart;
  const overlapEnd = range.to < monthEnd ? range.to : monthEnd;

  if (overlapStart > overlapEnd) {
    return 0;
  }

  const overlapDays = daysBetweenInclusive(overlapStart, overlapEnd);
  const monthDays = daysBetweenInclusive(monthStart, monthEnd);
  return monthDays > 0 ? overlapDays / monthDays : 0;
}

function getMonthEndDate(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber, 0));
  return date.toISOString().slice(0, 10);
}

function daysBetweenInclusive(from: string, to: string) {
  const fromDate = parseDateOnly(from);
  const toDate = parseDateOnly(to);
  if (!fromDate || !toDate) {
    return 0;
  }

  return Math.floor((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1;
}

function getReportDateBounds(range: { from?: string | null; to?: string | null }) {
  const from = parseDateOnly(range.from);
  const to = parseDateOnly(range.to);

  if (!from && !to) {
    return null;
  }

  const safeFrom = from ?? new Date(Date.UTC(2000, 0, 1, 6));
  const safeTo = addUtcDays(to ?? new Date(), 1);

  if (safeFrom.getTime() >= safeTo.getTime()) {
    return { from: safeTo, to: addUtcDays(safeFrom, 1) };
  }

  return { from: safeFrom, to: safeTo };
}

function parseDateOnly(value?: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 6, 0, 0, 0));
}

function addUtcDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toNumber(value: unknown) {
  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "number") {
    return value;
  }

  if (value instanceof Prisma.Decimal) {
    return value.toNumber();
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}
