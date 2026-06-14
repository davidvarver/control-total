import { NextResponse } from "next/server";
import { addAuditLog } from "@/lib/server/audit";
import { requireApiWritablePermission } from "@/lib/server/auth-store";
import { readLocalStore, writeLocalStore } from "@/lib/server/local-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireApiWritablePermission("inventory.write");
  if (auth.response) {
    return auth.response;
  }

  const formData = await request.formData();
  const action = String(formData.get("action") ?? "archive");
  const id = String(formData.get("id") ?? "").trim();
  const channel = String(formData.get("channel") ?? "mercado_libre").trim();
  const marketplaceAccountId = String(formData.get("marketplaceAccountId") ?? "").trim();
  const onlineSku = String(formData.get("onlineSku") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();

  if (!id || !onlineSku) {
    return NextResponse.json(
      { error: "SKU y llave de archivo son requeridos." },
      { status: 400 },
    );
  }

  const store = await readLocalStore();
  store.archivedUnmappedSkus ??= [];

  if (action === "restore") {
    store.archivedUnmappedSkus = store.archivedUnmappedSkus.filter(
      (item) => item.id !== id,
    );
  } else {
    const exists = store.archivedUnmappedSkus.some((item) => item.id === id);
    if (!exists) {
      store.archivedUnmappedSkus.push({
        id,
        channel,
        marketplaceAccountId,
        onlineSku,
        title,
        archivedAt: new Date().toISOString(),
      });
    }
  }

  await writeLocalStore(store);
  await addAuditLog({
    action: action === "restore" ? "sku.unmapped.restore" : "sku.unmapped.archive",
    entityType: "sku_mapping",
    entityId: id,
    organizationId: auth.user.organizationId,
    after: { id, channel, marketplaceAccountId, onlineSku, title },
  });

  return NextResponse.json({ ok: true });
}
