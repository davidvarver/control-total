import { NextResponse } from "next/server";
import { syncMeliFullStock } from "@/lib/meli/sync";
import { listOrganizationStores, runWithOrganization } from "@/lib/server/local-store";
import { hasValidSharedSecret } from "@/lib/server/request-security";
import { finishSyncRun, startSyncRun } from "@/lib/server/sync-runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

const CRON_TIME_BUDGET_MS = 165_000;
const MIN_ACCOUNT_BUDGET_MS = 25_000;
const DEFAULT_MAX_ITEMS = 5_000;

type AccountResult = {
  organizationId: string;
  accountId: string;
  alias: string;
  scannedItems: number;
  fullListings: number;
  totalFulfillmentUnits: number;
  mappedUnits: number;
  unmappedItems: number;
  syncedAt?: string;
  skippedReason?: string;
  error?: string;
};

export async function GET(request: Request) {
  const secretStatus = hasValidSharedSecret({
    request,
    expectedSecret: process.env.CRON_SECRET,
  });

  if (secretStatus === "missing") {
    return new Response("CRON_SECRET is not configured", { status: 503 });
  }

  if (secretStatus !== "valid") {
    return new Response("Unauthorized", { status: 401 });
  }

  const startedAt = Date.now();
  const url = new URL(request.url);
  const maxItems = clampNumber(Number(url.searchParams.get("maxItems") ?? DEFAULT_MAX_ITEMS), 50, 10_000);

  try {
    const stores = await listOrganizationStores();
    const results: AccountResult[] = [];

    for (const { organizationId, store } of stores) {
      const accounts = store.marketplaceAccounts.filter(
        (account) => account.channel === "mercado_libre" && account.status === "connected",
      );

      for (const account of accounts) {
        const runStartedAt = new Date();
        const syncRun = await startSyncRun({
          organizationId,
          marketplaceAccountId: account.id,
          channel: "mercado_libre",
          jobType: "meli-full-stock-daily",
          details: {
            alias: account.alias,
            externalAccountId: account.externalAccountId,
            maxItems,
          },
        });
        const result: AccountResult = {
          organizationId,
          accountId: account.id,
          alias: account.alias,
          scannedItems: 0,
          fullListings: 0,
          totalFulfillmentUnits: 0,
          mappedUnits: 0,
          unmappedItems: 0,
        };

        if (!hasTimeBudget(startedAt, MIN_ACCOUNT_BUDGET_MS)) {
          result.skippedReason = "time_budget_exhausted";
          await finishSyncRun({
            id: syncRun.id,
            status: "skipped",
            startedAt: runStartedAt,
            errorMessage: result.skippedReason,
            details: result,
          });
          results.push(result);
          continue;
        }

        try {
          await runWithOrganization(store.organization, async () => {
            const full = await syncMeliFullStock({
              accountId: account.id,
              maxItems,
            });
            result.scannedItems = full.scannedItems;
            result.fullListings = full.fullListings;
            result.totalFulfillmentUnits = full.totalFulfillmentUnits;
            result.mappedUnits = full.mappedUnits;
            result.unmappedItems = full.unmappedItems.length;
            result.syncedAt = full.syncedAt;
          });
          await finishSyncRun({
            id: syncRun.id,
            status: "success",
            startedAt: runStartedAt,
            checked: result.scannedItems,
            imported: result.mappedUnits,
            pending: result.unmappedItems,
            total: result.totalFulfillmentUnits,
            details: result,
          });
        } catch (error) {
          result.error =
            error instanceof Error
              ? error.message.slice(0, 300)
              : "Unknown Full stock sync error";
          await finishSyncRun({
            id: syncRun.id,
            status: "failed",
            startedAt: runStartedAt,
            errorMessage: result.error,
            details: result,
          });
        }

        results.push(result);
      }
    }

    return NextResponse.json({
      ok: true,
      syncedAt: new Date().toISOString(),
      runtimeMs: Date.now() - startedAt,
      maxItems,
      organizations: stores.length,
      accounts: results.length,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error && error.message.includes("exceeded the data transfer quota")
            ? "database quota exceeded"
            : error instanceof Error
              ? error.message
              : "Unknown Full stock cron error",
      },
      { status: 200 },
    );
  }
}

function hasTimeBudget(startedAt: number, minRemainingMs: number) {
  return Date.now() - startedAt <= CRON_TIME_BUDGET_MS - minRemainingMs;
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(Math.floor(value), max));
}
