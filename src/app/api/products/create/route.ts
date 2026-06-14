import { NextResponse } from "next/server";
import { addAuditLog } from "@/lib/server/audit";
import { requireApiWritablePermission } from "@/lib/server/auth-store";
import { createProduct } from "@/lib/server/local-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const wantsJson = wantsJsonResponse(request);
  const auth = await requireApiWritablePermission("inventory.write");
  if (auth.response) {
    return auth.response;
  }

  try {
    const formData = await request.formData();
    const product = await createProduct({
      masterSku: String(formData.get("masterSku") ?? ""),
      name: String(formData.get("name") ?? ""),
      initialStock: parseFormNumber(formData.get("initialStock")),
      averageUnitCost: parseFormNumber(formData.get("averageUnitCost")),
      warehouseId: String(formData.get("warehouseId") ?? "wh_main"),
    });

    await addAuditLog({
      action: "product.create",
      entityType: "product",
      entityId: product.masterSku,
      organizationId: auth.user.organizationId,
      after: product,
    });

    if (wantsJson) {
      return NextResponse.json({ ok: true, product }, { status: 201 });
    }

    const url = new URL("/inventario", request.url);
    url.searchParams.set("product_created", product.masterSku);
    return NextResponse.redirect(url, { status: 303 });
  } catch (error) {
    if (wantsJson) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? `No se pudo crear el SKU: ${error.message}`
              : "No se pudo crear el SKU.",
        },
        { status: 400 },
      );
    }

    const url = new URL("/inventario", request.url);
    url.searchParams.set(
      "error",
      error instanceof Error
        ? `No se pudo crear el SKU: ${error.message}`
        : "No se pudo crear el SKU.",
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

function parseFormNumber(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "0").trim().replace(",", ".");
  return Number(normalized || 0);
}
