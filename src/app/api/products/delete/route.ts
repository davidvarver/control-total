import { NextResponse } from "next/server";
import { addAuditLog } from "@/lib/server/audit";
import { requireApiWritablePermission } from "@/lib/server/auth-store";
import { deleteProduct } from "@/lib/server/local-store";

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
    const result = await deleteProduct({ masterSku });

    await addAuditLog({
      action: result.mode === "archived" ? "product.archive" : "product.delete",
      entityType: "product",
      entityId: result.product.masterSku,
      organizationId: auth.user.organizationId,
      before: result.product,
      after: { mode: result.mode },
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "No se pudo eliminar el SKU.",
      },
      { status: 400 },
    );
  }
}
