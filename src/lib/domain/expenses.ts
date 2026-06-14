export const EXPENSE_FREQUENCIES = [
  "one_time",
  "weekly",
  "biweekly",
  "monthly",
  "bimonthly",
  "semiannual",
  "annual",
] as const;

export type ExpenseFrequency = (typeof EXPENSE_FREQUENCIES)[number];

export const EXPENSE_FREQUENCY_OPTIONS: Array<{
  value: ExpenseFrequency;
  label: string;
  helper: string;
}> = [
  {
    value: "one_time",
    label: "Solo este mes",
    helper: "Se carga completo solo al mes elegido.",
  },
  {
    value: "weekly",
    label: "Semanal",
    helper: "Pon el pago de una semana; se cuenta cada viernes del mes.",
  },
  {
    value: "biweekly",
    label: "Quincenal",
    helper: "Pon el pago de una quincena; se cuenta dos veces al mes.",
  },
  {
    value: "monthly",
    label: "Mensual",
    helper: "Pon el gasto mensual.",
  },
  {
    value: "bimonthly",
    label: "Bimestral",
    helper: "Pon el gasto de dos meses; se reparte por dia.",
  },
  {
    value: "semiannual",
    label: "Semestral",
    helper: "Pon el gasto de seis meses; se reparte por dia.",
  },
  {
    value: "annual",
    label: "Anual",
    helper: "Pon el gasto anual; se reparte por dia.",
  },
];

const frequencyLabels = new Map(
  EXPENSE_FREQUENCY_OPTIONS.map((option) => [option.value, option.label]),
);

type ExpenseForCalculation = {
  month: string;
  amount: number;
  frequency?: string | null;
  paidAt?: string | null;
  periodStart?: string | null;
  activeUntil?: string | null;
  isRecurring?: boolean | null;
};

export function normalizeExpenseFrequency(value?: string | null): ExpenseFrequency {
  if (EXPENSE_FREQUENCIES.includes(value as ExpenseFrequency)) {
    return value as ExpenseFrequency;
  }
  return "one_time";
}

export function getExpenseFrequencyLabel(value?: string | null) {
  return frequencyLabels.get(normalizeExpenseFrequency(value)) ?? "Solo este mes";
}

export function calculateExpenseAmountForMonth(
  expense: ExpenseForCalculation,
  month: string,
  options: { asOf?: Date | string | null } = {},
) {
  const amount = Math.max(0, Number(expense.amount) || 0);
  if (amount <= 0) return 0;

  const frequency = expense.frequency
    ? normalizeExpenseFrequency(expense.frequency)
    : expense.isRecurring
      ? "monthly"
      : "one_time";
  const target = parseMonthStart(month);
  if (!target) return 0;
  const targetEnd = addMonths(target, 1);
  const asOf = parseCalculationDate(options.asOf);
  const effectiveTargetEnd =
    asOf && sameMonth(asOf, target) ? minDate(addDays(asOf, 1), targetEnd) : targetEnd;
  if (asOf && asOf < target) return 0;

  if (frequency === "one_time") {
    return expense.month === month ? roundMoney(amount) : 0;
  }

  const startsAt =
    parseDateOnly(expense.periodStart) ??
    parseDateOnly(expense.paidAt) ??
    parseMonthStart(expense.month);
  if (!startsAt || targetEnd <= startsAt) return 0;

  const activeUntil = parseDateOnly(expense.activeUntil);
  if (activeUntil && target >= addDays(activeUntil, 1)) return 0;

  if (frequency === "weekly") {
    return calculateFixedWeeklyExpense({
      amount,
      startsAt,
      target,
      targetEnd: effectiveTargetEnd,
      activeUntil,
      isRecurring: expense.isRecurring !== false,
    });
  }

  if (frequency === "monthly" || frequency === "biweekly") {
    return calculateFixedMonthlyExpense({
      amount,
      frequency,
      startsAt,
      target,
      monthEnd: targetEnd,
      cutoffEnd: effectiveTargetEnd,
      activeUntil,
      isRecurring: expense.isRecurring !== false,
    });
  }

  const period = getFrequencyPeriod(frequency);
  const isRecurring = expense.isRecurring !== false;
  let periodStart = startsAt;
  let total = 0;

  for (let guard = 0; guard < 240; guard += 1) {
    const periodEnd = addMonths(periodStart, period.value);

    if (periodEnd <= target) {
      if (!isRecurring) return 0;
      periodStart = periodEnd;
      continue;
    }

    if (periodStart >= targetEnd) {
      break;
    }

    if (periodEnd > target && periodStart < targetEnd) {
      const effectiveEnd =
        activeUntil && activeUntil < periodEnd ? addDays(activeUntil, 1) : periodEnd;
      const overlapDays = getOverlapDays(periodStart, effectiveEnd, target, targetEnd);
      if (overlapDays > 0) {
        const periodDays = Math.max(1, daysBetween(periodStart, periodEnd));
        total += (amount / periodDays) * overlapDays;
      }

      if (activeUntil && activeUntil < periodEnd) {
        break;
      }
    }

    if (!isRecurring) break;
    periodStart = periodEnd;
  }

  return roundMoney(total);
}

