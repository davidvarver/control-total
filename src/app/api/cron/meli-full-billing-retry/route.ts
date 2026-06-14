import { NextResponse } from "next/server";
import { syncMeliFullBilling } from "@/lib/meli/full-billing";
import { listOrganizationStores, runWithOrganization } from "@/lib/server/local-store";
import { hasValidSharedSecret } from "@/lib/server/request-security";
import { finishSyncRun, startSyncRun } from "@/lib/server/sync-runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type AccountResult = {
  organizationId: string;
  accountId: string;
  alias: string;
  period: string;
  charges: number;
  totalAmount: number;
  totalUnits: number;
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

  const url = new URL(request.url);
  const periodOverride = normalizePeriodOverride(url.searchParams.get("period"));
  const period = periodOverride ?? getPreviousMonthPeriod();

  if (!periodOverride && !isFullBillingRetryWindow()) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "outside_retry_window",
      period,
      syncedAt: new Date().toISOString(),
    });
  }

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
          jobType: "meli-full-billing-retry",
          details: {
            alias: account.alias,
            externalAccountId: account.externalAccountId,
            period,
          },
        });
        const result: AccountResult = {
          organizationId,
          accountId: account.id,
          alias: account.alias,
          period,
          charges: 0,
          totalAmount: 0,
          totalUnits: 0,
        };

        try {
          await runWithOrganization(store.organization, async () => {
            const synced = await syncMeliFullBilling({
              accountId: account.id,
              period,
            });
            result.charges = synced.charges.length;
            result.totalAmount = synced.totalAmount;
            result.totalUnits = synced.totalUnits;
          });
          await finishSyncRun({
            id: syncRun.id,
            status: "success",
            startedAt: runStartedAt,
            checked: result.charges,
            imported: result.charges,
            total: result.charges,
            details: result,
          });
        } catch (error) {
          result.error =
            error instanceof Error
              ? error.message.slice(0, 300)
              : "Unknown Full billing retry error";
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
      period,
      organizations: stores.length,
      accounts: results.length,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        period,
        error:
          error instanceof Error && error.message.includes("exceeded the data transfer quota")
            ? "database quota exceeded"
            : error instanceof Error
              ? error.message
              : "Unknown Full billing retry cron error",
      },
      { status: 200 },
    );
  }
}

function isFullBillingRetryWindow(now = new Date()) {
  return now.getUTCDate() <= 15;
}

function getPreviousMonthPeriod(now = new Date()) {
  const year = now.getUTCFullYear();
  const monthIndex = now.getUTCMonth();
  const previousMonth = new Date(Date.UTC(year, monthIndex - 1, 1));
  const previousYear = previousMonth.getUTCFullYear();
  const previousMonthNumber = String(previousMonth.getUTCMonth() + 1).padStart(2, "0");

  return `${previousYear}-${previousMonthNumber}-01`;
}

function normalizePeriodOverride(period: string | null) {
  if (!period) {
    return null;
  }

  if (/^\d{4}-\d{2}$/.test(period)) {
    return `${period}-01`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) {
    return period;
  }

  return null;
}
