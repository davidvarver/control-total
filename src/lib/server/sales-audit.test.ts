import { describe, expect, it } from "vitest";
import type { LocalMarketplaceOrder, LocalStore } from "./local-store";
import { buildSalesAuditReportFromStore } from "./sales-audit";

function makeStore(orders: LocalMarketplaceOrder[]): LocalStore {
  return {
    version: 1,
    importedAt: "2026-05-25T00:00:00.000Z",
    organization: { id: "org", name: "Org" },
    warehouses: [],
    products: [],
    onlineSkus: [],
    marketplaceAccounts: [
      {
        id: "meli-1",
        channel: "mercado_libre",
        alias: "CUENTA_TEST",
        externalAccountId: "123",
        accessToken: "token",
        refreshToken: "refresh",
        tokenExpiresAt: "2026-05-25T00:00:00.000Z",
        status: "connected",
      },
    ],
    marketplaceOrders: orders,
    integrationEvents: [],
    sales: [],
    inventoryBalances: [],
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
}

function makeOrder(
  overrides: Partial<LocalMarketplaceOrder> = {},
): LocalMarketplaceOrder {
  return {
    id: overrides.externalOrderId ?? "order-1",
    channel: "mercado_libre",
    marketplaceAccountId: "meli-1",
    externalOrderId: "200001",
    packId: null,
    shippingId: null,
    status: "paid",
    orderedAt: "2026-05-21T17:00:00.000Z",
    grossAmount: 100,
    netReceivedAmount: 70,
    billingStatus: "confirmed",
    currency: "MXN",
    raw: {},
    items: [
      {
        externalSku: "SKU-1",
        title: "Producto",
        quantity: 1,
        unitPrice: 100,
        masterSku: "SKU-1",
        consumedQuantity: 1,
        warehouseId: "full",
        logisticType: "fulfillment",
      },
    ],
    charges: [{ type: "commission", amount: 30, source: "meli_billing" }],
    ...overrides,
  };
}

describe("sales audit", () => {
  it("does not flag a clean confirmed sale", () => {
    const report = buildSalesAuditReportFromStore(
      makeStore([makeOrder()]),
      new Date("2026-05-25T00:00:00.000Z").getTime(),
    );

    expect(report.criticalCount).toBe(0);
    expect(report.warningCount).toBe(0);
    expect(report.cleanRealSales).toBe(1);
  });

  it("flags a confirmed sale when received does not match gross minus charges", () => {
    const report = buildSalesAuditReportFromStore(
      makeStore([
        makeOrder({
          externalOrderId: "200002",
          grossAmount: 220,
          netReceivedAmount: 16.39,
          charges: [
            { type: "marketplace_commission", amount: 29.7, source: "meli_billing" },
            { type: "shipping", amount: 68, source: "meli_shipment_costs" },
            { type: "tax_withholding", amount: 19.91, source: "meli_billing" },
          ],
          items: [
            {
              externalSku: "SKU-1",
              title: "Producto",
              quantity: 2,
              unitPrice: 110,
              masterSku: "SKU-1",
              consumedQuantity: 2,
              warehouseId: "full",
              logisticType: "fulfillment",
            },
          ],
        }),
      ]),
      new Date("2026-05-25T00:00:00.000Z").getTime(),
    );

    expect(report.issues.map((issue) => issue.rule)).toContain("net_mismatch");
    expect(report.issues.find((issue) => issue.rule === "net_mismatch")?.expectedReceived).toBe(102.39);
  });

  it("flags a paid zero-net sale with charges over gross as a possible cancellation", () => {
    const report = buildSalesAuditReportFromStore(
      makeStore([
        makeOrder({
          externalOrderId: "200003",
          grossAmount: 76.5,
          netReceivedAmount: 0,
          charges: [
            { type: "marketplace_commission", amount: 9.18, source: "meli_billing" },
            { type: "shipping", amount: 75, source: "meli_billing" },
          ],
        }),
      ]),
      new Date("2026-05-25T00:00:00.000Z").getTime(),
    );

    expect(report.issues.map((issue) => issue.rule)).toContain(
      "possible_cancelled_not_marked",
    );
  });

  it("flags cancelled orders that still have money or charges", () => {
    const report = buildSalesAuditReportFromStore(
      makeStore([
        makeOrder({
          externalOrderId: "200004",
          status: "cancelled",
          grossAmount: 76.5,
          netReceivedAmount: 0,
          charges: [{ type: "shipping", amount: 75, source: "meli_billing" }],
        }),
      ]),
      new Date("2026-05-25T00:00:00.000Z").getTime(),
    );

    expect(report.issues.map((issue) => issue.rule)).toContain("cancelled_money");
  });

  it("aggregates repeated shipping only once for a grouped pack", () => {
    const report = buildSalesAuditReportFromStore(
      makeStore([
        makeOrder({
          externalOrderId: "200005",
          packId: "pack-1",
          grossAmount: 76.5,
          netReceivedAmount: 10.39,
          charges: [
            { type: "marketplace_commission", amount: 9.18, source: "meli_billing" },
            { type: "shipping", amount: 50, source: "meli_shipping" },
            { type: "tax_withholding", amount: 6.93, source: "meli_billing" },
          ],
        }),
        makeOrder({
          externalOrderId: "200006",
          packId: "pack-1",
          grossAmount: 76.5,
          netReceivedAmount: 0,
          charges: [
            { type: "marketplace_commission", amount: 9.18, source: "meli_billing" },
            { type: "shipping", amount: 50, source: "meli_shipping" },
            { type: "tax_withholding", amount: 6.93, source: "meli_billing" },
          ],
        }),
      ]),
      new Date("2026-05-25T00:00:00.000Z").getTime(),
    );

    const mismatch = report.issues.find((issue) => issue.rule === "net_mismatch");
    expect(mismatch?.chargesTotal).toBe(82.22);
    expect(mismatch?.expectedReceived).toBe(70.78);
  });

  it("groups split shipments from the same payment as one real sale", () => {
    const report = buildSalesAuditReportFromStore(
      makeStore([
        makeOrder({
          externalOrderId: "200007",
          shippingId: "shipment-a",
          grossAmount: 287.12,
          netReceivedAmount: 21.13,
          raw: { payments: [{ id: "payment-cable-1" }] },
          charges: [
            { type: "marketplace_commission", amount: 40.2, source: "meli_billing" },
            { type: "shipping", amount: 199.8, source: "meli_billing:net_reconciled" },
            { type: "tax_withholding", amount: 25.99, source: "meli_billing" },
          ],
          items: [
            {
              externalSku: "CABLE BLANCO",
              title: "Cable blanco",
              quantity: 1,
              unitPrice: 287.12,
              masterSku: "CABLE BLANCO",
              consumedQuantity: 1,
              warehouseId: "full",
              logisticType: "fulfillment",
            },
          ],
        }),
        makeOrder({
          externalOrderId: "200008",
          shippingId: "shipment-b",
          grossAmount: 574.24,
          netReceivedAmount: 441.86,
          raw: { payments: [{ id: "payment-cable-1" }] },
          charges: [
            { type: "shipping", amount: 240, source: "meli_shipment_costs" },
          ],
          items: [
            {
              externalSku: "CABLE BLANCO",
              title: "Cable blanco",
              quantity: 2,
              unitPrice: 287.12,
              masterSku: "CABLE BLANCO",
              consumedQuantity: 2,
              warehouseId: "full",
              logisticType: "fulfillment",
            },
          ],
        }),
      ]),
      new Date("2026-05-25T00:00:00.000Z").getTime(),
    );

    expect(report.totalRealSales).toBe(1);
    expect(report.issues.find((issue) => issue.rule === "item_gross_mismatch")).toBeUndefined();
  });

  it("does not flag Meli split packages with different pack ids as separate loss sales", () => {
    const report = buildSalesAuditReportFromStore(
      makeStore([
        makeOrder({
          externalOrderId: "2000016727880982",
          packId: "2000013294365789",
          shippingId: "47201717353",
          orderedAt: "2026-06-02T02:00:49.000Z",
          grossAmount: 287.12,
          netReceivedAmount: 124.93,
          charges: [
            { type: "marketplace_commission", amount: 40.2, source: "meli" },
            { type: "shipping", amount: 96, source: "meli_shipment_costs" },
            { type: "tax_withholding", amount: 25.99, source: "mercado_pago:tax_withholding-isr" },
          ],
          items: [
            {
              externalSku: "Cable electrico VERDE",
              title: "Cable verde",
              quantity: 1,
              unitPrice: 287.12,
              masterSku: "Cable electrico VERDE",
              consumedQuantity: 1,
              warehouseId: "full",
              logisticType: "fulfillment",
            },
          ],
        }),
        makeOrder({
          externalOrderId: "2000016727886228",
          packId: "2000013294365791",
          shippingId: "47201991810",
          orderedAt: "2026-06-02T02:00:50.000Z",
          grossAmount: 287.12,
          netReceivedAmount: 220.93,
          charges: [
            { type: "marketplace_commission", amount: 40.2, source: "meli" },
            { type: "tax_withholding", amount: 25.99, source: "mercado_pago:tax_withholding-isr" },
          ],
          items: [
            {
              externalSku: "Cable electrico ROJO",
              title: "Cable rojo",
              quantity: 1,
              unitPrice: 287.12,
              masterSku: "Cable electrico ROJO",
              consumedQuantity: 1,
              warehouseId: "full",
              logisticType: "fulfillment",
            },
          ],
        }),
      ]),
      new Date("2026-06-02T12:00:00.000Z").getTime(),
    );

    expect(report.totalRealSales).toBe(1);
    expect(report.issues.find((issue) => issue.rule === "net_mismatch")).toBeUndefined();
    expect(report.issues.find((issue) => issue.rule === "item_gross_mismatch")).toBeUndefined();
  });

  it("does not double count fallback commission when split package billing has confirmed commission", () => {
    const report = buildSalesAuditReportFromStore(
      makeStore([
        makeOrder({
          externalOrderId: "2000016610796100",
          packId: "2000013171102377",
          shippingId: "47148637207",
          orderedAt: "2026-05-26T07:31:46.000Z",
          grossAmount: 287.12,
          netReceivedAmount: 181.13,
          charges: [
            { type: "marketplace_commission", amount: 40.2, source: "meli_fallback" },
            { type: "shipping", amount: 80, source: "meli_billing:pack_allocated" },
            { type: "tax_withholding", amount: 25.99, source: "meli_billing" },
          ],
          items: [
            {
              externalSku: "Cable electrico BLANCO",
              title: "Cable blanco",
              quantity: 1,
              unitPrice: 287.12,
              masterSku: "Cable electrico BLANCO",
              consumedQuantity: 1,
              warehouseId: "full",
              logisticType: "fulfillment",
            },
          ],
        }),
        makeOrder({
          externalOrderId: "2000016610796110",
          packId: "2000013171102379",
          shippingId: "47148637145",
          orderedAt: "2026-05-26T07:31:12.000Z",
          grossAmount: 574.24,
          netReceivedAmount: 281.86,
          charges: [
            { type: "marketplace_commission", amount: 80.4, source: "meli_billing" },
            { type: "shipping", amount: 160, source: "meli:pack_allocated" },
            { type: "tax_withholding", amount: 51.98, source: "meli_billing" },
          ],
          items: [
            {
              externalSku: "Cable electrico BLANCO",
              title: "Cable blanco",
              quantity: 2,
              unitPrice: 287.12,
              masterSku: "Cable electrico BLANCO",
              consumedQuantity: 2,
              warehouseId: "full",
              logisticType: "fulfillment",
            },
          ],
        }),
      ]),
      new Date("2026-05-26T12:00:00.000Z").getTime(),
    );

    const issue = report.issues.find((entry) => entry.rule === "net_mismatch");

    expect(issue).toBeUndefined();
  });
});
