import { NextResponse } from "next/server";
import { requireApiWritablePermission } from "@/lib/server/auth-store";
import {
  getMarketplaceAccount,
  upsertMarketplaceAccount,
} from "@/lib/server/local-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireApiWritablePermission("integrations.write");
  if (auth.response) {
    return auth.response;
  }

  const formData = await request.formData();
  const accountId = String(formData.get("accountId") ?? "").trim();

  if (!accountId) {
    return NextResponse.json(
      { error: "Falta la cuenta a desvincular." },
      { status: 400 },
    );
  }

  const account = await getMarketplaceAccount(accountId);
  if (!account) {
    return NextResponse.json(
      { error: "No se encontro la integracion." },
      { status: 404 },
    );
  }

  await upsertMarketplaceAccount({
    ...account,
    accessToken: "",
    refreshToken: "",
    tokenExpiresAt: new Date().toISOString(),
    status: "disabled",
    salesAutomation: {
      ...account.salesAutomation,
      lastRunAt: new Date().toISOString(),
      lastMode: "skip_recent",
      lastError: undefined,
    },
  });

  const redirectUrl = new URL(
    normalizeBackPath(String(formData.get("back") ?? "/meli")),
    request.url,
  );
  redirectUrl.searchParams.set("disconnected", "1");
  redirectUrl.searchParams.set("meli_account", account.id);

  if (request.headers.get("x-requested-with") !== "fetch") {
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.json({
    ok: true,
    status: "disabled",
    redirectUrl: `${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}`,
  });
}

function normalizeBackPath(value: string) {
  const fallback = "/meli";
  const trimmed = value.trim();
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
