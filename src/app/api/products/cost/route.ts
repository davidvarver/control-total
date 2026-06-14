import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { requireWritablePermission } from "@/lib/server/auth-store";
import { addAuditLog } from "@/lib/server/audit";
import { updateProductCost } from "@/lib/server/local-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const wantsJson =
    request.headers.get("accept")?.includes("application/json") ||
    request.headers.get("x-requested-with") === "fetch";
  const user = await requireWritablePermission("costs.write");
  const formData = await request.formData();
  const masterSku = String(formData.get("masterSku") ?? "");
  const averageUnitCost = parseFormNumber(formData.get("averageUnitCost"));

  const product = await updateProductCost({ masterSku, averageUnitCost });
  await addAuditLog({
    action: "product.cost.update",
    entityType: "product",
    entityId: masterSku,
    organizationId: user.organizationId,
    after: { masterSku: product.masterSku, averageUnitCost: product.averageUnitCost },
  });

  if (wantsJson) {
    return NextResponse.json({
      ok: true,
      masterSku: product.masterSku,
      averageUnitCost: product.averageUnitCost ?? 0,
    });
  }

  redirect("/inventario?cost_updated=1");
}

function parseFormNumber(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "0").trim().replace(",", ".");
  return Number(normalized || 0);
}
