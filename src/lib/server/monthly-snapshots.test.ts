import { afterEach, describe, expect, it } from "vitest";
import { formatMonthKey, getMonthlySnapshotPolicy } from "./monthly-snapshots";

const originalEnv = {
  REPORT_SUMMARY_RETENTION_YEARS: process.env.REPORT_SUMMARY_RETENTION_YEARS,
  MONTHLY_SNAPSHOT_REBUILD_MONTHS: process.env.MONTHLY_SNAPSHOT_REBUILD_MONTHS,
  MONTHLY_SNAPSHOT_CREATE_BATCH_SIZE:
    process.env.MONTHLY_SNAPSHOT_CREATE_BATCH_SIZE,
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

describe("monthly snapshot policy", () => {
  it("defaults to rebuilding 10 years of monthly summaries", () => {
    delete process.env.REPORT_SUMMARY_RETENTION_YEARS;
    delete process.env.MONTHLY_SNAPSHOT_REBUILD_MONTHS;

    expect(getMonthlySnapshotPolicy()).toMatchObject({
      summaryRetentionYears: 10,
      rebuildMonths: 120,
    });
  });

  it("caps rebuild months to the configured summary retention window", () => {
    process.env.REPORT_SUMMARY_RETENTION_YEARS = "3";
    process.env.MONTHLY_SNAPSHOT_REBUILD_MONTHS = "120";

    expect(getMonthlySnapshotPolicy()).toMatchObject({
      summaryRetentionYears: 3,
      rebuildMonths: 36,
    });
  });

  it("formats month keys in UTC", () => {
    expect(formatMonthKey(new Date("2026-06-30T23:59:59.000Z"))).toBe(
      "2026-06",
    );
  });
});
