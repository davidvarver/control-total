export type MeliSyncLimits = ReturnType<typeof getMeliSyncLimits>;

export function getMeliSyncLimits() {
  const hourlyBackfillLimit = readIntEnv("MELI_HOURLY_BACKFILL_LIMIT", 150, 1, 5_000);
  return {
    hourlyBackfillLimit,
    hourlyRecentLimit: readIntEnv(
      "MELI_HOURLY_RECENT_LIMIT",
      hourlyBackfillLimit,
      1,
      5_000,
    ),
    hourlyAccountRuntimeMs: readIntEnv(
      "MELI_HOURLY_ACCOUNT_RUNTIME_MS",
      90_000,
      10_000,
      150_000,
    ),
    hourlyPendingBillingLimit: readIntEnv(
      "MELI_HOURLY_PENDING_BILLING_LIMIT",
      25,
      0,
      500,
    ),
    hourlyFullStockMaxItems: readIntEnv(
      "MELI_HOURLY_FULL_STOCK_MAX_ITEMS",
      500,
      0,
      10_000,
    ),
    initialBackfillLimit: readIntEnv("MELI_INITIAL_BACKFILL_LIMIT", 500, 1, 5_000),
    initialBackfillMonths: readIntEnv("MELI_INITIAL_BACKFILL_MONTHS", 2, 1, 12),
    initialRecentLimit: readIntEnv("MELI_INITIAL_RECENT_LIMIT", 150, 1, 5_000),
    initialRuntimeMs: readIntEnv("MELI_INITIAL_SYNC_RUNTIME_MS", 120_000, 10_000, 150_000),
    adminBackfillDefault: readIntEnv("MELI_ADMIN_BACKFILL_DEFAULT", 500, 50, 5_000),
    adminBackfillMax: readIntEnv("MELI_ADMIN_BACKFILL_MAX", 5_000, 50, 5_000),
    adminPendingBillingLimit: readIntEnv(
      "MELI_ADMIN_PENDING_BILLING_LIMIT",
      50,
      0,
      1_000,
    ),
    adminFullStockMaxItems: readIntEnv("MELI_ADMIN_FULL_STOCK_MAX_ITEMS", 5_000, 50, 10_000),
  };
}

function readIntEnv(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(Math.floor(value), max));
}
