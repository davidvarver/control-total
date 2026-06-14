import { PrismaClient } from "@prisma/client";

const tables = [
  "Organization",
  "User",
  "OrganizationUser",
  "Role",
  "Permission",
  "RolePermission",
  "AuthSession",
  "LocalDataStore",
  "MasterProduct",
  "OnlineSku",
  "SkuComponent",
  "Warehouse",
  "InventoryBalance",
  "InventoryMovement",
  "MarketplaceAccount",
  "SaleOrder",
  "SaleOrderItem",
  "SaleItemComponent",
  "SaleCharge",
  "OperatingExpense",
  "FullInventoryLayer",
  "StockSyncQueue",
  "SyncRun",
  "AuditLog",
  "Plan",
  "Subscription",
  "SubscriptionPayment",
] as const;

const dateChecks = [
  { table: "SaleOrder", column: "orderedAt" },
  { table: "SyncRun", column: "startedAt" },
  { table: "InventoryMovement", column: "createdAt" },
  { table: "AuditLog", column: "createdAt" },
] as const;

async function main() {
  const productionUrl = process.env.DATABASE_URL;
  const restoreUrl = process.env.RESTORE_DATABASE_URL;

  if (!productionUrl || !restoreUrl) {
    console.error(
      "Missing DATABASE_URL or RESTORE_DATABASE_URL. Set DATABASE_URL to production and RESTORE_DATABASE_URL to the restored cluster.",
    );
    process.exit(1);
  }

  if (productionUrl === restoreUrl) {
    console.error("DATABASE_URL and RESTORE_DATABASE_URL point to the same value. Refusing to compare.");
    process.exit(1);
  }

  const production = createClient(productionUrl);
  const restore = createClient(restoreUrl);

  try {
    console.log("Comparing production database with restored database.");
    console.log("No connection strings or secrets are printed.\n");

    const countRows = [];
    for (const table of tables) {
      const [productionCount, restoreCount] = await Promise.all([
        countTable(production, table),
        countTable(restore, table),
      ]);
      countRows.push({
        table,
        production: productionCount,
        restore: restoreCount,
        delta: restoreCount - productionCount,
      });
    }

    printCountTable(countRows);

    console.log("\nFreshness checks");
    console.log("----------------");
    for (const check of dateChecks) {
      const [productionMax, restoreMax] = await Promise.all([
        maxDate(production, check.table, check.column),
        maxDate(restore, check.table, check.column),
      ]);
      console.log(
        `${check.table}.${check.column}: production=${productionMax ?? "none"} restore=${restoreMax ?? "none"}`,
      );
    }

    const missingCoreData = countRows.some(
      (row) =>
        ["Organization", "User", "MasterProduct", "OnlineSku", "SaleOrder"].includes(row.table) &&
        row.production > 0 &&
        row.restore === 0,
    );

    if (missingCoreData) {
      console.error("\nRestore check failed: restored database is missing core production data.");
      process.exit(1);
    }

    console.log("\nRestore check finished. Review deltas before switching any production env vars.");
  } finally {
    await Promise.allSettled([production.$disconnect(), restore.$disconnect()]);
  }
}

function createClient(url: string) {
  return new PrismaClient({
    datasources: {
      db: {
        url,
      },
    },
  });
}

async function countTable(client: PrismaClient, table: string) {
  const rows = await client.$queryRawUnsafe<Array<{ count: bigint | number | string }>>(
    `SELECT COUNT(*)::bigint AS count FROM "${table}"`,
  );
  return toNumber(rows[0]?.count);
}

async function maxDate(client: PrismaClient, table: string, column: string) {
  const rows = await client.$queryRawUnsafe<Array<{ value: Date | string | null }>>(
    `SELECT MAX("${column}") AS value FROM "${table}"`,
  );
  const value = rows[0]?.value;
  if (!value) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function printCountTable(
  rows: Array<{ table: string; production: number; restore: number; delta: number }>,
) {
  const tableWidth = Math.max(...rows.map((row) => row.table.length), "Table".length);
  const prodWidth = Math.max(
    ...rows.map((row) => row.production.toLocaleString("en-US").length),
    "Production".length,
  );
  const restoreWidth = Math.max(
    ...rows.map((row) => row.restore.toLocaleString("en-US").length),
    "Restore".length,
  );
  const deltaWidth = Math.max(
    ...rows.map((row) => signed(row.delta).length),
    "Delta".length,
  );

  console.log(
    `${"Table".padEnd(tableWidth)}  ${"Production".padStart(prodWidth)}  ${"Restore".padStart(restoreWidth)}  ${"Delta".padStart(deltaWidth)}`,
  );
  console.log(
    `${"-".repeat(tableWidth)}  ${"-".repeat(prodWidth)}  ${"-".repeat(restoreWidth)}  ${"-".repeat(deltaWidth)}`,
  );
  for (const row of rows) {
    console.log(
      `${row.table.padEnd(tableWidth)}  ${row.production.toLocaleString("en-US").padStart(prodWidth)}  ${row.restore.toLocaleString("en-US").padStart(restoreWidth)}  ${signed(row.delta).padStart(deltaWidth)}`,
    );
  }
}

function signed(value: number) {
  return value > 0 ? `+${value.toLocaleString("en-US")}` : value.toLocaleString("en-US");
}

function toNumber(value: bigint | number | string | null | undefined) {
  if (typeof value === "bigint") {
    return Number(value);
  }
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
