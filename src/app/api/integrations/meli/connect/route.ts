import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { buildMeliAuthorizationUrl } from "@/lib/meli/config";
import { requireApiWritablePermission } from "@/lib/server/auth-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requireApiWritablePermission("integrations.write");
    if (auth.response) {
      return auth.response;
    }

    const url = new URL(request.url);
    const returnTo = normalizeReturnTo(url.searchParams.get("returnTo"));
    const state = `meli_${crypto.randomUUID()}`;
    const cookieStore = await cookies();
    cookieStore.set("meli_oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 10 * 60,
    });
    cookieStore.set("meli_oauth_return_to", returnTo, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 10 * 60,
    });

    return NextResponse.redirect(buildMeliAuthorizationUrl(state));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

function normalizeReturnTo(value: string | null) {
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
