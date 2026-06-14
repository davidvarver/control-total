import { describe, expect, it } from "vitest";
import { calculateExpenseAmountForMonth } from "./expenses";

describe("calculateExpenseAmountForMonth", () => {
  it("charges one-time expenses only in their base month", () => {
    const expense = {
      month: "2026-05",
      amount: 1000,
      frequency: "one_time",
    };

    expect(calculateExpenseAmountForMonth(expense, "2026-05")).toBe(1000);
    expect(calculateExpenseAmountForMonth(expense, "2026-06")).toBe(0);
  });

  it("counts weekly expenses on Fridays of the target month", () => {
    const expense = {
      month: "2026-05",
      periodStart: "2026-05-01",
      amount: 700,
      frequency: "weekly",
    };

    expect(calculateExpenseAmountForMonth(expense, "2026-05")).toBe(3500);
  });

  it("only counts weekly expenses already due when an as-of date is provided", () => {
    const expense = {
      month: "2026-05",
      periodStart: "2026-05-01",
      amount: 700,
      frequency: "weekly",
    };

    expect(
      calculateExpenseAmountForMonth(expense, "2026-05", {
        asOf: "2026-05-14",
      }),
    ).toBe(1400);
  });

  it("counts biweekly payroll as two fixed payments per month", () => {
    const expense = {
      month: "2026-05",
      periodStart: "2026-05-01",
      amount: 500,
      frequency: "biweekly",
    };

    expect(calculateExpenseAmountForMonth(expense, "2026-05")).toBe(1000);
    expect(calculateExpenseAmountForMonth(expense, "2026-06")).toBe(1000);
    expect(calculateExpenseAmountForMonth(expense, "2026-02")).toBe(0);
  });

  it("counts monthly expenses once per month regardless of month length", () => {
    const expense = {
      month: "2026-01",
      periodStart: "2026-01-01",
      amount: 3100,
      frequency: "monthly",
    };

    expect(calculateExpenseAmountForMonth(expense, "2026-02")).toBe(3100);
    expect(calculateExpenseAmountForMonth(expense, "2026-03")).toBe(3100);
  });

  it("counts monthly expenses only after the last day when an as-of date is provided", () => {
    const expense = {
      month: "2026-06",
      periodStart: "2026-06-01",
      amount: 3100,
      frequency: "monthly",
    };

    expect(
      calculateExpenseAmountForMonth(expense, "2026-06", {
        asOf: "2026-06-15",
      }),
    ).toBe(0);
    expect(
      calculateExpenseAmountForMonth(expense, "2026-06", {
        asOf: "2026-06-30",
      }),
    ).toBe(3100);
  });

  it("spreads annual expenses by real days in the year period", () => {
    const expense = {
      month: "2026-01",
      periodStart: "2026-01-01",
      amount: 12000,
      frequency: "annual",
    };

    expect(calculateExpenseAmountForMonth(expense, "2026-05")).toBeCloseTo(
      1019.18,
      2,
    );
  });

  it("does not repeat a non-recurring monthly expense", () => {
    const expense = {
      month: "2026-05",
      periodStart: "2026-05-01",
      amount: 3100,
      frequency: "monthly",
      isRecurring: false,
    };

    expect(calculateExpenseAmountForMonth(expense, "2026-05")).toBe(3100);
    expect(calculateExpenseAmountForMonth(expense, "2026-06")).toBe(0);
  });

  it("prorates bimonthly expenses that start mid-month", () => {
    const expense = {
      month: "2026-05",
      periodStart: "2026-05-15",
      amount: 6000,
      frequency: "bimonthly",
    };

    expect(calculateExpenseAmountForMonth(expense, "2026-05")).toBeCloseTo(
      1672.13,
      2,
    );
  });

  it("does not count monthly expenses when inactive before payment day", () => {
    const expense = {
      month: "2026-05",
      periodStart: "2026-05-01",
      activeUntil: "2026-05-10",
      amount: 3100,
      frequency: "monthly",
    };

    expect(calculateExpenseAmountForMonth(expense, "2026-05")).toBe(0);
    expect(calculateExpenseAmountForMonth(expense, "2026-06")).toBe(0);
  });
});
