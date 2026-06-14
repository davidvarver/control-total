import { redirect } from "next/navigation";
import { requireWritablePermission } from "@/lib/server/auth-store";
import { addAuditLog } from "@/lib/server/audit";
import { dismissRareChargeAlert } from "@/lib/server/local-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await requireWritablePermission("sales.write");
  const formData = await request.formData();
  const alertId = String(formData.get("alertId") ?? "");
  const orderId = String(formData.get("orderId") ?? "");
  const back = safeBackPath(String(formData.get("back") ?? ""), "/alertas");
  const redirectUrl = new URL(back, request.url);

  try {
    const dismissedId = await dismissRareChargeAlert(alertId);

    await addAuditLog({
      action: "alert.rare_charge.dismiss",
      entityType: "order",
      entityId: orderId || dismissedId,
      organizationId: user.organizationId,
      after: { alertId: dismissedId, orderId },
    });

    redirectUrl.searchParams.set("rare_charge_dismissed", "1");
  } catch (error) {
    redirectUrl.searchParams.set(
      "error",
      error instanceof Error
        ? `No se pudo descartar el cargo raro: ${error.message}`
        : "No se pudo descartar el cargo raro.",
    );
  }

  redirect(redirectUrl.toString());
}

function safeBackPath(value: string, fallback: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  return value;
}
