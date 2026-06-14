import type { LocalMarketplaceOrder } from "./local-store";
import { isCancelledOrder } from "./order-status";

export type StockCommitment = {
  masterSku: string;
  warehouseId: string;
  quantity: number;
  orderIds: string[];
};

export function buildStockCommitments(orders: LocalMarketplaceOrder[]) {
  const commitments = new Map<string, StockCommitment>();

  for (const order of orders) {
    if (!isStockCommittedOrder(order)) {
      continue;
    }

    for (const item of order.items) {
      if (!item.masterSku || item.consumedQuantity === null) {
        continue;
      }

      const key = `${item.masterSku}::${item.warehouseId}`;
      const current =
        commitments.get(key) ??
        {
          masterSku: item.masterSku,
          warehouseId: item.warehouseId,
          quantity: 0,
          orderIds: [],
        };

      current.quantity += item.consumedQuantity;
      if (!current.orderIds.includes(order.externalOrderId)) {
        current.orderIds.push(order.externalOrderId);
      }
      commitments.set(key, current);
    }
  }

  return [...commitments.values()];
}

export function isStockCommittedOrder(order: LocalMarketplaceOrder) {
  if (isCancelledOrder(order.status)) {
    return false;
  }

  if (order.channel !== "mercado_libre") {
    return false;
  }

  if (order.items.some((item) => item.warehouseId === "wh_full")) {
    return false;
  }

  return !order.shippingId;
}
