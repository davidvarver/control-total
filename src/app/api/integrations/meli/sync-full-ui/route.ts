import { redirect } from "next/navigation";
import { syncMeliFullStock } from "@/lib/meli/sync";
import { requireWritablePermission } from "@/lib/server/auth-store";
import { addAuditLog } from "@/lib/server/audit";

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
  const redirectUrl = new URL("/meli", request.url);

  if (!accountId) {
    redirectUrl.searchParams.set("error", "Selecciona una cuenta de Mercado Libre para sincronizar Full.");
    redirect(redirectUrl.toString());
  }

  try {
    const result = await syncMeliFullStock({ accountId });
    await addAuditLog({
      action: "meli.full.sync",
      entityType: "integration",
      entityId: accountId,
      organizationId: user.organizationId,
      after: result,
    });
    redirectUrl.searchParams.set("full_synced", String(result.totalFulfillmentUnits));
    redirectUrl.searchParams.set("full_mapped", String(result.mappedUnits));
    redirectUrl.searchParams.set("full_unmapped", String(result.unmappedItems.length));
  } catch (error) {
    redirectUrl.searchParams.set(
      "error",
      error instanceof Error
        ? `No se pudo sincronizar Full: ${error.message}`
        : "No se pudo sincronizar Full.",
    );
  }

  redirect(redirectUrl.toString());
}
