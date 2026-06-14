import { describe, expect, it } from "vitest";
import type { LocalMarketplaceOrder } from "./local-store";
import { buildStockCommitments, isStockCommittedOrder } from "./stock-commitments";

describe("stock commitments", () => {
  it("treats paid Meli warehouse orders without shipping id as committed stock", () => {
    const order = makeOrder({
      shippingId: null,
      status: "paid",
      warehouseId: "wh_main",
      consumedQuantity: 2,
    });

    expect(isStockCommittedOrder(order)).toBe(true);
    expect(buildStockCommitments([order])).toEqual([
      {
        masterSku: "SKU-1",
        warehouseId: "wh_main",
        quantity: 2,
        orderIds: ["200001"],
      },
    ]);
  });

  it("does not mark cancelled, Full, manual, or shipped orders as committed", () => {
    const orders = [
      makeOrder({ status: "cancelled", shippingId: null }),
      makeOrder({ warehouseId: "wh_full", shippingId: null }),
      makeOrder({ channel: "manual", shippingId: null }),
      makeOrder({ shippingId: "12345" }),
    ];

    expect(buildStockCommitments(orders)).toEqual([]);
  });
});

function makeOrder(
  overrides: Partial<LocalMarketplaceOrder> & {
    warehouseId?: string;
    consumedQuantity?: number | null;
  } = {},
): LocalMarketplaceOrder {
  return {
    id: "meli_200001",
    channel: overrides.channel ?? "mercado_libre",
    marketplaceAccountId: "meli_1",
    externalOrderId: "200001",
    shippingId: overrides.shippingId,
    status: overrides.status ?? "paid",
    orderedAt: "2026-05-30T10:00:00.000Z",
    grossAmount: 100,
    netReceivedAmount: null,
    currency: "MXN",
    raw: {},
    items: [
      {
        externalSku: "ONLINE-1",
        title: "Producto",
        quantity: 1,
        unitPrice: 100,
        masterSku: "SKU-1",
        consumedQuantity: overrides.consumedQuantity ?? 1,
        warehouseId: overrides.warehouseId ?? "wh_main",
        logisticType: null,
      },
    ],
    charges: [],
  };
}
