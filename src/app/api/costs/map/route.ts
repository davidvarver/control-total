import { NextResponse } from "next/server";
import { addAuditLog } from "@/lib/server/audit";
import { requireApiWritablePermission } from "@/lib/server/auth-store";
import { mapCostSkuToProducts } from "@/lib/server/local-store";

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
    const masterSkus = String(formData.get("masterSkus") ?? "")
      .split(/[\n,]+/)
      .map((masterSku) => masterSku.trim())
      .filter(Boolean);
    const averageUnitCost = Number(formData.get("averageUnitCost") ?? 0);
    const redirectTo = String(formData.get("redirectTo") ?? "/setup");

    if (!costSku || masterSkus.length === 0 || !Number.isFinite(averageUnitCost)) {
      return NextResponse.json(
        { error: "costSku, masterSkus y averageUnitCost son requeridos" },
        { status: 400 },
      );
    }

    const products = await mapCostSkuToProducts({
      costSku,
      masterSkus,
      averageUnitCost,
    });

    await addAuditLog({
      action: "cost_sku.map",
      entityType: "product_cost",
      entityId: costSku,
      organizationId: auth.user.organizationId,
      after: {
        costSku,
        masterSkus: products.map((product) => product.masterSku),
        averageUnitCost,
      },
    });

    if (wantsJson) {
      return NextResponse.json({ ok: true, costSku, masterSkus });
    }

    const url = new URL(redirectTo, request.url);
    url.searchParams.set("cost_mapped", costSku);
    return NextResponse.redirect(url, { status: 303 });
  } catch (error) {
    if (wantsJson) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? `No se pudo ligar el costo: ${error.message}`
              : "No se pudo ligar el costo.",
        },
        { status: 400 },
      );
    }

    const url = new URL("/setup", request.url);
    url.searchParams.set(
      "error",
      error instanceof Error
        ? `No se pudo ligar el costo: ${error.message}`
        : "No se pudo ligar el costo.",
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
