import { redirect } from "next/navigation";
import { repairMeliAuditOrders } from "@/lib/meli/sync";
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
    safeBackPath(
      String(formData.get("back") ?? "") || url.searchParams.get("back"),
      "/auditoria",
    ),
    request.url,
  );
  const selectedOrderIds = formData
    .getAll("orderId")
    .map((value) => String(value).trim())
    .filter(Boolean);
  const queryOrderId = url.searchParams.get("orderId")?.trim();
  const orderIds = selectedOrderIds.length
    ? selectedOrderIds
    : queryOrderId
      ? [queryOrderId]
      : [];
  const isTargetedRepair = orderIds.length > 0;
  const defaultLimit = isTargetedRepair ? orderIds.length : 10;
  const requestedLimit = Number(
    formData.get("limit") ?? url.searchParams.get("limit") ?? defaultLimit,
  );
  const limit = Math.min(
    Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : defaultLimit),
    25,
  );

  try {
    const result = await repairMeliAuditOrders({
      orderIds: isTargetedRepair ? orderIds : undefined,
      limit,
    });

    await addAuditLog({
      action: "meli.audit.repair",
      entityType: "integration",
      entityId: isTargetedRepair ? orderIds.join(",") : "audit-sales",
      organizationId: user.organizationId,
      after: result,
    });

    redirectUrl.searchParams.set("repair_checked", String(result.checked));
    redirectUrl.searchParams.set("repair_repaired", String(result.repaired));
    redirectUrl.searchParams.set("repair_failed", String(result.failed));
    if (result.afterIssues !== null) {
      redirectUrl.searchParams.set("repair_after", String(result.afterIssues));
    }
    if (isTargetedRepair) {
      redirectUrl.searchParams.set("repair_order", orderIds.slice(0, limit).join(","));
    }
  } catch (error) {
    redirectUrl.searchParams.set(
      "error",
      error instanceof Error
        ? `No se pudo reparar auditoria: ${error.message}`
        : "No se pudo reparar auditoria.",
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
