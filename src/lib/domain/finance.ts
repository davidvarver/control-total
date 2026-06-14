import type { OnlineSku, ProductCost, SaleOrder, SaleProfitSummary } from "./types";

export function calculateWeightedAverageCost(
  purchases: { quantity: number; unitCost: number }[],
): number {
  const totalQuantity = purchases.reduce((sum, item) => sum + item.quantity, 0);

  if (totalQuantity <= 0) {
    return 0;
  }

  const totalCost = purchases.reduce(
    (sum, item) => sum + item.quantity * item.unitCost,
    0,
  );

  return totalCost / totalQuantity;
}

export function calculateSaleProfit(params: {
  order: SaleOrder;
  onlineSkus: OnlineSku[];
  productCosts: ProductCost[];
}): SaleProfitSummary {
  const onlineSkuById = new Map(params.onlineSkus.map((sku) => [sku.id, sku]));
  const costByProduct = new Map(
    params.productCosts.map((cost) => [cost.masterProductId, cost.averageUnitCost]),
  );

  const grossAmount = params.order.items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0,
  );

  const productCost = params.order.items.reduce((orderCost, item) => {
    const onlineSku = onlineSkuById.get(item.onlineSkuId);
    if (!onlineSku) {
      return orderCost;
    }

    const itemCost = onlineSku.components.reduce((componentCost, component) => {
      const averageCost = costByProduct.get(component.masterProductId) ?? 0;
      return componentCost + component.quantityRequired * item.quantity * averageCost;
    }, 0);

    return orderCost + itemCost;
  }, 0);

  const totalCharges = params.order.charges.reduce(
    (sum, charge) => sum + charge.amount,
    0,
  );
  const netProfit = grossAmount - productCost - totalCharges;

  return {
    grossAmount,
    productCost,
    totalCharges,
    netProfit,
    marginPercent: grossAmount > 0 ? (netProfit / grossAmount) * 100 : 0,
  };
}
