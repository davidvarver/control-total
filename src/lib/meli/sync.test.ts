import { describe, expect, it } from "vitest";
import {
  extractOrderRequestIds,
  extractPackFamilyPackIds,
  extractPackOrderIds,
  referencesMeliIdentifier,
} from "./pack";
import { createMeliInitialSalesBackfillState } from "./backfill-window";

describe("Mercado Libre pack order extraction", () => {
  it("reads sibling order ids from known pack shapes", () => {
    const ids = extractPackOrderIds({
      orders: [
        { id: 100 },
        { order_id: "101" },
        { orderId: 102 },
        { resource: "/orders/103" },
      ],
      pack_orders: ["104"],
      order_ids: [105],
      orderIds: ["106"],
      shipments: [{ orders: [{ order: { id: "107" } }] }],
      packages: [{ orders: [{ id: "108" }, "109"] }],
    });

    expect(ids).toEqual([
      "100",
      "101",
      "102",
      "103",
      "104",
      "105",
      "106",
      "107",
      "108",
      "109",
    ]);
  });

  it("deduplicates repeated order ids", () => {
    const ids = extractPackOrderIds({
      orders: [{ id: "200" }, { order_id: "200" }],
      order_ids: ["200"],
    });

    expect(ids).toEqual(["200"]);
  });

  it("reads marketplace pack and nested result shapes", () => {
    const ids = extractPackOrderIds({
      results: [{ order_id: "300" }, { resource: "/orders/301" }],
      pack: { orders: [{ id: "302" }] },
      response: { order_ids: ["303"] },
      related_orders: [{ order: { id: "304" } }],
    });

    expect(ids.sort()).toEqual(["300", "301", "302", "303", "304"]);
  });

  it("reads deep marketplace payloads with data, content and package items", () => {
    const ids = extractPackOrderIds({
      data: { orders: [{ order: { id: "401" } }] },
      content: [{ order_id: "402" }],
      packages: [{ items: [{ resource: "/orders/403" }] }],
    });

    expect(ids.sort()).toEqual(["401", "402", "403"]);
  });

  it("reads object maps returned by marketplace endpoints", () => {
    const ids = extractPackOrderIds({
      response: {
        data: {
          first: { order_id: "501" },
          second: { id: "502" },
        },
      },
    });

    expect(ids.sort()).toEqual(["501", "502"]);
  });

  it("does not treat the pack id itself as an order id", () => {
    const ids = extractPackOrderIds({
      id: "PACK-1",
      pack: { id: "PACK-2", orders: [{ id: "601" }] },
    });

    expect(ids).toEqual(["601"]);
  });

  it("reads family pack ids without treating them as order ids", () => {
    const payload = {
      id: "2000013321579765",
      family_pack_id: "2000013306602593",
      shipments: [
        {
          familyPackId: 2000013306602593,
          orders: [{ id: "2000016753835708" }],
        },
      ],
    };

    expect(extractPackFamilyPackIds(payload)).toEqual(["2000013306602593"]);
    expect(extractPackOrderIds(payload)).toEqual(["2000016753835708"]);
  });

  it("reads order request ids used by Seller Center grouped sales", () => {
    const payload = {
      id: "2000016753835708",
      order_request: { id: "2000013306602593" },
      related: [{ orderRequestId: 2000013306602594 }],
    };

    expect(extractOrderRequestIds(payload)).toEqual([
      "2000013306602593",
      "2000013306602594",
    ]);
  });

  it("matches Meli identifiers only when the payload references them exactly", () => {
    const payload = {
      id: "2000016753835708",
      pack_id: "2000013321579765",
      family_pack_id: "2000013306602593",
    };

    expect(referencesMeliIdentifier(payload, "2000013306602593")).toBe(true);
    expect(referencesMeliIdentifier(payload, "200001330660259")).toBe(false);
  });
});

describe("Mercado Libre initial sales backfill", () => {
  it("uses the current calendar month plus the previous month for two-month backfills", () => {
    const state = createMeliInitialSalesBackfillState(
      new Date("2026-06-11T18:45:00.000Z"),
      2,
    );

    expect(state.from).toBe("2026-05-01T06:00:00.000Z");
    expect(state.to).toBe("2026-06-11T18:00:00.000Z");
    expect(state.offset).toBe(0);
  });
});
