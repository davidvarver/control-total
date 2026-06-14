const BUSINESS_TIME_ZONE = "America/Mexico_City";

export type MeliSalesBackfillState = {
  from: string;
  to: string;
  offset: number;
  startedAt: string;
  completedAt?: string;
  lastRunAt?: string;
  lastTotal?: number;
};

export function createMeliInitialSalesBackfillState(
  now: Date,
  backfillMonths?: number,
): MeliSalesBackfillState {
  const from = getMeliMonthBackfillFrom(now, backfillMonths);
  const to = getMeliBackfillCutoff(now);

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    offset: 0,
    startedAt: now.toISOString(),
  };
}

export function getMeliBackfillCutoff(now: Date) {
  const parts = getZonedDateParts(now, BUSINESS_TIME_ZONE);

  return zonedDateTimeToUtc({
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: 0,
    second: 0,
    timeZone: BUSINESS_TIME_ZONE,
  });
}

export function getMeliMonthBackfillFrom(now: Date, backfillMonths = 1) {
  const parts = getZonedDateParts(now, BUSINESS_TIME_ZONE);
  const monthLookback = Math.max(0, Math.min(12, Math.trunc(backfillMonths) - 1));

  return zonedDateTimeToUtc({
    year: parts.year,
    month: parts.month - monthLookback,
    day: 1,
    hour: 0,
    minute: 0,
    second: 0,
    timeZone: BUSINESS_TIME_ZONE,
  });
}

function getZonedDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const valueByType = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(valueByType.get("year")),
    month: Number(valueByType.get("month")),
    day: Number(valueByType.get("day")),
    hour: Number(valueByType.get("hour")),
    minute: Number(valueByType.get("minute")),
    second: Number(valueByType.get("second")),
  };
}

function zonedDateTimeToUtc(input: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  timeZone: string;
}) {
  let utcTime = Date.UTC(
    input.year,
    input.month - 1,
    input.day,
    input.hour,
    input.minute,
    input.second,
  );

  for (let iteration = 0; iteration < 3; iteration += 1) {
    const parts = getZonedDateParts(new Date(utcTime), input.timeZone);
    const representedTime = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const expectedTime = Date.UTC(
      input.year,
      input.month - 1,
      input.day,
      input.hour,
      input.minute,
      input.second,
    );
    const delta = representedTime - expectedTime;

    if (delta === 0) {
      break;
    }

    utcTime -= delta;
  }

  return new Date(utcTime);
}
