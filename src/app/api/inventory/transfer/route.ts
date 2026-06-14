import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { requireWritablePermission } from "@/lib/server/auth-store";
import { addAuditLog } from "@/lib/server/audit";
import { transferInventory } from "@/lib/server/local-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const wantsJson = wantsJsonResponse(request);
  const user = await requireWritablePermission("inventory.write");
  try {
    const formData = await request.formData();
    const masterSku = String(formData.get("masterSku") ?? "");
    const fromWarehouseId = String(formData.get("fromWarehouseId") ?? "");
    const toWarehouseId = String(formData.get("toWarehouseId") ?? "");
    const quantity = Number(formData.get("quantity") ?? 0);
    const note = String(formData.get("note") ?? "");

    const transfer = await transferInventory({
      masterSku,
      fromWarehouseId,
      toWarehouseId,
      quantity,
      note,
    });
    await addAuditLog({
      action: "inventory.transfer",
      entityType: "inventory",
      entityId: masterSku,
      organizationId: user.organizationId,
      after: { masterSku, fromWarehouseId, toWarehouseId, quantity, note },
    });

    if (wantsJson) {
      return NextResponse.json({ ok: true, transfer });
    }

    redirect("/inventario?movement=transfer");
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
