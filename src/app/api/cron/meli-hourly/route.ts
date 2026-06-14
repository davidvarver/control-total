import { NextResponse } from "next/server";
import {
  retryPendingMeliBilling,
  syncMeliAutomationOrders,
  syncMeliFullStock,
} from "@/lib/meli/sync";
import {
  getMarketplaceAccount,
  listOrganizationStores,
  runWithOrganization,
  upsertMarketplaceAccount,
} from "@/lib/server/local-store";
import { hasValidSharedSecret } from "@/lib/server/request-security";
import { getMeliSyncLimits } from "@/lib/server/sync-config";
import { finishSyncRun, startSyncRun } from "@/lib/server/sync-runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

const CRON_TIME_BUDGET_MS = 165_000;
const MIN_ACCOUNT_BUDGET_MS = 30_000;
const MIN_OPTIONAL_TASK_BUDGET_MS = 30_000;

type AccountResult = {
  organizationId: string;
  accountId: string;
  alias: string;
  ordersSynced: number;
  ordersChecked: number;
  unmappedOrders: number;
  syncMode?: string;
  syncTotal?: number;
  backlogRemaining?: number;
  nextRecommendedMinutes?: number;
  pendingChecked: number;
  pendingUpdated: number;
  pendingRemaining: number;
  fullSynced?: number;
  fullUnmapped?: number;
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

  try {
    const startedAt = Date.now();
    const limits = getMeliSyncLimits();
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
          jobType: "meli-hourly",
          details: {
            alias: account.alias,
            externalAccountId: account.externalAccountId,
          },
        });
        const result: AccountResult = {
          organizationId,
          accountId: account.id,
          alias: account.alias,
          ordersSynced: 0,
          ordersChecked: 0,
          unmappedOrders: 0,
          pendingChecked: 0,
          pendingUpdated: 0,
          pendingRemaining: 0,
        };

        if (!hasTimeBudget(startedAt, MIN_ACCOUNT_BUDGET_MS)) {
          result.skippedReason = "time_budget_exhausted";
          await finishSyncRun({
            id: syncRun.id,
            status: "skipped",
            startedAt: runStartedAt,
            errorMessage: result.skippedReason,
          });
          results.push(result);
          continue;
        }

        try {
          await runWithOrganization(store.organization, async () => {
            const orders = await syncMeliAutomationOrders({
              accountId: account.id,
              backfillLimit: limits.hourlyBackfillLimit,
              recentLimit: limits.hourlyRecentLimit,
              recentIntervalMinutes: 60,
              maxRuntimeMs: limits.hourlyAccountRuntimeMs,
            });
            result.ordersSynced = orders.importedOrders;
            result.ordersChecked = orders.checked;
            result.unmappedOrders = orders.unmappedItems.length;
            result.syncMode = orders.mode;
            result.syncTotal = orders.total;
            result.backlogRemaining = orders.remaining;
            result.nextRecommendedMinutes = orders.nextRecommendedMinutes;

            const salesBacklogIsClear =
              orders.mode === "skip_recent" || orders.remaining === 0;

            if (
              hasTimeBudget(startedAt, MIN_OPTIONAL_TASK_BUDGET_MS) &&
              salesBacklogIsClear
            ) {
              const pending = await retryPendingMeliBilling({
                accountId: account.id,
                limit: limits.hourlyPendingBillingLimit,
              });
              result.pendingChecked = pending.checked;
              result.pendingUpdated = pending.updated;
              result.pendingRemaining = pending.pending;
            }

            if (
              hasTimeBudget(startedAt, MIN_OPTIONAL_TASK_BUDGET_MS) &&
              salesBacklogIsClear &&
              shouldSyncFull(store.fullStockSync?.syncedAt)
            ) {
              const full = await syncMeliFullStock({
                accountId: account.id,
                maxItems: limits.hourlyFullStockMaxItems,
              });
              result.fullSynced = full.totalFulfillmentUnits;
              result.fullUnmapped = full.unmappedItems.length;
            }
          });
          await finishSyncRun({
            id: syncRun.id,
            status: result.error
              ? "failed"
              : result.syncMode === "skip_recent"
                ? "skipped"
                : "success",
            startedAt: runStartedAt,
            checked: result.ordersChecked + result.pendingChecked + (result.fullSynced ?? 0),
            imported: result.ordersSynced + result.pendingUpdated,
            pending: (result.backlogRemaining ?? 0) + result.pendingRemaining,
            total: result.syncTotal ?? 0,
            errorMessage: result.error,
            details: {
              ...result,
              fullSynced: result.fullSynced,
              fullUnmapped: result.fullUnmapped,
            },
          });
        } catch (error) {
          result.error =
            error instanceof Error
              ? error.message.slice(0, 300)
              : "Unknown sync error";
          await runWithOrganization(store.organization, async () => {
            const currentAccount = await getMarketplaceAccount(account.id);
            if (!currentAccount) {
              return;
            }

            await upsertMarketplaceAccount({
              ...currentAccount,
              salesAutomation: {
                ...currentAccount.salesAutomation,
                lastRunAt: new Date().toISOString(),
                lastError: result.error,
              },
            });
          });
          await finishSyncRun({
            id: syncRun.id,
            status: "failed",
            startedAt: runStartedAt,
            checked: result.ordersChecked,
            imported: result.ordersSynced,
            pending: (result.backlogRemaining ?? 0) + result.pendingRemaining,
            total: result.syncTotal ?? 0,
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
              : "Unknown cron error",
      },
      { status: 200 },
    );
  }
}

function hasTimeBudget(startedAt: number, minRemainingMs: number) {
  return Date.now() - startedAt <= CRON_TIME_BUDGET_MS - minRemainingMs;
}

function shouldSyncFull(lastSyncedAt: string | undefined) {
  if (!lastSyncedAt) {
    return true;
  }

  const lastSync = new Date(lastSyncedAt).getTime();
  if (!Number.isFinite(lastSync)) {
    return true;
  }

  const oneDay = 24 * 60 * 60 * 1000;
  return Date.now() - lastSync >= oneDay;
}
