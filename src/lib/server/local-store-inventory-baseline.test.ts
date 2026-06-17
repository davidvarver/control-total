import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createEmptyStore } from "./empty-store";
import {
  addInventoryIngress,
  readLocalStore,
  replaceInventoryQuantities,
  runWithOrganization,
  saveMarketplaceOrders,
  writeOrganizationStore,
  type LocalMarketplaceOrder,
} from "./local-store";

const organization = {
  id: "test_inventory_baseline",
  name: "Inventory Baseline Test",
};
const storePath = path.join(
  process.cwd(),
  "data",
  "organizations",
  `${organization.id}.json`,
);

afterEach(async () => {
  await fs.rm(storePath, { force: true });
});

describe("marketplace inventory baseline", () => {
  it("adds multi-line manual ingress without creating new SKUs", async () => {
    await writeOrganizationStore(organization.id, {
      ...createEmptyStore(),
      organization,
      products: [
        {
          id: "prod_sku_a",
          masterSku: "SKU-A",
          name: "SKU A",
          currentStock: 2,
          totalIngresado: 2,
          totalVendido: 0,
          targetInventoryDays: 90,
          averageUnitCost: 10,
          isActive: true,
        },
        {
          id: "prod_sku_b",
          masterSku: "SKU-B",
          name: "SKU B",
          currentStock: 0,
          totalIngresado: 0,
          totalVendido: 0,
          targetInventoryDays: 90,
          averageUnitCost: 0,
          isActive: true,
        },
      ],
      inventoryBalances: [
        {
          masterSku: "SKU-A",
          warehouseId: "wh_main",
          physicalQuantity: 2,
          reservedQuantity: 0,
          blockedQuantity: 0,
        },
      ],
    });

    await runWithOrganization(organization, async () => {
      const result = await addInventoryIngress({
        warehouseId: "wh_main",
        reference: "Factura 123",
        updateCosts: true,
        lines: [
          { masterSku: "SKU-A", quantity: 3, averageUnitCost: 11.5 },
          { masterSku: "SKU-B", quantity: 4 },
        ],
      });

      const store = await readLocalStore();
      expect(result.appliedLines).toHaveLength(2);
      expect(getMainBalance(store, "SKU-A")).toBe(5);
      expect(getMainBalance(store, "SKU-B")).toBe(4);
      expect(
        store.products.find((product) => product.masterSku === "SKU-A")
          ?.averageUnitCost,
      ).toBe(11.5);
      expect(
        store.inventoryMovements.filter(
          (movement) => movement.reference === "manual_ingress",
        ),
      ).toHaveLength(2);
    });
  });

  it("rejects manual ingress for unknown master SKUs", async () => {
    await writeOrganizationStore(organization.id, {
      ...createEmptyStore(),
      organization,
    });

    await runWithOrganization(organization, async () => {
      await expect(
        addInventoryIngress({
          warehouseId: "wh_main",
          lines: [{ masterSku: "NO-EXISTE", quantity: 1 }],
        }),
      ).rejects.toThrow("SKU maestro no existe");

      const store = await readLocalStore();
      expect(store.products).toHaveLength(0);
      expect(store.inventoryMovements).toHaveLength(0);
    });
  });

  it("does not re-discount historical Meli orders after current stock is imported", async () => {
    await writeOrganizationStore(organization.id, {
      ...createEmptyStore(),
      organization,
    });

    await runWithOrganization(organization, async () => {
      const historicalOrder = makeMeliOrder({
        externalOrderId: "old-1",
        orderedAt: "2026-05-01T12:00:00.000Z",
        quantity: 1,
      });

      await saveMarketplaceOrders("meli_1", [historicalOrder]);

      await replaceInventoryQuantities({
        products: [
          {
            id: "prod_sku_a",
            masterSku: "SKU-A",
            name: "SKU A",
            currentStock: 10,
            totalIngresado: 10,
            totalVendido: 0,
            targetInventoryDays: 90,
            averageUnitCost: 0,
            isActive: true,
          },
        ],
        sales: [],
        inventoryBalances: [
          {
            masterSku: "SKU-A",
            warehouseId: "wh_main",
            physicalQuantity: 10,
            reservedQuantity: 0,
            blockedQuantity: 0,
          },
        ],
      });

      let store = await readLocalStore();
      expect(getMainBalance(store, "SKU-A")).toBe(10);
      expect(store.marketplaceOrders[0]?.inventoryApplied).toBe(false);

      await saveMarketplaceOrders("meli_1", [
        {
          ...historicalOrder,
          netReceivedAmount: 85,
          billingStatus: "confirmed",
        },
      ]);

      store = await readLocalStore();
      expect(getMainBalance(store, "SKU-A")).toBe(10);

      const futureOrder = makeMeliOrder({
        externalOrderId: "new-1",
        orderedAt: new Date(
          new Date(store.inventoryBaselineAt ?? 0).getTime() + 60_000,
        ).toISOString(),
        quantity: 2,
      });

      await saveMarketplaceOrders("meli_1", [futureOrder]);

      store = await readLocalStore();
      expect(getMainBalance(store, "SKU-A")).toBe(8);
      expect(
        store.marketplaceOrders.find((order) => order.externalOrderId === "new-1")
          ?.inventoryApplied,
      ).toBe(true);
    });
  });
});

function makeMeliOrder(input: {
  externalOrderId: string;
  orderedAt: string;
  quantity: number;
}): LocalMarketplaceOrder {
  return {
    id: `meli_${input.externalOrderId}`,
    channel: "mercado_libre",
    marketplaceAccountId: "meli_1",
    externalOrderId: input.externalOrderId,
    status: "paid",
    orderedAt: input.orderedAt,
    grossAmount: input.quantity * 100,
    netReceivedAmount: null,
    billingStatus: "pending",
    billingError: null,
    currency: "MXN",
    raw: {},
    items: [
      {
        externalSku: "online-a",
        title: "Online A",
        quantity: input.quantity,
        unitPrice: 100,
        masterSku: "SKU-A",
        consumedQuantity: input.quantity,
        warehouseId: "wh_main",
        logisticType: "drop_off",
      },
    ],
    charges: [],
  };
}

function getMainBalance(
  store: Awaited<ReturnType<typeof readLocalStore>>,
  masterSku: string,
) {
  return store.inventoryBalances.find(
    (balance) =>
      balance.masterSku === masterSku && balance.warehouseId === "wh_main",
  )?.physicalQuantity;
}
