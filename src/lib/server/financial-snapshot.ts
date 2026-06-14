import { cache } from "react";
import { prisma } from "./prisma";
import { hasDatabaseUrl } from "./database-url";

type FinancialPeriodSnapshot = {
  orders: number;
  grossAmount: number;
  estimatedReceived: number;
  productCost: number;
  additionalCosts: number;
  netProfit: number;
  pendingBilling: number;
  lossOrders: number;
};

export type FinancialSnapshot = {
  day: string;
  month: string;
  currentDay: FinancialPeriodSnapshot;
  currentMonth: FinancialPeriodSnapshot;
};

export const buildFinancialSnapshot = cache(async function buildFinancialSnapshot(
  organizationId: string,
): Promise<FinancialSnapshot | null> {
  if (!hasDatabaseUrl() || !organizationId) {
    return null;
  }

  const now = new Date();
  const day = getBusinessDay(now);
  const month = day.slice(0, 7);
  const dayRange = getBusinessDayRange(day);
  const monthRange = getBusinessMonthRange(month);

  try {
    const [currentDay, currentMonth] = await Promise.all([
      readFinancialPeriod(organizationId, dayRange.from, dayRange.to),
      readFinancialPeriod(organizationId, monthRange.from, monthRange.to),
    ]);

    return {
      day,
      month,
      currentDay,
      currentMonth,
    };
  } catch (error) {
    console.error("[FinancialSnapshot] Failed to read fast financial metrics:", error);
    return null;
  }
});

async function readFinancialPeriod(
  organizationId: string,
  from: Date,
  to: Date,
): Promise<FinancialPeriodSnapshot> {
  const rows = await prisma.$queryRaw<
    Array<{
      orders: bigint | number | string;
      gross_amount: bigint | number | string | null;
      estimated_received: bigint | number | string | null;
      product_cost: bigint | number | string | null;
      additional_costs: bigint | number | string | null;
      pending_billing: bigint | number | string;
      loss_orders: bigint | number | string;
    }>
  >`
    WITH order_costs AS (
      SELECT
        o.id,
        o.status,
        o."grossAmount",
        o."netReceivedAmount",
        COALESCE(
          (
            SELECT SUM(sic."totalCost")
            FROM "SaleOrderItem" soi
            JOIN "SaleItemComponent" sic ON sic."saleOrderItemId" = soi.id
            WHERE soi."saleOrderId" = o.id
          ),
          0
        ) AS product_cost,
        COALESCE(
          (
            SELECT SUM(sc.amount)
            FROM "SaleCharge" sc
            WHERE sc."saleOrderId" = o.id
              AND sc.source LIKE 'full_fifo:%'
          ),
          0
        ) AS additional_costs
      FROM "SaleOrder" o
      WHERE o."organizationId" = ${organizationId}
        AND o."orderedAt" >= ${from}
        AND o."orderedAt" < ${to}
    ),
    active_orders AS (
      SELECT *
      FROM order_costs
      WHERE LOWER(status) NOT LIKE '%cancel%'
    )
    SELECT
      COUNT(*)::bigint AS orders,
      COALESCE(SUM("grossAmount"), 0)::numeric AS gross_amount,
      COALESCE(SUM(COALESCE("netReceivedAmount", 0)), 0)::numeric AS estimated_received,
      COALESCE(SUM(product_cost), 0)::numeric AS product_cost,
      COALESCE(SUM(additional_costs), 0)::numeric AS additional_costs,
      COUNT(*) FILTER (WHERE "netReceivedAmount" IS NULL)::bigint AS pending_billing,
      COUNT(*) FILTER (
        WHERE "netReceivedAmount" IS NOT NULL
          AND COALESCE("netReceivedAmount", 0) - product_cost - additional_costs < 0
      )::bigint AS loss_orders
    FROM active_orders
  `;

  const row = rows[0];
  const grossAmount = toNumber(row?.gross_amount);
  const estimatedReceived = toNumber(row?.estimated_received);
  const productCost = toNumber(row?.product_cost);
  const additionalCosts = toNumber(row?.additional_costs);

  return {
    orders: toNumber(row?.orders),
    grossAmount,
    estimatedReceived,
    productCost,
    additionalCosts,
    netProfit: roundMoney(estimatedReceived - productCost - additionalCosts),
    pendingBilling: toNumber(row?.pending_billing),
    lossOrders: toNumber(row?.loss_orders),
  };
}

function getBusinessDay(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function getBusinessDayRange(day: string) {
  const from = new Date(`${day}T00:00:00-06:00`);
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + 1);
  return { from, to };
}

function getBusinessMonthRange(month: string) {
  const from = new Date(`${month}-01T00:00:00-06:00`);
  const to = new Date(from);
  to.setUTCMonth(to.getUTCMonth() + 1);
  return { from, to };
}

function toNumber(value: bigint | number | string | null | undefined) {
  if (typeof value === "bigint") {
    return Number(value);
  }
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
