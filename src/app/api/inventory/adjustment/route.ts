import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { requireWritablePermission } from "@/lib/server/auth-store";
import { addAuditLog } from "@/lib/server/audit";
import { addInventoryAdjustment } from "@/lib/server/local-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const wantsJson = wantsJsonResponse(request);
  const user = await requireWritablePermission("inventory.write");
  try {
    const formData = await request.formData();
    const masterSku = String(formData.get("masterSku") ?? "");
    const warehouseId = String(formData.get("warehouseId") ?? "");
    const quantity = Number(formData.get("quantity") ?? 0);
    const note = String(formData.get("note") ?? "");

    const balance = await addInventoryAdjustment({ masterSku, warehouseId, quantity, note });
    await addAuditLog({
      action: "inventory.adjustment",
      entityType: "inventory",
      entityId: masterSku,
      organizationId: user.organizationId,
      after: { masterSku, warehouseId, quantity, note },
    });

    if (wantsJson) {
      return NextResponse.json({ ok: true, balance });
    }

    redirect("/inventario?movement=adjustment");
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
