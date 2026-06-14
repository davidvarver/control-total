import { redirect } from "next/navigation";
import { addAuditLog } from "@/lib/server/audit";
import { requireWritablePermission } from "@/lib/server/auth-store";
import { dismissFullAuditAlert } from "@/lib/server/local-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await requireWritablePermission("inventory.write");
  const formData = await request.formData();
  const alertId = String(formData.get("alertId") ?? "");
  const masterSku = String(formData.get("masterSku") ?? "");
  const back = safeBackPath(String(formData.get("back") ?? ""), "/alertas");
  const redirectUrl = new URL(back, request.url);

  try {
    const dismissedId = await dismissFullAuditAlert(alertId);

    await addAuditLog({
      action: "alert.full_audit.dismiss",
      entityType: "inventory",
      entityId: masterSku || dismissedId,
      organizationId: user.organizationId,
      after: { alertId: dismissedId, masterSku },
    });

    redirectUrl.searchParams.set("full_audit_dismissed", "1");
  } catch (error) {
    redirectUrl.searchParams.set(
      "error",
      error instanceof Error
        ? `No se pudo descartar la alerta Full: ${error.message}`
        : "No se pudo descartar la alerta Full.",
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