function getFrequencyPeriod(frequency: ExpenseFrequency) {
  switch (frequency) {
    case "bimonthly":
      return { kind: "months" as const, value: 2 };
    case "semiannual":
      return { kind: "months" as const, value: 6 };
    case "annual":
      return { kind: "months" as const, value: 12 };
    case "monthly":
    default:
      return { kind: "months" as const, value: 1 };
  }
}

function calculateFixedWeeklyExpense(input: {
  amount: number;
  startsAt: Date;
  target: Date;
  targetEnd: Date;
  activeUntil: Date | null;
  isRecurring: boolean;
}) {
  let total = 0;

  for (
    let paymentDate = nextFridayOnOrAfter(input.target);
    paymentDate < input.targetEnd;
    paymentDate = addDays(paymentDate, 7)
  ) {
    if (paymentDate < input.startsAt) {
      continue;
    }

    if (input.activeUntil && paymentDate > input.activeUntil) {
      continue;
    }

    if (!input.isRecurring && !sameMonth(paymentDate, input.startsAt)) {
      continue;
    }

    total += input.amount;
  }

  return roundMoney(total);
}

function calculateFixedMonthlyExpense(input: {
  amount: number;
  frequency: Extract<ExpenseFrequency, "monthly" | "biweekly">;
  startsAt: Date;
  target: Date;
  monthEnd: Date;
  cutoffEnd: Date;
  activeUntil: Date | null;
  isRecurring: boolean;
}) {
  const paymentDays: Array<number | "last"> =
    input.frequency === "biweekly" ? [15, "last"] : ["last"];
  let total = 0;

  for (const paymentDay of paymentDays) {
    const paymentDate =
      paymentDay === "last" ? addDays(input.monthEnd, -1) : setMonthDay(input.target, paymentDay);

    if (paymentDate < input.startsAt || paymentDate >= input.cutoffEnd) {
      continue;
    }

    if (input.activeUntil && paymentDate > input.activeUntil) {
      continue;
    }

    if (!input.isRecurring && !sameMonth(paymentDate, input.startsAt)) {
      continue;
    }

    total += input.amount;
  }

  return roundMoney(total);
}

function parseMonthStart(value?: string | null) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return null;
  const [year, month] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1));
}

function parseDateOnly(value?: string | null) {
  if (!value) return null;
  const normalized = value.length >= 10 ? value.slice(0, 10) : value;
  if (/^\d{4}-\d{2}$/.test(normalized)) {
    return parseMonthStart(normalized);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const [year, month, day] = normalized.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function parseCalculationDate(value?: Date | string | null) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isFinite(value.getTime())
      ? new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
      : null;
  }
  return parseDateOnly(value);
}

function nextFridayOnOrAfter(date: Date) {
  const next = new Date(date);
  const friday = 5;
  const delta = (friday - next.getUTCDay() + 7) % 7;
  next.setUTCDate(next.getUTCDate() + delta);
  return next;
}

function minDate(left: Date, right: Date) {
  return left <= right ? left : right;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function setMonthDay(monthStart: Date, day: number) {
  const next = new Date(monthStart);
  next.setUTCDate(day);
  return next;
}

function sameMonth(left: Date, right: Date) {
  return (
    left.getUTCFullYear() === right.getUTCFullYear() &&
    left.getUTCMonth() === right.getUTCMonth()
  );
}

function daysBetween(start: Date, end: Date) {
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

function getOverlapDays(start: Date, end: Date, monthStart: Date, monthEnd: Date) {
  const overlapStart = start > monthStart ? start : monthStart;
  const overlapEnd = end < monthEnd ? end : monthEnd;
  if (overlapEnd <= overlapStart) return 0;
  return daysBetween(overlapStart, overlapEnd);
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
