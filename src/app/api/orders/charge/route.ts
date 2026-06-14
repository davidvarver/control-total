import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { requireWritablePermission } from "@/lib/server/auth-store";
import { addAuditLog } from "@/lib/server/audit";
import { addMarketplaceOrderCharge } from "@/lib/server/local-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const wantsJson = wantsJsonResponse(request);
  const user = await requireWritablePermission("sales.write");
  try {
    const formData = await request.formData();
    const externalOrderId = String(formData.get("externalOrderId") ?? "");
    const type = String(formData.get("type") ?? "");
    const amount = Number(formData.get("amount") ?? 0);

    await addMarketplaceOrderCharge({
      externalOrderId,
      type,
      amount,
    });
    await addAuditLog({
      action: "order.charge.add",
      entityType: "order",
      entityId: externalOrderId,
      organizationId: user.organizationId,
      after: { externalOrderId, type, amount },
    });

    if (wantsJson) {
      return NextResponse.json({ ok: true, externalOrderId, type, amount });
    }

    redirect(`/ventas/${encodeURIComponent(externalOrderId)}?charge_added=1`);
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
