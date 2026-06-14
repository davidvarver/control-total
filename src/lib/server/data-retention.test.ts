import { afterEach, describe, expect, it } from "vitest";
import {
  compactMarketplaceOrderPayloadForRetention,
  getDataRetentionPolicy,
} from "./data-retention";

const originalEnv = {
  MELI_RAW_PAYLOAD_RETENTION_MONTHS: process.env.MELI_RAW_PAYLOAD_RETENTION_MONTHS,
  SALES_DETAIL_RETENTION_MONTHS: process.env.SALES_DETAIL_RETENTION_MONTHS,
  REPORT_SUMMARY_RETENTION_YEARS: process.env.REPORT_SUMMARY_RETENTION_YEARS,
  DATA_RETENTION_BATCH_SIZE: process.env.DATA_RETENTION_BATCH_SIZE,
};

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("data retention policy", () => {
  it("defaults to compact raw payloads after 6 months and keep summaries for 10 years", () => {
    delete process.env.MELI_RAW_PAYLOAD_RETENTION_MONTHS;
    delete process.env.SALES_DETAIL_RETENTION_MONTHS;
    delete process.env.REPORT_SUMMARY_RETENTION_YEARS;

    expect(getDataRetentionPolicy()).toMatchObject({
      rawPayloadRetentionMonths: 6,
      detailedSalesRetentionMonths: 24,
      summaryRetentionYears: 10,
    });
  });

  it("compacts old raw Meli data without removing sale items or grouping ids", () => {
    const payload = {
      externalOrderId: "200001",
      items: [{ externalSku: "SKU-1", title: "Producto", quantity: 2 }],
      charges: [{ type: "shipping", amount: 96 }],
      raw: {
        id: "200001",
        pack_id: "pack-1",
        order_request: { id: "request-1" },
        status: "paid",
        order_items: [
          {
            item: {
              title: "Producto",
              seller_sku: "SKU-1",
              pictures: [{ url: "https://example.com/huge.jpg" }],
            },
            quantity: 2,
          },
        ],
        payments: [
          {
            id: "pay-1",
            total_paid_amount: 200,
            unnecessary: "large",
          },
        ],
        shipping: {
          id: "ship-1",
          logistic_type: "fulfillment",
          logistic: { type: "fulfillment" },
          history: ["large"],
        },
      },
    };

    const compacted = compactMarketplaceOrderPayloadForRetention(
      payload,
      new Date("2026-06-12T00:00:00.000Z"),
    ) as typeof payload & {
      raw: {
        retentionCompact: boolean;
        order_request: { id: string };
        order_items?: unknown;
        payments: Array<{ id: string }>;
        shipping: { id: string };
      };
    };

    expect(compacted.items).toEqual(payload.items);
    expect(compacted.charges).toEqual(payload.charges);
    expect(compacted.raw.retentionCompact).toBe(true);
    expect(compacted.raw.order_request.id).toBe("request-1");
    expect(compacted.raw.payments).toEqual([{ id: "pay-1" }]);
    expect(compacted.raw.shipping.id).toBe("ship-1");
    expect(compacted.raw.order_items).toBeUndefined();
  });
});
