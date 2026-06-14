import { redirect } from "next/navigation";
import { retryPendingMeliBilling } from "@/lib/meli/sync";
import { requireWritablePermission } from "@/lib/server/auth-store";
import { addAuditLog } from "@/lib/server/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
  const redirectUrl = new URL(
    safeBackPath(String(formData.get("back") ?? "") || url.searchParams.get("back"), "/ventas"),
    request.url,
  );
  const accountId =
    String(formData.get("accountId") ?? "") || url.searchParams.get("accountId") || undefined;
  const orderId =
    String(formData.get("orderId") ?? "") || url.searchParams.get("orderId") || undefined;
  const limit = Number(formData.get("limit") ?? url.searchParams.get("limit") ?? 100);

  try {
    const result = await retryPendingMeliBilling({
      accountId,
      orderId,
      limit: Number.isFinite(limit) ? limit : 100,
    });
    await addAuditLog({
      action: "meli.billing.retry",
      entityType: "integration",
      entityId: accountId ?? orderId ?? "all",
      organizationId: user.organizationId,
      after: result,
    });

    redirectUrl.searchParams.set("billing_checked", String(result.checked));
    redirectUrl.searchParams.set("billing_updated", String(result.updated));
    redirectUrl.searchParams.set("billing_pending", String(result.pending));
  } catch (error) {
    redirectUrl.searchParams.set(
      "error",
      error instanceof Error
        ? `No se pudo reintentar billing: ${error.message}`
        : "No se pudo reintentar billing.",
    );
  }

  redirect(redirectUrl.toString());
}

function safeBackPath(value: string | null, fallback: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  return value;
}
