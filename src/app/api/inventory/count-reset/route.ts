import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { addAuditLog } from "@/lib/server/audit";
import { requireWritablePermission } from "@/lib/server/auth-store";
import { resetInventoryCount } from "@/lib/server/local-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const wantsJson = wantsJsonResponse(request);
  const user = await requireWritablePermission("inventory.write");

  try {
    const formData = await request.formData();
    const masterSku = String(formData.get("masterSku") ?? "");
    const warehouseId = String(formData.get("warehouseId") ?? "");
    const countedPhysicalQuantity = Number(formData.get("countedPhysicalQuantity") ?? 0);
    const note = String(formData.get("note") ?? "");
    const back = String(formData.get("back") ?? "/inventario");

    const result = await resetInventoryCount({
      masterSku,
      warehouseId,
      countedPhysicalQuantity,
      note,
    });

    await addAuditLog({
      action: "inventory.count_reset",
      entityType: "inventory",
      entityId: masterSku,
      organizationId: user.organizationId,
      after: { masterSku, warehouseId, countedPhysicalQuantity, note, result },
    });

    if (wantsJson) {
      return NextResponse.json({ ok: true, result });
    }

    const url = new URL(back || "/inventario", request.url);
    url.searchParams.set("movement", "count_reset");
    redirect(`${url.pathname}${url.search}${url.hash}`);
  } catch (error) {
    if (wantsJson) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "No se pudo guardar." },
        { status: 400 },
      );
    }

    throw error;
  }
}

function wantsJsonResponse(request: Request) {
  return (
    request.headers.get("accept")?.includes("application/json") ||
    request.headers.get("x-requested-with") === "fetch"
  );
}
