import { redirect } from "next/navigation";
import { requireWritablePermission } from "@/lib/server/auth-store";
import {
  readLocalStore,
  recalculateMarketplaceOrders,
  replaceSkuMappings,
} from "@/lib/server/local-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  await requireWritablePermission("imports.write");
  const store = await readLocalStore();

  if (store.onlineSkus.length > 0) {
    await replaceSkuMappings(store.onlineSkus);
  } else {
    await recalculateMarketplaceOrders();
  }

  redirect("/setup?recalculated=1");
}
