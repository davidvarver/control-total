import { NextResponse } from "next/server";
import { readLocalStore } from "@/lib/server/local-store";
import { requireApiPermission } from "@/lib/server/auth-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApiPermission("profit.view");
  if (auth.response) {
    return auth.response;
  }

  const store = await readLocalStore();
  const orders = store.marketplaceOrders.filter(
    (order) => order.channel === "mercado_libre",
  );
  const accounts = store.marketplaceAccounts.filter(
    (account) => account.channel === "mercado_libre",
  );
  const unmappedItems = orders.flatMap((order) =>
    order.items
      .filter((item) => !item.masterSku)
      .map((item) => ({
        orderId: order.externalOrderId,
        externalSku: item.externalSku,
        title: item.title,
        quantity: item.quantity,
      })),
  );

  const grossAmount = orders.reduce((sum, order) => sum + order.grossAmount, 0);
  const charges = orders.reduce(
    (sum, order) =>
      sum + order.charges.reduce((chargeSum, charge) => chargeSum + charge.amount, 0),
    0,
  );

  return NextResponse.json({
    accounts: accounts.map(({ accessToken, refreshToken, ...account }) => ({
      ...account,
      hasAccessToken: Boolean(accessToken),
      hasRefreshToken: Boolean(refreshToken),
    })),
    stats: {
      importedOrders: orders.length,
      grossAmount,
      charges,
      unmappedItems: unmappedItems.length,
    },
    unmappedItems,
    recentOrders: orders
      .slice()
      .sort(
        (a, b) =>
          new Date(b.orderedAt).getTime() - new Date(a.orderedAt).getTime(),
      )
      .slice(0, 50),
  });
}
