import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeMeliCode, getMeliMe } from "@/lib/meli/client";
import { createMeliInitialSalesBackfillState } from "@/lib/meli/backfill-window";
import {
  syncMeliAutomationOrders,
} from "@/lib/meli/sync";
import {
  getMarketplaceAccount,
  upsertMarketplaceAccount,
} from "@/lib/server/local-store";
import { requireApiWritablePermission } from "@/lib/server/auth-store";
import { getMeliSyncLimits } from "@/lib/server/sync-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function GET(request: Request) {
  const auth = await requireApiWritablePermission("integrations.write");
  if (auth.response) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("meli_oauth_state")?.value;
  const returnTo = normalizeReturnTo(cookieStore.get("meli_oauth_return_to")?.value);
  cookieStore.delete("meli_oauth_state");
  cookieStore.delete("meli_oauth_return_to");

  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  if (!state || !expectedState || state !== expectedState) {
    return NextResponse.json({ error: "Invalid OAuth state" }, { status: 400 });
  }

  try {
    const token = await exchangeMeliCode(code);
    const limits = getMeliSyncLimits();
    const user = await getMeliMe(token.access_token);
    const accountId = `meli_${user.id}`;
    const existingAccount = await getMarketplaceAccount(accountId);
    const newAccountBackfillMonths = existingAccount
      ? undefined
      : limits.initialBackfillMonths;
    const account = await upsertMarketplaceAccount({
      id: accountId,
      channel: "mercado_libre",
      alias: user.nickname,
      externalAccountId: String(user.id),
      nickname: user.nickname,
      siteId: user.site_id,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      tokenExpiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
      status: "connected",
      ...(existingAccount
        ? {}
        : {
            salesBackfill: createMeliInitialSalesBackfillState(
              new Date(),
              newAccountBackfillMonths,
            ),
          }),
    });
    let syncWarning: string | null = null;
    try {
      await syncMeliAutomationOrders({
        accountId: account.id,
        backfillLimit: limits.initialBackfillLimit,
        backfillMonths: newAccountBackfillMonths,
        recentLimit: limits.initialRecentLimit,
        recentIntervalMinutes: 60,
        maxRuntimeMs: limits.initialRuntimeMs,
      });
    } catch (syncError) {
      await upsertMarketplaceAccount({
        ...account,
        salesAutomation: {
          ...account.salesAutomation,
          lastRunAt: new Date().toISOString(),
          lastMode: "basic_import",
          lastChecked: 0,
          lastImported: 0,
          lastBacklogRemaining: 0,
          nextRecommendedMinutes: 15,
          lastError: syncError instanceof Error ? syncError.message.slice(0, 300) : "Initial sync failed",
        },
      });
      syncWarning = "1";
    }

    const appUrl = process.env.APP_URL ?? "http://127.0.0.1:3000";
    const doneUrl = new URL(returnTo, appUrl);
    doneUrl.searchParams.set("meli_account", account.id);
    doneUrl.searchParams.set(existingAccount ? "reconnected" : "connected", "1");
    if (syncWarning) {
      doneUrl.searchParams.set("sync_pending", syncWarning);
    }

    return NextResponse.redirect(doneUrl);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

function normalizeReturnTo(value: string | null | undefined) {
  const fallback = "/meli";
  const trimmed = value?.trim();
  if (!trimmed || !trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return fallback;
  }

  try {
    const parsed = new URL(trimmed, "https://control-total.local");
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
