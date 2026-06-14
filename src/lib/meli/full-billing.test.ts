import { describe, expect, it } from "vitest";
import { normalizeFullBillingRows } from "./full-billing";

describe("normalizeFullBillingRows", () => {
  it("splits product aging buckets from a Full billing row", () => {
    const charges = normalizeFullBillingRows({
      accountId: "meli_1",
      period: "2026-05-01",
      syncedAt: "2026-05-29T00:00:00.000Z",
      rows: [
        {
          product: {
            title: "Cabezal Para Desbrozadora Universal",
            inventory_id: "INV123",
          },
          hasta_2_meses: { amount: 0, units: 202 },
          de_2_a_4_meses: { amount: 0, units: 30 },
          de_4_a_6_meses: { amount: 84, units: 6 },
          de_6_a_12_meses: { amount: 8140, units: 185 },
        },
      ],
    });

    expect(charges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ageBucket: "4_to_6_months",
          amount: 84,
          units: 6,
          productTitle: "Cabezal Para Desbrozadora Universal",
          inventoryId: "INV123",
        }),
        expect.objectContaining({
          ageBucket: "6_to_12_months",
          amount: 8140,
          units: 185,
        }),
      ]),
    );
  });

  it("keeps unknown Full charges as other without dropping raw data", () => {
    const charges = normalizeFullBillingRows({
      accountId: "meli_1",
      period: "2026-05-01",
      syncedAt: "2026-05-29T00:00:00.000Z",
      rows: [
        {
          product_title: "Maleta de herramientas",
          seller_sku: "MAL-1",
          concept_type: "FULFILLMENT_STORAGE",
          total_amount: "1785",
          quantity: 85,
        },
      ],
    });

    expect(charges).toHaveLength(1);
    expect(charges[0]).toMatchObject({
      ageBucket: "other",
      amount: 1785,
      units: 85,
      externalSku: "MAL-1",
      chargeType: "FULFILLMENT_STORAGE",
    });
  });
});
