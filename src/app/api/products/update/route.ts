import { NextResponse } from "next/server";
import { addAuditLog } from "@/lib/server/audit";
import { requireApiWritablePermission } from "@/lib/server/auth-store";
import { updateProduct } from "@/lib/server/local-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireApiWritablePermission("inventory.write");
  if (auth.response) {
    return auth.response;
  }

  try {
    const formData = await request.formData();
    const currentMasterSku = String(formData.get("currentMasterSku") ?? "");
    const product = await updateProduct({
      currentMasterSku,
      masterSku: String(formData.get("masterSku") ?? ""),
      name: String(formData.get("name") ?? ""),
      averageUnitCost: parseFormNumber(formData.get("averageUnitCost")),
    });

    await addAuditLog({
      action: "product.update",
      entityType: "product",
      entityId: product.masterSku,
      organizationId: auth.user.organizationId,
      before: { masterSku: currentMasterSku },
      after: product,
    });

    return NextResponse.json({ ok: true, product });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "No se pudo actualizar el SKU.",
      },
      { status: 400 },
    );
  }
}

function parseFormNumber(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "0").trim().replace(",", ".");
  return Number(normalized || 0);
}
