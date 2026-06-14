import { NextResponse } from "next/server";
import { importInventoryQuantitiesWorkbook } from "@/lib/server/import-inventory";
import { replaceInventoryQuantities } from "@/lib/server/local-store";
import { requireApiWritablePermission } from "@/lib/server/auth-store";
import { addAuditLog } from "@/lib/server/audit";
import { validateExcelUpload } from "@/lib/server/upload-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const wantsJson = request.headers.get("accept")?.includes("application/json");
  try {
    const auth = await requireApiWritablePermission("imports.write");
    if (auth.response) {
      return auth.response;
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    validateExcelUpload(file);
    const buffer = Buffer.from(await file.arrayBuffer());
    const imported = await importInventoryQuantitiesWorkbook(buffer);

    if (imported.products.length === 0) {
      if (wantsJson) {
        return NextResponse.json(
          {
            error:
              "No encontre productos. El Excel debe tener hoja INVENTARIO con columna SKU Maestro.",
          },
          { status: 400 },
        );
      }
      const url = new URL("/setup", request.url);
      url.searchParams.set(
        "error",
        "No encontre productos. El Excel debe tener hoja INVENTARIO con columna SKU Maestro.",
      );
      return NextResponse.redirect(url, { status: 303 });
    }

    await replaceInventoryQuantities(imported);
    await addAuditLog({
      action: "import.inventory",
      entityType: "import",
      entityId: "inventory",
      organizationId: auth.user.organizationId,
      after: {
        products: imported.products.length,
        balances: imported.inventoryBalances.length,
        sales: imported.sales.length,
      },
    });

    const url = new URL("/setup", request.url);
    url.searchParams.set("inventory_products", String(imported.products.length));
    if (wantsJson) {
      return NextResponse.json({
        ok: true,
        message: `Inventario importado: ${imported.products.length} productos.`,
        imported: imported.products.length,
      });
    }
    return NextResponse.redirect(url, { status: 303 });
  } catch (error) {
    if (wantsJson) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? `No se pudo importar inventario: ${error.message}`
              : "No se pudo importar inventario.",
        },
        { status: 400 },
      );
    }
    const url = new URL("/setup", request.url);
    url.searchParams.set(
      "error",
      error instanceof Error
        ? `No se pudo importar inventario: ${error.message}`
        : "No se pudo importar inventario.",
    );
    return NextResponse.redirect(url, { status: 303 });
  }
}
