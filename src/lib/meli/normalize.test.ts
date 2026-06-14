import { describe, expect, it } from "vitest";
import { normalizeMeliOrder } from "./normalize";
import { getMarketplaceRealSaleKey } from "./order-group";
import type { LocalStore } from "@/lib/server/local-store";

const store: LocalStore = {
  version: 1,
  importedAt: "2026-05-20T00:00:00.000Z",
  organization: { id: "org", name: "Org" },
  warehouses: [],
  products: [],
  onlineSkus: [
    {
      id: "sku_silla_10",
      onlineSku: "SILLA.02-10PZ",
      title: "Silla set 10",
      channel: "mercado_libre",
      marketplaceAccount: "meli_1",
      safetyBufferUnits: 0,
      components: [{ masterSku: "SILLA.02", quantityRequired: 10 }],
    },
    {
      id: "sku_combo",
      onlineSku: "KIT-COMBO",
      title: "Combo",
      channel: "mercado_libre",
      marketplaceAccount: "meli_1",
      safetyBufferUnits: 0,
      components: [
        { masterSku: "CABLE-ROJO", quantityRequired: 2 },
        { masterSku: "CONECTOR", quantityRequired: 4 },
      ],
    },
  ],
  marketplaceAccounts: [],
  marketplaceOrders: [],
  integrationEvents: [],
  sales: [],
  inventoryBalances: [],
};

