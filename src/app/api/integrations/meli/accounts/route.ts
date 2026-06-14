import { NextResponse } from "next/server";
import { listMarketplaceAccounts } from "@/lib/server/local-store";
import { requireApiPermission } from "@/lib/server/auth-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApiPermission("integrations.write");
  if (auth.response) {
    return auth.response;
  }

  const accounts = await listMarketplaceAccounts();
  return NextResponse.json({
    accounts: accounts.map(({ accessToken, refreshToken, ...account }) => ({
      ...account,
      hasAccessToken: Boolean(accessToken),
      hasRefreshToken: Boolean(refreshToken),
    })),
  });
}
