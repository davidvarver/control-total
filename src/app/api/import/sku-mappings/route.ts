import { NextResponse } from "next/server";
import { importSkuMappingWorkbook } from "@/lib/server/import-inventory";
import { replaceSkuMappings } from "@/lib/server/local-store";
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
    const mappings = await importSkuMappingWorkbook(buffer);

    if (mappings.length === 0) {
      if (wantsJson) {
        return NextResponse.json(
          {
            error:
              "No encontre equivalencias. El Excel debe tener hoja CATALOGO con columnas SKU ONLINE, SKU MAESTRO y MULTIPLICADOR.",
          },
          { status: 400 },
        );
      }
      const url = new URL("/setup", request.url);
      url.searchParams.set(
        "error",
        "No encontre equivalencias. El Excel debe tener hoja CATALOGO con columnas SKU ONLINE, SKU MAESTRO y MULTIPLICADOR.",
      );
      return NextResponse.redirect(url, { status: 303 });
    }

    await replaceSkuMappings(mappings);
    await addAuditLog({
      action: "import.sku_mappings",
      entityType: "import",
      entityId: "sku_mappings",
      organizationId: auth.user.organizationId,
      after: { mappings: mappings.length },
    });

    const url = new URL("/setup", request.url);
    url.searchParams.set("sku_mappings", String(mappings.length));
    if (wantsJson) {
      return NextResponse.json({
        ok: true,
        message: `Equivalencias importadas: ${mappings.length}.`,
        imported: mappings.length,
      });
    }
    return NextResponse.redirect(url, { status: 303 });
  } catch (error) {
    if (wantsJson) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? `No se pudieron importar equivalencias: ${error.message}`
              : "No se pudieron importar equivalencias.",
        },
        { status: 400 },
      );
    }
    const url = new URL("/setup", request.url);
    url.searchParams.set(
      "error",
      error instanceof Error
        ? `No se pudieron importar equivalencias: ${error.message}`
        : "No se pudieron importar equivalencias.",
    );
    return NextResponse.redirect(url, { status: 303 });
  }
}
