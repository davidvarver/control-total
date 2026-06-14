import { rebuildMonthlySnapshots } from "../src/lib/server/monthly-snapshots";

async function main() {
  const monthsArg = process.argv.find((arg) => arg.startsWith("--months="));
  const rebuildMonths = monthsArg
    ? Number(monthsArg.replace("--months=", ""))
    : undefined;

  if (rebuildMonths !== undefined && !Number.isFinite(rebuildMonths)) {
    throw new Error("--months must be a number");
  }

  const result = await rebuildMonthlySnapshots({
    rebuildMonths:
      rebuildMonths !== undefined
        ? Math.max(1, Math.floor(rebuildMonths))
        : undefined,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
