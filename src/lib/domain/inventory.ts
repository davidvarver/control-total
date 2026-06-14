import type {
  InventoryBalance,
  OnlineSku,
  ProductDemandSummary,
  ProductInventorySummary,
  SaleOrder,
  Warehouse,
} from "./types";

export function summarizeInventoryByProduct(
  balances: InventoryBalance[],
  warehouses: Warehouse[],
): ProductInventorySummary[] {
  const warehouseById = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse]));
  const summaries = new Map<string, ProductInventorySummary>();

  for (const balance of balances) {
    const warehouse = warehouseById.get(balance.warehouseId);
    if (!warehouse || !warehouse.isSellable) {
      continue;
    }

    const current =
      summaries.get(balance.masterProductId) ??
      {
        masterProductId: balance.masterProductId,
        physicalQuantity: 0,
        reservedQuantity: 0,
        blockedQuantity: 0,
        availableQuantity: 0,
      };

    current.physicalQuantity += balance.physicalQuantity;
    current.reservedQuantity += balance.reservedQuantity;
    current.blockedQuantity += balance.blockedQuantity;
    current.availableQuantity += Math.max(
      0,
      balance.physicalQuantity - balance.reservedQuantity - balance.blockedQuantity,
    );

    summaries.set(balance.masterProductId, current);
  }

  return [...summaries.values()];
}

export function calculatePublishableUnits(
  onlineSku: OnlineSku,
  inventory: ProductInventorySummary[],
): number {
  const inventoryByProduct = new Map(
    inventory.map((summary) => [summary.masterProductId, summary.availableQuantity]),
  );

  if (onlineSku.components.length === 0) {
    return 0;
  }

  const componentLimits = onlineSku.components.map((component) => {
    const available = inventoryByProduct.get(component.masterProductId) ?? 0;
    return Math.floor(
      Math.max(0, available - onlineSku.safetyBufferUnits) / component.quantityRequired,
    );
  });

  return Math.max(0, Math.min(...componentLimits));
}

export function calculateConsumedComponents(
  onlineSku: OnlineSku,
  soldQuantity: number,
) {
  return onlineSku.components.map((component) => ({
    masterProductId: component.masterProductId,
    quantityConsumed: component.quantityRequired * soldQuantity,
  }));
}

export function calculateDemandSummary(params: {
  masterProductId: string;
  soldUnitsInPeriod: number;
  periodDays: number;
  availableQuantity: number;
  targetInventoryDays: number;
}): ProductDemandSummary {
  const averageDailyUnits =
    params.periodDays > 0 ? params.soldUnitsInPeriod / params.periodDays : 0;
  const daysRemaining =
    averageDailyUnits > 0 ? params.availableQuantity / averageDailyUnits : null;
  const targetUnits = averageDailyUnits * params.targetInventoryDays;

  return {
    masterProductId: params.masterProductId,
    soldUnits: params.soldUnitsInPeriod,
    averageDailyUnits,
    daysRemaining,
    suggestedPurchaseQuantity: Math.max(
      0,
      Math.ceil(targetUnits - params.availableQuantity),
    ),
  };
}

export function totalSoldMasterUnits(params: {
  masterProductId: string;
  orders: SaleOrder[];
  onlineSkus: OnlineSku[];
}): number {
  const skuById = new Map(params.onlineSkus.map((sku) => [sku.id, sku]));

  return params.orders.reduce((total, order) => {
    const orderUnits = order.items.reduce((itemTotal, item) => {
      const onlineSku = skuById.get(item.onlineSkuId);
      if (!onlineSku) {
        return itemTotal;
      }

      const component = onlineSku.components.find(
        (entry) => entry.masterProductId === params.masterProductId,
      );

      return itemTotal + (component?.quantityRequired ?? 0) * item.quantity;
    }, 0);

    return total + orderUnits;
  }, 0);
}
