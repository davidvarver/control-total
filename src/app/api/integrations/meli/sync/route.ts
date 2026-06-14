import { NextResponse } from "next/server";
import { syncMeliRecentOrders } from "@/lib/meli/sync";
import { requireApiWritablePermission } from "@/lib/server/auth-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const auth = await requireApiWritablePermission("integrations.write");
    if (auth.response) {
      return auth.response;
    }

    const body = (await request.json()) as {
      accountId?: string;
      limit?: number;
    };

    if (!body.accountId) {
      return NextResponse.json({ error: "accountId is required" }, { status: 400 });
    }

    const result = await syncMeliRecentOrders({
      accountId: body.accountId,
      limit: body.limit,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
