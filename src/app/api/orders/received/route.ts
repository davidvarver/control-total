import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { requireWritablePermission } from "@/lib/server/auth-store";
import { addAuditLog } from "@/lib/server/audit";
import { updateMarketplaceOrderReceived } from "@/lib/server/local-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const wantsJson = wantsJsonResponse(request);
  const user = await requireWritablePermission("sales.write");
  try {
    const formData = await request.formData();
    const externalOrderId = String(formData.get("externalOrderId") ?? "");
    const netReceivedAmount = Number(formData.get("netReceivedAmount") ?? 0);

    if (!Number.isFinite(netReceivedAmount)) {
      if (wantsJson) {
        return NextResponse.json({ error: "Monto invalido" }, { status: 400 });
      }
      redirect(`/ventas/${encodeURIComponent(externalOrderId)}`);
    }

    await updateMarketplaceOrderReceived({
      externalOrderId,
      netReceivedAmount,
    });
    await addAuditLog({
      action: "order.received.update",
      entityType: "order",
      entityId: externalOrderId,
      organizationId: user.organizationId,
      after: { externalOrderId, netReceivedAmount },
    });

    if (wantsJson) {
      return NextResponse.json({ ok: true, externalOrderId, netReceivedAmount });
    }

    redirect(`/ventas/${encodeURIComponent(externalOrderId)}?received_updated=1`);
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
