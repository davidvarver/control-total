import { redirect } from "next/navigation";
import { auditMeliFullStock } from "@/lib/meli/sync";
import { addAuditLog } from "@/lib/server/audit";
import { requireWritablePermission } from "@/lib/server/auth-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return new Response("Method Not Allowed", {
    status: 405,
    headers: { Allow: "POST" },
  });
}

export async function POST(request: Request) {
  const user = await requireWritablePermission("integrations.write");
  const url = new URL(request.url);
  const formData = await request.formData();
  const accountId =
    String(formData.get("accountId") ?? "") || url.searchParams.get("accountId");
  const back = safeBackPath(String(formData.get("back") ?? ""), "/alertas");
  const redirectUrl = new URL(back, request.url);

  if (!accountId) {
    redirectUrl.searchParams.set("error", "Selecciona una cuenta de Mercado Libre para auditar Full.");
    redirect(redirectUrl.toString());
  }

  try {
    const result = await auditMeliFullStock({ accountId });

    await addAuditLog({
      action: "meli.full.audit",
      entityType: "integration",
      entityId: accountId,
      organizationId: user.organizationId,
      after: result,
    });

    redirectUrl.searchParams.set("full_audited", String(result.totalFulfillmentUnits));
    redirectUrl.searchParams.set("full_audit_unmapped", String(result.unmappedItems.length));
  } catch (error) {
    redirectUrl.searchParams.set(
      "error",
      error instanceof Error
        ? `No se pudo auditar Full: ${error.message}`
        : "No se pudo auditar Full.",
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
