import { NextResponse } from "next/server";
import { readLocalStore } from "@/lib/server/local-store";
import { requireApiPermission } from "@/lib/server/auth-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApiPermission("sales.view");
  if (auth.response) {
    return auth.response;
  }

  const store = await readLocalStore();
  return NextResponse.json({
    orders: store.marketplaceOrders.filter(
      (order) => order.channel === "mercado_libre",
    ),
  });
}
