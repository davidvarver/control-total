import { NextResponse } from "next/server";
import { addAuditLog } from "@/lib/server/audit";
import { requireApiWritablePermission } from "@/lib/server/auth-store";
import { restoreProduct } from "@/lib/server/local-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireApiWritablePermission("inventory.write");
  if (auth.response) {
    return auth.response;
  }

  try {
    const formData = await request.formData();
    const masterSku = String(formData.get("masterSku") ?? "");
    const product = await restoreProduct({ masterSku });

    await addAuditLog({
      action: "product.restore",
      entityType: "product",
      entityId: product.masterSku,
      organizationId: auth.user.organizationId,
      after: product,
    });

    return NextResponse.json({ ok: true, product });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "No se pudo desarchivar el SKU.",
      },
      { status: 400 },
    );
  }
}
