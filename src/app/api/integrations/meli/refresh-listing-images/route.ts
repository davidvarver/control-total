import { redirect } from "next/navigation";
import { refreshMeliListingImages } from "@/lib/meli/sync";
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
  const back = safeBackPath(String(formData.get("back") ?? ""), "/meli#cuentas");
  const redirectUrl = new URL(back, request.url);

  if (!accountId) {
    redirectUrl.searchParams.set(
      "error",
      "Selecciona una cuenta de Mercado Libre para actualizar fotos.",
    );
    redirect(redirectUrl.toString());
  }

  try {
    const result = await refreshMeliListingImages({ accountId });

    await addAuditLog({
      action: "meli.listing_images.refresh",
      entityType: "integration",
      entityId: accountId,
      organizationId: user.organizationId,
      after: result,
    });

    redirectUrl.searchParams.set("listing_images_scanned", String(result.scannedItems));
    redirectUrl.searchParams.set(
      "listing_images_updated",
      String(result.updatedOnlineSkus),
    );
  } catch (error) {
    redirectUrl.searchParams.set(
      "error",
      error instanceof Error
        ? `No se pudieron actualizar fotos: ${error.message}`
        : "No se pudieron actualizar fotos.",
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