describe("Mercado Libre order normalization", () => {
  it("uses shipment family pack as the real sale group when Full splits many packages", () => {
    const order = normalizeMeliOrder({
      accountId: "meli_123",
      store,
      order: {
        id: 2000016753843038,
        pack_id: 2000013321579761,
        status: "paid",
        date_closed: "2026-06-03T12:32:03.000-06:00",
        total_amount: 140,
        currency_id: "MXN",
        order_items: [
          {
            item: {
              title: "Herramientas Azul 16 pzs",
              seller_sku: "SILLA.02-10PZ",
            },
            quantity: 1,
            unit_price: 140,
          },
        ],
        shipping: { id: 47213720432, logistic_type: "fulfillment" },
      },
      shipment: {
        id: 47213720432,
        logistic_type: "fulfillment",
        family_pack_id: 2000013306602593,
      },
    });

    expect(order.packId).toBe("2000013321579761");
    expect((order.raw as { order_request?: { id?: string } }).order_request?.id).toBe(
      "2000013306602593",
    );
    expect(getMarketplaceRealSaleKey(order)).toBe(
      "order-request:2000013306602593",
    );
  });

  it("maps seller SKU to master SKU and captures hidden charges", () => {
    const order = normalizeMeliOrder({
      accountId: "meli_123",
      store,
      order: {
        id: 200001,
        status: "paid",
        date_closed: "2026-05-20T12:00:00.000-06:00",
        total_amount: 5000,
        paid_amount: 5000,
        currency_id: "MXN",
        order_items: [
          {
            item: {
              id: "MLM123",
              title: "Silla set 10",
              seller_sku: "SILLA.02-10PZ",
            },
            quantity: 2,
            unit_price: 2500,
            sale_fee: 700,
          },
        ],
        payments: [{ marketplace_fee: 710, shipping_cost: 180 }],
      },
      billingDetails: {
        payment_info: [
          {
            tax_details: [
              { original_amount: 80, refunded_amount: 0 },
              { original_amount: 20, refunded_amount: 0 },
            ],
          },
        ],
        details: [
          {
            charge_info: {
              transaction_detail: "Cargo por venta",
              debited_from_operation: "YES",
              detail_amount: 700,
              detail_type: "CHARGE",
              detail_sub_type: "CV",
            },
          },
          {
            charge_info: {
              transaction_detail: "Cargo por envios de Mercado Libre",
              debited_from_operation: "YES",
              detail_amount: 180,
              detail_type: "CHARGE",
              detail_sub_type: "CFF",
            },
          },
        ],
      },
    });

    expect(order.externalOrderId).toBe("200001");
    expect(order.items[0].masterSku).toBe("SILLA.02");
    expect(order.items[0].consumedQuantity).toBe(20);
    expect(order.items[0].warehouseId).toBe("wh_main");
    expect(order.charges).toEqual([
      { type: "marketplace_commission", amount: 700, source: "meli_billing" },
      { type: "shipping", amount: 180, source: "meli_billing" },
      { type: "tax_withholding", amount: 100, source: "meli_billing" },
    ]);
    expect(order.netReceivedAmount).toBe(4020);
  });

  it("maps seller SKU even when Mercado Libre changes casing or extra spaces", () => {
    const order = normalizeMeliOrder({
      accountId: "meli_123",
      store,
      order: {
        id: 200003,
        status: "paid",
        total_amount: 2500,
        currency_id: "MXN",
        order_items: [
          {
            item: {
              title: "Silla set 10",
              seller_sku: "  silla.02-10pz  ",
            },
            quantity: 1,
            unit_price: 2500,
          },
        ],
      },
    });

    expect(order.items[0].masterSku).toBe("SILLA.02");
    expect(order.items[0].consumedQuantity).toBe(10);
  });

  it("keeps every component for kit SKUs instead of only the first one", () => {
    const order = normalizeMeliOrder({
      accountId: "meli_123",
      store,
      order: {
        id: 200004,
        status: "paid",
        total_amount: 900,
        currency_id: "MXN",
        order_items: [
          {
            item: {
              title: "Combo electrico",
              seller_sku: "KIT-COMBO",
            },
            quantity: 3,
            unit_price: 300,
          },
        ],
      },
    });

    expect(order.items[0].masterSku).toBe("CABLE-ROJO");
    expect(order.items[0].consumedQuantity).toBe(6);
    expect(order.items[0].components).toEqual([
      {
        masterSku: "CABLE-ROJO",
        quantityRequired: 2,
        consumedQuantity: 6,
      },
      {
        masterSku: "CONECTOR",
        quantityRequired: 4,
        consumedQuantity: 12,
      },
    ]);
  });

  it("leaves received pending when billing details are not available yet", () => {
    const order = normalizeMeliOrder({
      accountId: "meli_123",
      store,
      order: {
        id: 200005,
        status: "paid",
        total_amount: 150,
        paid_amount: 150,
        currency_id: "MXN",
        order_items: [
          {
            item: {
              title: "Maleta",
              seller_sku: "MALETA-AZUL",
            },
            quantity: 1,
            unit_price: 150,
            sale_fee: 22.5,
          },
        ],
        payments: [{ total_paid_amount: 150, marketplace_fee: 22.5 }],
      },
    });

    expect(order.grossAmount).toBe(150);
    expect(order.charges).toEqual([
      { type: "marketplace_commission", amount: 22.5, source: "meli" },
    ]);
    expect(order.netReceivedAmount).toBeNull();
  });

  it("closes old orders with fallback Meli charges when billing endpoint is unavailable", () => {
    const order = normalizeMeliOrder({
      accountId: "meli_123",
      store,
      shipmentCosts: {
        senders: [{ cost: 48 }],
      },
      billingError: "Billing aun no disponible en Mercado Libre",
      order: {
        id: 2000016638679632,
        status: "paid",
        date_closed: "2025-05-27T14:11:56.000-06:00",
        total_amount: 271.72,
        paid_amount: 271.72,
        currency_id: "MXN",
        order_items: [
          {
            item: {
              title: "Juego 22 piezas",
              seller_sku: "KIT DE 22 PIEZAS FRENOS",
            },
            quantity: 1,
            unit_price: 271.72,
            sale_fee: 36.68,
          },
        ],
        payments: [
          {
            total_paid_amount: 271.72,
            marketplace_fee: 36.68,
            taxes_amount: 49.2,
          },
        ],
      },
    });

    expect(order.charges).toEqual([
      { type: "marketplace_commission", amount: 36.68, source: "meli" },
      { type: "shipping", amount: 48, source: "meli_shipment_costs" },
      { type: "tax_withholding", amount: 49.2, source: "meli" },
    ]);
    expect(order.netReceivedAmount).toBe(137.84);
    expect(order.billingStatus).toBe("confirmed");
    expect(order.billingError).toBeNull();
  });

  it("fills missing shipping from shipment costs without using payment shipping", () => {
    const order = normalizeMeliOrder({
      accountId: "meli_123",
      store,
      order: {
        id: 200006,
        status: "paid",
        total_amount: 59.5,
        paid_amount: 59.5,
        currency_id: "MXN",
        order_items: [
          {
            item: {
              title: "Lonchera",
              seller_sku: "LONCHERA",
            },
            quantity: 1,
            unit_price: 59.5,
            sale_fee: 8.92,
          },
        ],
        payments: [
          {
            total_paid_amount: 59.5,
            marketplace_fee: 8.92,
            shipping_cost: 99.99,
            taxes_amount: 5.38,
          },
        ],
      },
      shipmentCosts: {
        senders: [{ cost: 28.5 }],
        receiver: { cost: 0 },
      },
      billingDetails: {
        details: [
          {
            charge_info: {
              transaction_detail: "Cargo por venta",
              debited_from_operation: "YES",
              detail_amount: 8.92,
              detail_type: "CHARGE",
              detail_sub_type: "CV",
            },
          },
        ],
      },
    });

    expect(order.charges).toEqual([
      { type: "marketplace_commission", amount: 8.92, source: "meli_billing" },
      { type: "shipping", amount: 28.5, source: "meli_fallback" },
      { type: "tax_withholding", amount: 5.38, source: "meli_fallback" },
    ]);
    expect(order.netReceivedAmount).toBe(16.7);
  });

  it("uses the smaller verified shipping source when billing and shipment disagree", () => {
    const order = normalizeMeliOrder({
      accountId: "meli_123",
      store,
      order: {
        id: 200008,
        status: "paid",
        total_amount: 298,
        paid_amount: 298,
        currency_id: "MXN",
        order_items: [
          {
            item: {
              title: "Kit frenos",
              seller_sku: "KIT-FRENOS",
            },
            quantity: 1,
            unit_price: 298,
            sale_fee: 40.23,
          },
        ],
        payments: [{ total_paid_amount: 298, marketplace_fee: 40.23 }],
      },
      shipmentCosts: {
        senders: [{ cost: 48 }],
      },
      billingDetails: {
        payment_info: [
          {
            tax_details: [{ original_amount: 26.97, refunded_amount: 0 }],
          },
        ],
        details: [
          {
            charge_info: {
              transaction_detail: "Cargo por venta",
              debited_from_operation: "YES",
              detail_amount: 40.23,
              detail_type: "CHARGE",
              detail_sub_type: "CV",
            },
          },
          {
            charge_info: {
              transaction_detail: "Cargo por envios de Mercado Libre",
              debited_from_operation: "YES",
              detail_amount: 137,
              detail_type: "CHARGE",
              detail_sub_type: "CFF",
            },
          },
        ],
      },
    });

    expect(order.charges).toEqual([
      { type: "marketplace_commission", amount: 40.23, source: "meli_billing" },
      { type: "shipping", amount: 48, source: "meli_shipment_costs" },
      { type: "tax_withholding", amount: 26.97, source: "meli_billing" },
    ]);
    expect(order.netReceivedAmount).toBe(182.8);
  });

  it("calculates received from confirmed charges instead of stale payment net", () => {
    const order = normalizeMeliOrder({
      accountId: "meli_123",
      store,
      order: {
        id: 2000016544806986,
        status: "paid",
        total_amount: 220,
        paid_amount: 220,
        currency_id: "MXN",
        order_items: [
          {
            item: {
              title: "Cabezal desbrozadora",
              seller_sku: "cabezal desbrozadora",
            },
            quantity: 2,
            unit_price: 110,
            sale_fee: 29.7,
          },
        ],
        payments: [{ id: 160400219082, total_paid_amount: 220 }],
      },
      shipmentCosts: {
        senders: [{ cost: 68 }],
      },
      paymentDetails: [
        {
          id: 160400219082,
          status: "approved",
          transaction_details: {
            net_received_amount: 16.39,
          },
        },
      ],
      billingDetails: {
        payment_info: [
          {
            tax_details: [{ original_amount: 19.91, refunded_amount: 0 }],
          },
        ],
        details: [
          {
            charge_info: {
              transaction_detail: "Cargo por venta",
              debited_from_operation: "YES",
              detail_amount: 29.7,
              detail_type: "CHARGE",
              detail_sub_type: "CV",
            },
          },
          {
            charge_info: {
              transaction_detail: "Cargo por envios de Mercado Libre",
              debited_from_operation: "YES",
              detail_amount: 154,
              detail_type: "CHARGE",
              detail_sub_type: "CFF",
            },
          },
        ],
      },
    });

    expect(order.charges).toEqual([
      { type: "marketplace_commission", amount: 29.7, source: "meli_billing" },
      { type: "shipping", amount: 68, source: "meli_shipment_costs" },
      { type: "tax_withholding", amount: 19.91, source: "meli_billing" },
    ]);
    expect(order.netReceivedAmount).toBe(102.39);
  });

  it("keeps billing shipping when shipment costs are higher than the real seller charge", () => {
    const order = normalizeMeliOrder({
      accountId: "meli_123",
      store,
      order: {
        id: 200009,
        status: "paid",
        total_amount: 90,
        paid_amount: 90,
        currency_id: "MXN",
        order_items: [
          {
            item: {
              title: "Cinta termica",
              seller_sku: "CINTA-TERMICA-MOTO",
            },
            quantity: 1,
            unit_price: 90,
            sale_fee: 10.8,
          },
        ],
        payments: [{ total_paid_amount: 90, marketplace_fee: 10.8 }],
      },
      shipmentCosts: {
        senders: [{ cost: 88.75 }],
      },
      billingDetails: {
        payment_info: [
          {
            tax_details: [{ original_amount: 8.15, refunded_amount: 0 }],
          },
        ],
        details: [
          {
            charge_info: {
              transaction_detail: "Cargo por venta",
              debited_from_operation: "YES",
              detail_amount: 10.8,
              detail_type: "CHARGE",
              detail_sub_type: "CV",
            },
          },
          {
            charge_info: {
              transaction_detail: "Cargo por envios de Mercado Libre",
              debited_from_operation: "YES",
              detail_amount: 25,
              detail_type: "CHARGE",
              detail_sub_type: "CFF",
            },
          },
        ],
      },
    });

    expect(order.charges).toEqual([
      { type: "marketplace_commission", amount: 10.8, source: "meli_billing" },
      { type: "shipping", amount: 25, source: "meli_billing" },
      { type: "tax_withholding", amount: 8.15, source: "meli_billing" },
    ]);
    expect(order.netReceivedAmount).toBe(46.05);
  });

  it("does not rewrite seller billing shipping from Mercado Pago net", () => {
    const order = normalizeMeliOrder({
      accountId: "meli_123",
      store,
      order: {
        id: 200011,
        status: "paid",
        total_amount: 59.5,
        paid_amount: 59.5,
        currency_id: "MXN",
        order_items: [
          {
            item: {
              title: "Lonchera",
              seller_sku: "LONCHERA ESCOLAR GRIS LISO",
            },
            quantity: 1,
            unit_price: 59.5,
            sale_fee: 8.92,
          },
        ],
        payments: [{ id: 160784507374, total_paid_amount: 59.5 }],
      },
      paymentDetails: [
        {
          id: 160784507374,
          status: "approved",
          transaction_details: {
            net_received_amount: 16.7,
          },
        },
      ],
      billingDetails: {
        payment_info: [
          {
            tax_details: [{ original_amount: 5.38, refunded_amount: 0 }],
          },
        ],
        details: [
          {
            charge_info: {
              transaction_detail: "Cargo por venta",
              debited_from_operation: "YES",
              detail_amount: 8.92,
              detail_type: "CHARGE",
              detail_sub_type: "CV",
            },
          },
          {
            charge_info: {
              transaction_detail: "Cargo por envios de Mercado Libre",
              debited_from_operation: "YES",
              detail_amount: 46.8,
              detail_type: "CHARGE",
              detail_sub_type: "CFF",
            },
          },
        ],
      },
    });

    expect(order.netReceivedAmount).toBe(0);
    expect(order.charges).toEqual([
      { type: "marketplace_commission", amount: 8.92, source: "meli_billing" },
      { type: "shipping", amount: 46.8, source: "meli_billing" },
      { type: "tax_withholding", amount: 5.38, source: "meli_billing" },
    ]);
  });

  it("does not mark receiver shipping credit as a rare fulfillment charge", () => {
    const order = normalizeMeliOrder({
      accountId: "meli_123",
      store,
      order: {
        id: 200012,
        status: "paid",
        total_amount: 279.36,
        paid_amount: 279.36,
        currency_id: "MXN",
        order_items: [
          {
            item: {
              title: "Mochila",
              seller_sku: "MOCHILA GRIS PARA CAMARA",
            },
            quantity: 1,
            unit_price: 279.36,
            sale_fee: 27.94,
          },
        ],
        payments: [{ id: 160478116131, total_paid_amount: 279.36 }],
      },
      shipmentCosts: {
        receiver: { cost: 37.49 },
        senders: [{ cost: 54 }],
      },
      paymentDetails: [
        {
          id: 160478116131,
          status: "approved",
          transaction_details: {
            net_received_amount: 134.64,
          },
          charges_details: [
            {
              name: "tax_withholding-iva",
              type: "tax",
              accounts: { from: "collector" },
              amounts: { original: 19.27, refunded: 0 },
            },
            {
              name: "tax_withholding-isr",
              type: "tax",
              accounts: { from: "collector" },
              amounts: { original: 6.02, refunded: 0 },
            },
            {
              name: "meli_fee",
              type: "fee",
              accounts: { from: "collector" },
              amounts: { original: 27.94, refunded: 0 },
            },
            {
              name: "shp_fulfillment",
              type: "shipping",
              accounts: { from: "collector" },
              amounts: { original: 91.49, refunded: 0 },
            },
          ],
        },
      ],
      billingDetails: {
        payment_info: [
          {
            tax_details: [{ original_amount: 25.29, refunded_amount: 0 }],
          },
        ],
        details: [
          {
            charge_info: {
              transaction_detail: "Cargo por venta",
              debited_from_operation: "YES",
              detail_amount: 27.94,
              detail_type: "CHARGE",
              detail_sub_type: "CV",
            },
          },
          {
            charge_info: {
              transaction_detail: "Cargo por envios de Mercado Libre",
              debited_from_operation: "YES",
              detail_amount: 54,
              detail_type: "CHARGE",
              detail_sub_type: "CFF",
            },
          },
        ],
      },
    });

    expect(order.netReceivedAmount).toBe(172.13);
    expect(order.charges).toEqual([
      { type: "marketplace_commission", amount: 27.94, source: "meli_billing" },
      { type: "shipping", amount: 54, source: "meli_billing" },
      { type: "tax_withholding", amount: 25.29, source: "meli_billing" },
    ]);
  });

  it("does not duplicate Mercado Pago fee details already present in Meli billing", () => {
    const order = normalizeMeliOrder({
      accountId: "meli_123",
      store,
      order: {
        id: 200013,
        status: "paid",
        total_amount: 411.43,
        paid_amount: 411.43,
        currency_id: "MXN",
        order_items: [
          {
            item: {
              title: "Funda guitarra gris",
              seller_sku: "FUNDA-GUITARRA-GRIS",
            },
            quantity: 1,
            unit_price: 411.43,
            sale_fee: 61.71,
          },
        ],
        payments: [{ id: 161428621060, total_paid_amount: 411.43 }],
      },
      paymentDetails: [
        {
          id: 161428621060,
          status: "approved",
          transaction_details: {
            net_received_amount: 139.17,
          },
          fee_details: [
            {
              type: "sale_fee",
              fee_payer: "collector",
              amount: 61.71,
            },
          ],
        },
      ],
      billingDetails: {
        payment_info: [
          {
            tax_details: [{ original_amount: 37.24, refunded_amount: 0 }],
          },
        ],
        details: [
          {
            charge_info: {
              transaction_detail: "Cargo por venta",
              debited_from_operation: "YES",
              detail_amount: 61.71,
              detail_type: "CHARGE",
              detail_sub_type: "CV",
            },
          },
          {
            charge_info: {
              transaction_detail: "Cargo por envios de Mercado Libre",
              debited_from_operation: "YES",
              detail_amount: 111.6,
              detail_type: "CHARGE",
              detail_sub_type: "CFF",
            },
          },
        ],
      },
    });

    expect(order.netReceivedAmount).toBe(200.88);
    expect(order.charges).toEqual([
      { type: "marketplace_commission", amount: 61.71, source: "meli_billing" },
      { type: "shipping", amount: 111.6, source: "meli_billing" },
      { type: "tax_withholding", amount: 37.24, source: "meli_billing" },
    ]);
  });

  it("ignores receiver shipping cost because it is buyer-side billing context", () => {
    const order = normalizeMeliOrder({
      accountId: "meli_123",
      store,
      order: {
        id: 200007,
        status: "paid",
        total_amount: 59.5,
        paid_amount: 59.5,
        currency_id: "MXN",
        order_items: [
          {
            item: {
              title: "Lonchera",
              seller_sku: "LONCHERA",
            },
            quantity: 1,
            unit_price: 59.5,
            sale_fee: 8.92,
          },
        ],
        payments: [{ total_paid_amount: 59.5, marketplace_fee: 8.92 }],
      },
      billingDetails: {
        payment_info: [
          {
            receiver_shipping_cost: 28.5,
            tax_details: [{ original_amount: 5.38, refunded_amount: 0 }],
          },
        ],
        details: [
          {
            charge_info: {
              transaction_detail: "Cargo por venta",
              debited_from_operation: "YES",
              detail_amount: 8.92,
              detail_type: "CHARGE",
              detail_sub_type: "CV",
            },
          },
        ],
      },
    });

    expect(order.charges).toEqual([
      { type: "marketplace_commission", amount: 8.92, source: "meli_billing" },
      { type: "tax_withholding", amount: 5.38, source: "meli_billing" },
    ]);
    expect(order.netReceivedAmount).toBe(45.2);
  });


  it("routes fulfillment sales to the Full warehouse", () => {
    const order = normalizeMeliOrder({
      accountId: "meli_123",
      store,
      shipment: {
        logistic: {
          type: "fulfillment",
        },
      },
      order: {
        id: 200002,
        status: "paid",
        total_amount: 2500,
        currency_id: "MXN",
        order_items: [
          {
            item: {
              title: "Silla set 10",
              seller_sku: "SILLA.02-10PZ",
            },
            quantity: 1,
            unit_price: 2500,
          },
        ],
      },
    });

    expect(order.items[0].warehouseId).toBe("wh_full");
    expect(order.items[0].logisticType).toBe("fulfillment");
  });

  it("leaves cancelled orders pending until billing verifies no charges", () => {
    const order = normalizeMeliOrder({
      accountId: "meli_123",
      store,
      order: {
        id: 200004,
        status: "cancelled",
        total_amount: 495,
        paid_amount: 495,
        currency_id: "MXN",
        order_items: [
          {
            item: {
              title: "Silla set 10",
              seller_sku: "SILLA.02-10PZ",
            },
            quantity: 1,
            unit_price: 495,
            sale_fee: 50,
          },
        ],
        payments: [{ total_paid_amount: 495, marketplace_fee: 50 }],
      },
    });

    expect(order.grossAmount).toBe(0);
    expect(order.netReceivedAmount).toBeNull();
    expect(order.billingStatus).toBe("pending");
    expect(order.charges).toEqual([]);
  });

  it("zeroes cancelled orders after billing confirms no charges", () => {
    const order = normalizeMeliOrder({
      accountId: "meli_123",
      store,
      billingDetails: { details: [], payment_info: [] },
      order: {
        id: 200005,
        status: "cancelled",
        total_amount: 495,
        paid_amount: 495,
        currency_id: "MXN",
        order_items: [
          {
            item: {
              title: "Silla set 10",
              seller_sku: "SILLA.02-10PZ",
            },
            quantity: 1,
            unit_price: 495,
            sale_fee: 50,
          },
        ],
        payments: [{ total_paid_amount: 495, marketplace_fee: 50 }],
      },
    });

    expect(order.grossAmount).toBe(0);
    expect(order.netReceivedAmount).toBe(0);
    expect(order.billingStatus).toBe("confirmed");
    expect(order.charges).toEqual([]);
  });

  it("treats cancelled shipments as cancelled orders even if the order status is still paid", () => {
    const order = normalizeMeliOrder({
      accountId: "meli_123",
      store,
      shipment: {
        status: "cancelled",
      },
      billingDetails: { details: [], payment_info: [] },
      order: {
        id: 200010,
        status: "paid",
        total_amount: 76.5,
        paid_amount: 76.5,
        currency_id: "MXN",
        order_items: [
          {
            item: {
              title: "Pasamontanas",
              seller_sku: "PASAMONTANAS-NARANJA",
            },
            quantity: 1,
            unit_price: 76.5,
            sale_fee: 9.18,
          },
        ],
        payments: [{ total_paid_amount: 76.5, marketplace_fee: 9.18 }],
      },
    });

    expect(order.status).toBe("cancelled");
    expect(order.grossAmount).toBe(0);
    expect(order.netReceivedAmount).toBe(0);
    expect(order.charges).toEqual([]);
  });

  it("treats zero-net paid orders as cancelled when billing proves the seller received nothing", () => {
    const order = normalizeMeliOrder({
      accountId: "meli_123",
      store,
      order: {
        id: 2000016545028074,
        status: "paid",
        total_amount: 76.5,
        paid_amount: 76.5,
        currency_id: "MXN",
        order_items: [
          {
            item: {
              title: "Pasamontanas Naranja",
              seller_sku: "PASAMONTANAS NARANJA",
            },
            quantity: 1,
            unit_price: 76.5,
            sale_fee: 9.18,
          },
        ],
        payments: [{ id: 160000000000, total_paid_amount: 76.5 }],
      },
      paymentDetails: [
        {
          id: 160000000000,
          status: "refunded",
          transaction_details: {
            net_received_amount: 0,
          },
        },
      ],
      billingDetails: {
        payment_info: [],
        details: [
          {
            charge_info: {
              transaction_detail: "Cargo por venta",
              debited_from_operation: "YES",
              detail_amount: 9.18,
              detail_type: "CHARGE",
              detail_sub_type: "CV",
            },
          },
          {
            charge_info: {
              transaction_detail: "Cargo por envios de Mercado Libre",
              debited_from_operation: "YES",
              detail_amount: 75,
              detail_type: "CHARGE",
              detail_sub_type: "CFF",
            },
          },
        ],
      },
    });

    expect(order.status).toBe("cancelled");
    expect(order.grossAmount).toBe(0);
    expect(order.netReceivedAmount).toBe(0);
    expect(order.charges).toEqual([]);
  });

  it("nets billing credit movements before deciding whether charges remain", () => {
    const order = normalizeMeliOrder({
      accountId: "meli_123",
      store,
      order: {
        id: 2000016545028075,
        status: "paid",
        total_amount: 76.5,
        paid_amount: 76.5,
        currency_id: "MXN",
        order_items: [
          {
            item: {
              title: "Pasamontanas Naranja",
              seller_sku: "PASAMONTANAS NARANJA",
            },
            quantity: 1,
            unit_price: 76.5,
            sale_fee: 9.18,
          },
        ],
      },
      paymentDetails: [
        {
          status: "approved",
          transaction_details: {
            net_received_amount: 0,
          },
        },
      ],
      billingDetails: {
        payment_info: [],
        details: [
          {
            charge_info: {
              transaction_detail: "Cargo por venta",
              debited_from_operation: "YES",
              detail_amount: 9.18,
              detail_type: "CHARGE",
              detail_sub_type: "CV",
            },
          },
          {
            charge_info: {
              transaction_detail: "Devolucion cargo por venta",
              debited_from_operation: "YES",
              detail_amount: 9.18,
              detail_type: "CREDIT",
              detail_sub_type: "CV",
            },
          },
        ],
      },
    });

    expect(order.status).toBe("cancelled");
    expect(order.grossAmount).toBe(0);
    expect(order.netReceivedAmount).toBe(0);
    expect(order.charges).toEqual([]);
  });
});
