import { afterEach, describe, expect, it } from "vitest";
import { getMeliSyncLimits } from "./sync-config";

const originalInitialBackfillMonths = process.env.MELI_INITIAL_BACKFILL_MONTHS;

afterEach(() => {
  if (originalInitialBackfillMonths === undefined) {
    delete process.env.MELI_INITIAL_BACKFILL_MONTHS;
  } else {
    process.env.MELI_INITIAL_BACKFILL_MONTHS = originalInitialBackfillMonths;
  }
});

describe("Meli sync limits", () => {
  it("defaults new account initial backfill to current month plus previous month", () => {
    delete process.env.MELI_INITIAL_BACKFILL_MONTHS;

    expect(getMeliSyncLimits().initialBackfillMonths).toBe(2);
  });

  it("still lets production env override the initial backfill months", () => {
    process.env.MELI_INITIAL_BACKFILL_MONTHS = "1";

    expect(getMeliSyncLimits().initialBackfillMonths).toBe(1);
  });
});
