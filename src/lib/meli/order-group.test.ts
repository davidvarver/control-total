import { describe, expect, it } from "vitest";
import {
  getMarketplaceRealSaleKey,
  getMarketplaceSaleDisplayId,
  groupMarketplaceOrdersIntoRealSales,
  isLikelyMeliSplitShipmentSibling,
  marketplaceRealSaleMatchesIdentifier,
} from "./order-group";

describe("getMarketplaceRealSaleKey", () => {
  it("groups split shipments by Mercado Libre payment id", () => {
    const firstShipment = {
      externalOrderId: "200001",
      shippingId: "shipment-a",
      raw: { payments: [{ id: "payment-1" }] },
    };
    const secondShipment = {
      externalOrderId: "200002",
      shippingId: "shipment-b",
      raw: { payments: [{ id: "payment-1" }] },
    };

    expect(getMarketplaceRealSaleKey(firstShipment)).toBe("payment:payment-1");
    expect(getMarketplaceRealSaleKey(secondShipment)).toBe("payment:payment-1");
  });

  it("uses pack id before payment id when Meli provides one", () => {
    expect(
      getMarketplaceRealSaleKey({
        packId: "pack-1",
        shippingId: "shipment-a",
        raw: { payments: [{ id: "payment-1" }] },
      }),
    ).toBe("pack:pack-1");
  });

  it("uses order request before pack id when Meli exposes the real sale group", () => {
    expect(
      getMarketplaceRealSaleKey({
        packId: "pack-1",
        shippingId: "shipment-a",
        raw: {
          order_request: { id: "request-1" },
          payments: [{ id: "payment-1" }],
        },
      }),
    ).toBe("order-request:request-1");
  });

  it("shows the Meli real sale number instead of an internal package order id", () => {
    expect(
      getMarketplaceSaleDisplayId({
        externalOrderId: "2000016727880982",
        packId: "2000013294365789",
        shippingId: "47201717353",
        raw: {
          order_request: { id: "2000013306602593" },
        },
      }),
    ).toBe("2000013306602593");
  });

  it("falls back to shipping id only when pack and payment are missing", () => {
    expect(
      getMarketplaceRealSaleKey({
        externalOrderId: "200001",
        shippingId: "shipment-a",
        raw: {},
      }),
    ).toBe("shipping:shipment-a");
  });

  it("groups existing Meli split-package siblings even when pack ids differ", () => {
    const firstPackage = {
      channel: "mercado_libre",
      marketplaceAccountId: "meli-1",
      externalOrderId: "2000016727880982",
      packId: "2000013294365789",
      shippingId: "47201717353",
      orderedAt: "2026-06-02T02:00:49.000Z",
      grossAmount: 287.12,
      currency: "MXN",
      charges: [
        { type: "marketplace_commission", amount: 40.2, source: "meli" },
        { type: "shipping", amount: 96, source: "meli_shipment_costs" },
      ],
      raw: {},
    };
    const secondPackage = {
      channel: "mercado_libre",
      marketplaceAccountId: "meli-1",
      externalOrderId: "2000016727886228",
      packId: "2000013294365791",
      shippingId: "47201991810",
      orderedAt: "2026-06-02T02:00:50.000Z",
      grossAmount: 287.12,
      currency: "MXN",
      charges: [{ type: "marketplace_commission", amount: 40.2, source: "meli" }],
      raw: {},
    };

    expect(isLikelyMeliSplitShipmentSibling(firstPackage, secondPackage)).toBe(true);
    expect(groupMarketplaceOrdersIntoRealSales([firstPackage, secondPackage])).toEqual([
      {
        key: "split:2000016727880982+2000016727886228",
        orders: [firstPackage, secondPackage],
      },
    ]);
    expect(
      getMarketplaceSaleDisplayId(
        groupMarketplaceOrdersIntoRealSales([firstPackage, secondPackage])[0]!.orders,
        "split:2000016727880982+2000016727886228",
      ),
    ).toBe("2000013294365789");
  });

  it("keeps the split-package shipping charge as one sale-level charge", () => {
    const firstPackage = {
      channel: "mercado_libre",
      marketplaceAccountId: "meli-1",
      externalOrderId: "2000016727880982",
      packId: "2000013294365789",
      shippingId: "47201717353",
      orderedAt: "2026-06-02T02:00:49.000Z",
      grossAmount: 287.12,
      currency: "MXN",
      items: [{ externalSku: "Cable electrico VERDE", quantity: 1, unitPrice: 287.12 }],
      charges: [
        { type: "marketplace_commission", amount: 40.2, source: "meli_billing" },
        { type: "shipping", amount: 96, source: "meli_shipment_costs" },
        { type: "tax_withholding", amount: 25.99, source: "meli_billing" },
      ],
      raw: {},
    };
    const secondPackage = {
      channel: "mercado_libre",
      marketplaceAccountId: "meli-1",
      externalOrderId: "2000016727880999",
      packId: "2000013294365791",
      shippingId: "47201991810",
      orderedAt: "2026-06-02T02:00:50.000Z",
      grossAmount: 287.12,
      currency: "MXN",
      items: [{ externalSku: "Cable electrico ROJO", quantity: 1, unitPrice: 287.12 }],
      charges: [
        { type: "marketplace_commission", amount: 40.2, source: "meli_billing" },
        { type: "tax_withholding", amount: 25.99, source: "meli_billing" },
      ],
      raw: {},
    };
    const [group] = groupMarketplaceOrdersIntoRealSales([
      firstPackage,
      secondPackage,
    ]);

    expect(group?.orders).toEqual([firstPackage, secondPackage]);
    expect(
      group?.orders
        .flatMap((order) => order.charges)
        .filter((charge) => charge.type === "shipping")
        .reduce((sum, charge) => sum + charge.amount, 0),
    ).toBe(96);
  });

  it("groups a large Full family purchase with many internal pack ids", () => {
    const parentSaleId = "2000013306602593";
    const orders = [
      ["2000013331061391", "2000016750000001", 1, "cancelled"],
      ["2000013331061395", "2000016750000002", 15, "paid"],
      ["2000013331061393", "2000016750000003", 1, "paid"],
      ["2000013323558441", "2000016750000004", 1, "paid"],
      ["2000013321579765", "2000016753835708", 2, "cancelled"],
      ["2000013321579761", "2000016753843038", 1, "paid"],
      ["2000013306602605", "2000016750000005", 8, "paid"],
      ["2000013306602607", "2000016750000006", 16, "paid"],
      ["2000013306602615", "2000016750000007", 14, "paid"],
      ["2000013306602599", "2000016750000008", 18, "paid"],
      ["2000013306602609", "2000016750000009", 13, "paid"],
      ["2000013306602613", "2000016750000010", 10, "paid"],
    ].map(([packId, externalOrderId, quantity, status], index) => ({
      channel: "mercado_libre",
      marketplaceAccountId: "meli-1",
      externalOrderId,
      packId,
      shippingId: `47213720${String(index).padStart(3, "0")}`,
      status,
      orderedAt: `2026-06-03T12:${String(20 + index).padStart(2, "0")}:00.000Z`,
      grossAmount: status === "cancelled" ? 0 : Number(quantity) * 140,
      currency: "MXN",
      items: [
        {
          externalSku: "Herramientas Azul 16 pzs",
          quantity,
          unitPrice: 140,
        },
      ],
      charges: [],
      raw: { order_request: { id: parentSaleId } },
    }));

    const groups = groupMarketplaceOrdersIntoRealSales(orders);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toBe(`order-request:${parentSaleId}`);
    expect(groups[0]?.orders).toHaveLength(12);
    expect(
      marketplaceRealSaleMatchesIdentifier(
        groups[0]!.orders,
        "2000013321579765",
        groups[0]!.key,
      ),
    ).toBe(true);
    expect(
      marketplaceRealSaleMatchesIdentifier(
        groups[0]!.orders,
        parentSaleId,
        groups[0]!.key,
      ),
    ).toBe(true);
  });

  it("groups split-package siblings with different quantities when SKU and unit price match", () => {
    const oneUnitPackage = {
      channel: "mercado_libre",
      marketplaceAccountId: "meli-1",
      externalOrderId: "2000016610796100",
      packId: "2000013171102377",
      shippingId: "47148637207",
      orderedAt: "2026-05-26T07:31:46.000Z",
      grossAmount: 287.12,
      currency: "MXN",
      items: [{ externalSku: "Cable eléctrico BLANCO", quantity: 1, unitPrice: 287.12 }],
      charges: [{ type: "shipping", amount: 240, source: "meli_billing" }],
      raw: {},
    };
    const twoUnitPackage = {
      channel: "mercado_libre",
      marketplaceAccountId: "meli-1",
      externalOrderId: "2000016610796110",
      packId: "2000013171102379",
      shippingId: "47148637145",
      orderedAt: "2026-05-26T07:31:12.000Z",
      grossAmount: 574.24,
      currency: "MXN",
      items: [{ externalSku: "Cable eléctrico BLANCO", quantity: 2, unitPrice: 287.12 }],
      charges: [{ type: "shipping", amount: 0, source: "meli_billing" }],
      raw: {},
    };

    expect(isLikelyMeliSplitShipmentSibling(oneUnitPackage, twoUnitPackage)).toBe(true);
    expect(groupMarketplaceOrdersIntoRealSales([oneUnitPackage, twoUnitPackage])).toEqual([
      {
        key: "split:2000016610796100+2000016610796110",
        orders: [twoUnitPackage, oneUnitPackage],
      },
    ]);
  });

  it("groups a split-package sale when one sibling was cancelled by Meli", () => {
    const activePackage = {
      channel: "mercado_libre",
      marketplaceAccountId: "meli-1",
      externalOrderId: "2000016753843038",
      packId: "2000013321579761",
      shippingId: "47213720432",
      status: "paid",
      orderedAt: "2026-06-03T12:32:03.000Z",
      grossAmount: 140,
      currency: "MXN",
      items: [{ externalSku: "Herramientas Azul 16 pzs", quantity: 1, unitPrice: 140 }],
      charges: [{ type: "shipping", amount: 147.63, source: "meli_billing" }],
      raw: {},
    };
    const cancelledPackage = {
      channel: "mercado_libre",
      marketplaceAccountId: "meli-1",
      externalOrderId: "2000016753835708",
      packId: "2000013321579765",
      shippingId: "47213445463",
      status: "cancelled",
      orderedAt: "2026-06-03T12:31:20.000Z",
      grossAmount: 0,
      currency: "MXN",
      items: [{ externalSku: "Herramientas Azul 16 pzs", quantity: 2, unitPrice: 140 }],
      charges: [],
      raw: {},
    };

    expect(isLikelyMeliSplitShipmentSibling(activePackage, cancelledPackage)).toBe(true);
    expect(groupMarketplaceOrdersIntoRealSales([activePackage, cancelledPackage])).toEqual([
      {
        key: "split:2000016753835708+2000016753843038",
        orders: [cancelledPackage, activePackage],
      },
    ]);
  });

  it("does not group a nearby large sale just because it uses the same SKU", () => {
    const smallPackage = {
      channel: "mercado_libre",
      marketplaceAccountId: "meli-1",
      externalOrderId: "2000016753843038",
      packId: "2000013321579761",
      shippingId: "47213720432",
      status: "paid",
      orderedAt: "2026-06-03T12:32:03.000Z",
      grossAmount: 140,
      currency: "MXN",
      items: [{ externalSku: "Herramientas Azul 16 pzs", quantity: 1, unitPrice: 140 }],
      charges: [{ type: "shipping", amount: 147.63, source: "meli_billing" }],
      raw: {},
    };
    const largeSeparateSale = {
      channel: "mercado_libre",
      marketplaceAccountId: "meli-1",
      externalOrderId: "2000016753843086",
      packId: "2000013321579763",
      shippingId: "47213445657",
      status: "paid",
      orderedAt: "2026-06-03T12:31:23.000Z",
      grossAmount: 2520,
      currency: "MXN",
      items: [{ externalSku: "Herramientas Azul 16 pzs", quantity: 18, unitPrice: 140 }],
      charges: [],
      raw: {},
    };

    expect(isLikelyMeliSplitShipmentSibling(smallPackage, largeSeparateSale)).toBe(false);
    expect(groupMarketplaceOrdersIntoRealSales([smallPackage, largeSeparateSale])).toHaveLength(2);
  });
});
