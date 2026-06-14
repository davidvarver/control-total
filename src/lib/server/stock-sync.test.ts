import { describe, expect, it } from "vitest";
import { getMasterProductSellableStock, calculatePublishableStock } from "./stock-sync";
import type { LocalStore } from "./local-store";

describe("Stock Sync Engine Calculations", () => {
  const mockStore: LocalStore = {
    version: 1,
    importedAt: new Date().toISOString(),
    organization: { id: "org_123", name: "Test Corp" },
    warehouses: [
      { id: "wh_own_1", name: "Mi Bodega", type: "own", channel: null, isSellable: true, isExclusive: false },
      { id: "wh_own_2", name: "Bodega Dañada", type: "damaged", channel: null, isSellable: false, isExclusive: false },
      { id: "wh_full", name: "Full Meli", type: "mercado_libre_full", channel: "mercado_libre", isSellable: true, isExclusive: true },
    ],
    products: [
      { id: "prod_1", masterSku: "MASTER_A", name: "Product A", currentStock: 10, totalIngresado: 10, totalVendido: 0, targetInventoryDays: 30, averageUnitCost: 15 },
      { id: "prod_2", masterSku: "MASTER_B", name: "Product B", currentStock: 20, totalIngresado: 20, totalVendido: 0, targetInventoryDays: 30, averageUnitCost: 25 },
    ],
    inventoryBalances: [
      // MASTER_A Stock
      { masterSku: "MASTER_A", warehouseId: "wh_own_1", physicalQuantity: 15, reservedQuantity: 0, blockedQuantity: 0 },
      { masterSku: "MASTER_A", warehouseId: "wh_own_2", physicalQuantity: 5, reservedQuantity: 0, blockedQuantity: 0 }, // non-sellable
      { masterSku: "MASTER_A", warehouseId: "wh_full", physicalQuantity: 50, reservedQuantity: 0, blockedQuantity: 0 }, // Full warehouse, excluded from sellable

      // MASTER_B Stock
      { masterSku: "MASTER_B", warehouseId: "wh_own_1", physicalQuantity: 8, reservedQuantity: 0, blockedQuantity: 0 },
    ],
    onlineSkus: [
      {
        id: "sku_1",
        onlineSku: "ONLINE_A_SINGLE",
        title: "Product A Single Listing",
        channel: "mercado_libre",
        marketplaceAccount: "meli_alias",
        safetyBufferUnits: 2,
        components: [{ masterSku: "MASTER_A", quantityRequired: 1 }],
      },
      {
        id: "sku_2",
        onlineSku: "ONLINE_A_BUNDLE",
        title: "Product A Pack of 3",
        channel: "mercado_libre",
        marketplaceAccount: "meli_alias",
        safetyBufferUnits: 1,
        components: [{ masterSku: "MASTER_A", quantityRequired: 3 }],
      },
      {
        id: "sku_3",
        onlineSku: "ONLINE_COMBO",
        title: "Combo A + B",
        channel: "mercado_libre",
        marketplaceAccount: "meli_alias",
        safetyBufferUnits: 0,
        components: [
          { masterSku: "MASTER_A", quantityRequired: 1 },
          { masterSku: "MASTER_B", quantityRequired: 2 },
        ],
      },
    ],
    marketplaceAccounts: [],
    marketplaceOrders: [],
    integrationEvents: [],
    sales: [],
    inventoryMovements: [],
    fullInventoryLayers: [],
    fullBillingCharges: [],
    costSkuMappings: [],
    ignoredCostSkus: [],
    dismissedRareChargeAlerts: [],
    archivedUnmappedSkus: [],
    dismissedFullAuditAlerts: [],
    pendingCostImports: [],
    operatingExpenses: [],
  };

  it("should calculate getMasterProductSellableStock correctly by including only own sellable warehouses", () => {
    // MASTER_A has 15 in sellable own, 5 in damaged (non-sellable), 50 in Full (ignored for self-managed)
    const stockA = getMasterProductSellableStock(mockStore, "MASTER_A");
    expect(stockA).toBe(15);

    // MASTER_B has 8 in sellable own
    const stockB = getMasterProductSellableStock(mockStore, "MASTER_B");
    expect(stockB).toBe(8);
  });

  it("should calculate calculatePublishableStock for simple items with safety buffers", () => {
    // MASTER_A sellable stock is 15. Single listing needs 1. Buffer is 2.
    // publishable = max(0, min(15/1) - 2) = 13.
    const onlineSkuA = mockStore.onlineSkus[0];
    const publishableA = calculatePublishableStock(mockStore, onlineSkuA);
    expect(publishableA).toBe(13);
  });

  it("should calculate calculatePublishableStock for bundles with division and safety buffers", () => {
    // MASTER_A sellable stock is 15. Bundle needs 3. Buffer is 1.
    // possible bundles = floor(15 / 3) = 5.
    // publishable = max(0, 5 - 1) = 4.
    const onlineSkuBundle = mockStore.onlineSkus[1];
    const publishableBundle = calculatePublishableStock(mockStore, onlineSkuBundle);
    expect(publishableBundle).toBe(4);
  });

  it("should calculate calculatePublishableStock for combo items containing multiple master products", () => {
    // Combo needs 1 of MASTER_A and 2 of MASTER_B.
    // MASTER_A has 15 (possible combos: 15/1 = 15)
    // MASTER_B has 8 (possible combos: 8/2 = 4)
    // min combos = min(15, 4) = 4. Buffer is 0.
    // publishable = 4.
    const onlineSkuCombo = mockStore.onlineSkus[2];
    const publishableCombo = calculatePublishableStock(mockStore, onlineSkuCombo);
    expect(publishableCombo).toBe(4);
  });
});
