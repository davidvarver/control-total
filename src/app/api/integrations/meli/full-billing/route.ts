import { redirect } from "next/navigation";
import { syncMeliFullBilling } from "@/lib/meli/full-billing";
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
  const period = normalizeBillingPeriod(
    String(formData.get("period") ?? "") || url.searchParams.get("period"),
  );
  const back = String(formData.get("back") ?? "") || "/meli";
  const redirectUrl = new URL(back.startsWith("/") ? back : "/meli", request.url);

  if (!accountId) {
    redirectUrl.searchParams.set(
      "error",
      "Selecciona una cuenta de Mercado Libre para traer cargos Full.",
    );
    redirect(redirectUrl.toString());
  }

  if (!period) {
    redirectUrl.searchParams.set(
      "error",
      "Selecciona el mes de facturacion Full.",
    );
    redirect(redirectUrl.toString());
  }

  try {
    const result = await syncMeliFullBilling({ accountId, period });
    await addAuditLog({
      action: "meli.full.billing.sync",
      entityType: "integration",
      entityId: accountId,
      organizationId: user.organizationId,
      after: {
        period: result.period,
        fetchedRows: result.fetchedRows,
        charges: result.charges.length,
        totalAmount: result.totalAmount,
        totalUnits: result.totalUnits,
      },
    });
    redirectUrl.searchParams.set("full_billing_synced", String(result.charges.length));
    redirectUrl.searchParams.set("full_billing_total", result.totalAmount.toFixed(2));
    redirectUrl.searchParams.set("full_billing_period", result.period);
  } catch (error) {
    redirectUrl.searchParams.set(
      "error",
      error instanceof Error
        ? `No se pudieron traer cargos Full: ${error.message}`
        : "No se pudieron traer cargos Full.",
    );
  }

  redirect(redirectUrl.toString());
}

function normalizeBillingPeriod(period: string | null) {
  if (!period) {
    return null;
  }

  if (/^\d{4}-\d{2}$/.test(period)) {
    return `${period}-01`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) {
    return period;
  }

  return null;
}
