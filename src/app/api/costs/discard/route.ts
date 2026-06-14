import { NextResponse } from "next/server";
import { addAuditLog } from "@/lib/server/audit";
import { requireApiWritablePermission } from "@/lib/server/auth-store";
import { ignoreCostSku } from "@/lib/server/local-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const wantsJson = wantsJsonResponse(request);
  try {
    const auth = await requireApiWritablePermission("costs.write");
    if (auth.response) {
      return auth.response;
    }

    const formData = await request.formData();
    const costSku = String(formData.get("costSku") ?? "").trim();
    const redirectTo = String(formData.get("redirectTo") ?? "/setup");

    if (!costSku) {
      return NextResponse.json(
        { error: "costSku es requerido" },
        { status: 400 },
      );
    }

    const ignored = await ignoreCostSku(costSku);
    await addAuditLog({
      action: "cost_sku.discard",
      entityType: "product_cost",
      entityId: ignored,
      organizationId: auth.user.organizationId,
      after: { costSku: ignored },
    });

    if (wantsJson) {
      return NextResponse.json({ ok: true, costSku: ignored });
    }

    const url = new URL(redirectTo, request.url);
    url.searchParams.set("cost_discarded", ignored);
    return NextResponse.redirect(url, { status: 303 });
  } catch (error) {
    if (wantsJson) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? `No se pudo descartar el costo: ${error.message}`
              : "No se pudo descartar el costo.",
        },
        { status: 400 },
      );
    }

    const url = new URL("/setup", request.url);
    url.searchParams.set(
      "error",
      error instanceof Error
        ? `No se pudo descartar el costo: ${error.message}`
        : "No se pudo descartar el costo.",
    );
    return NextResponse.redirect(url, { status: 303 });
  }
}

function wantsJsonResponse(request: Request) {
  return (
    request.headers.get("accept")?.includes("application/json") ||
    request.headers.get("x-requested-with") === "fetch"
  );
}
