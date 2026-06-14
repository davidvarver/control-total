import { describe, expect, it } from "vitest";
import { calculateSaleProfit, calculateWeightedAverageCost } from "./finance";
import {
  calculateConsumedComponents,
  calculateDemandSummary,
  calculatePublishableUnits,
  summarizeInventoryByProduct,
} from "./inventory";
import { resolveSubscriptionAccess } from "./subscription";
import type { InventoryBalance, OnlineSku, Warehouse } from "./types";

describe("inventory engine", () => {
  const warehouses: Warehouse[] = [
    {
      id: "own",
      name: "Mi Bodega",
      type: "own",
      isSellable: true,
      isExclusive: false,
    },
    {
      id: "returns",
      name: "Devoluciones",
      type: "returns",
      isSellable: false,
      isExclusive: false,
    },
  ];

  it("excludes non-sellable warehouses from available stock", () => {
    const balances: InventoryBalance[] = [
      {
        masterProductId: "chair",
        warehouseId: "own",
        physicalQuantity: 100,
        reservedQuantity: 10,
        blockedQuantity: 5,
      },
      {
        masterProductId: "chair",
        warehouseId: "returns",
        physicalQuantity: 20,
        reservedQuantity: 0,
        blockedQuantity: 0,
      },
    ];

    const [summary] = summarizeInventoryByProduct(balances, warehouses);

    expect(summary.physicalQuantity).toBe(100);
    expect(summary.availableQuantity).toBe(85);
  });

  it("calculates publishable stock for a multipack SKU", () => {
    const sku: OnlineSku = {
      id: "chair-10",
      sku: "CHAIR-10",
      title: "Chair 10 pack",
      channel: "mercado_libre",
      marketplaceAccountId: "ml-1",
      safetyBufferUnits: 5,
      components: [{ masterProductId: "chair", quantityRequired: 10 }],
    };

    expect(
      calculatePublishableUnits(sku, [
        {
          masterProductId: "chair",
          physicalQuantity: 100,
          reservedQuantity: 0,
          blockedQuantity: 0,
          availableQuantity: 95,
        },
      ]),
    ).toBe(9);
  });

  it("consumes all components in a kit", () => {
    const sku: OnlineSku = {
      id: "kit",
      sku: "KIT",
      title: "Kit",
      channel: "tiktok",
      marketplaceAccountId: "tt-1",
      safetyBufferUnits: 0,
      components: [
        { masterProductId: "cloth", quantityRequired: 2 },
        { masterProductId: "spray", quantityRequired: 1 },
      ],
    };

    expect(calculateConsumedComponents(sku, 3)).toEqual([
      { masterProductId: "cloth", quantityConsumed: 6 },
      { masterProductId: "spray", quantityConsumed: 3 },
    ]);
  });

  it("suggests purchase quantity using target inventory days", () => {
    const summary = calculateDemandSummary({
      masterProductId: "glove",
      soldUnitsInPeriod: 300,
      periodDays: 30,
      availableQuantity: 500,
      targetInventoryDays: 90,
    });

    expect(summary.averageDailyUnits).toBe(10);
    expect(summary.daysRemaining).toBe(50);
    expect(summary.suggestedPurchaseQuantity).toBe(400);
  });
});

describe("finance engine", () => {
  it("calculates weighted average cost", () => {
    expect(
      calculateWeightedAverageCost([
        { quantity: 100, unitCost: 80 },
        { quantity: 200, unitCost: 95 },
      ]),
    ).toBe(90);
  });

  it("calculates net profit with hidden charges and SKU components", () => {
    const profit = calculateSaleProfit({
      order: {
        id: "order",
        channel: "mercado_libre",
        marketplaceAccountId: "ml-1",
        orderedAt: "2026-05-20",
        items: [{ onlineSkuId: "chair-10", quantity: 2, unitPrice: 2500 }],
        charges: [
          { type: "marketplace_commission", amount: 750 },
          { type: "shipping", amount: 300 },
          { type: "advertising", amount: 120 },
        ],
      },
      onlineSkus: [
        {
          id: "chair-10",
          sku: "CHAIR-10",
          title: "Chair 10 pack",
          channel: "mercado_libre",
          marketplaceAccountId: "ml-1",
          safetyBufferUnits: 0,
          components: [{ masterProductId: "chair", quantityRequired: 10 }],
        },
      ],
      productCosts: [{ masterProductId: "chair", averageUnitCost: 100 }],
    });

    expect(profit.grossAmount).toBe(5000);
    expect(profit.productCost).toBe(2000);
    expect(profit.totalCharges).toBe(1170);
    expect(profit.netProfit).toBe(1830);
    expect(profit.marginPercent).toBeCloseTo(36.6);
  });
});

describe("subscription engine", () => {
  it("allows write access during grace period", () => {
    const access = resolveSubscriptionAccess(
      {
        status: "active",
        expiresAt: "2026-05-10T00:00:00-06:00",
        graceDays: 10,
        lockMode: "full_lock",
      },
      new Date("2026-05-18T00:00:00-06:00"),
    );

    expect(access.status).toBe("grace");
    expect(access.canWrite).toBe(true);
  });

  it("locks after grace period according to configured mode", () => {
    const access = resolveSubscriptionAccess(
      {
        status: "active",
        expiresAt: "2026-05-10T00:00:00-06:00",
        graceDays: 10,
        lockMode: "read_only",
      },
      new Date("2026-05-22T00:00:00-06:00"),
    );

    expect(access.status).toBe("suspended");
    expect(access.isLocked).toBe(true);
    expect(access.canWrite).toBe(false);
    expect(access.lockMode).toBe("read_only");
  });
});
