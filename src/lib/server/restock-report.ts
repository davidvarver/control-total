import { cache } from "react";
import { buildInventoryReport, buildSalesReport } from "./reports";

const RESTOCK_WINDOW_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

export type RestockPriority = "critico" | "alto" | "medio" | "ok" | "sin_ventas";

const priorityRank: Record<RestockPriority, number> = {
  critico: 0,
  alto: 1,
  medio: 2,
  ok: 3,
  sin_ventas: 4,
};

export const buildRestockReport = cache(async function buildRestockReport() {
  const [inventory, sales] = await Promise.all([
    buildInventoryReport(),
    buildSalesReport({ includeProductSummary: false }),
  ]);
  const cutoff = Date.now() - RESTOCK_WINDOW_DAYS * DAY_MS;
  const soldBySku = new Map<string, number>();

  for (const order of sales.orders) {
    if (order.isCancelled || order.isReceivedPending) {
      continue;
    }

    const orderedAt = new Date(order.orderedAt).getTime();
    if (!Number.isFinite(orderedAt) || orderedAt < cutoff) {
      continue;
    }

    for (const item of order.items) {
      if (!item.masterSku) {
        continue;
      }

      soldBySku.set(
        item.masterSku,
        (soldBySku.get(item.masterSku) ?? 0) +
          (item.consumedQuantity ?? item.quantity),
      );
    }
  }

  const rows = inventory.rows
    .map((row) => {
      const sold90 = soldBySku.get(row.masterSku) ?? 0;
      const averageDailySales = sold90 / RESTOCK_WINDOW_DAYS;
      const daysLeft =
        averageDailySales > 0 ? row.physicalQuantity / averageDailySales : null;
      const targetStock = Math.ceil(averageDailySales * RESTOCK_WINDOW_DAYS);
      const suggestedQuantity = Math.max(0, targetStock - row.physicalQuantity);
      const priority = getPriority({
        sold90,
        stock: row.physicalQuantity,
        daysLeft,
      });

      return {
        masterSku: row.masterSku,
        name: row.name,
        physicalQuantity: row.physicalQuantity,
        inventoryValue: row.inventoryValue,
        averageUnitCost: row.averageUnitCost,
        sold90,
        averageDailySales,
        daysLeft,
        targetStock,
        suggestedQuantity,
        priority,
      };
    })
    .sort((a, b) => {
      const priorityDiff = priorityRank[a.priority] - priorityRank[b.priority];
      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      return b.suggestedQuantity - a.suggestedQuantity || b.sold90 - a.sold90;
    });

  return {
    organization: inventory.organization,
    windowDays: RESTOCK_WINDOW_DAYS,
    rows,
    totals: {
      critical: rows.filter((row) => row.priority === "critico").length,
      high: rows.filter((row) => row.priority === "alto").length,
      medium: rows.filter((row) => row.priority === "medio").length,
      suggestedUnits: rows.reduce(
        (sum, row) => sum + row.suggestedQuantity,
        0,
      ),
      suggestedValue: rows.reduce(
        (sum, row) => sum + row.suggestedQuantity * row.averageUnitCost,
        0,
      ),
    },
  };
});

function getPriority(input: {
  sold90: number;
  stock: number;
  daysLeft: number | null;
}): RestockPriority {
  if (input.sold90 <= 0) {
    return "sin_ventas";
  }

  if (input.stock <= 0 || (input.daysLeft !== null && input.daysLeft < 30)) {
    return "critico";
  }

  if (input.daysLeft !== null && input.daysLeft < 60) {
    return "alto";
  }

  if (input.daysLeft !== null && input.daysLeft < 90) {
    return "medio";
  }

  return "ok";
}
