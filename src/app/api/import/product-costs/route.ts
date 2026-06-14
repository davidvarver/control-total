import { NextResponse } from "next/server";
import { requireApiWritablePermission } from "@/lib/server/auth-store";
import { importProductCostsWorkbook } from "@/lib/server/import-inventory";
import { bulkUpdateProductCosts } from "@/lib/server/local-store";
import { addAuditLog } from "@/lib/server/audit";
import { validateExcelUpload } from "@/lib/server/upload-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const wantsJson = request.headers.get("accept")?.includes("application/json");
  try {
    const auth = await requireApiWritablePermission("costs.write");
    if (auth.response) {
      return auth.response;
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    validateExcelUpload(file);
    const costs = await importProductCostsWorkbook(
      Buffer.from(await file.arrayBuffer()),
    );

    if (costs.length === 0) {
      if (wantsJson) {
        return NextResponse.json(
          {
            error:
              "No encontre costos. Usa columnas SKU MAESTRO y COSTO o COSTO PROMEDIO.",
          },
          { status: 400 },
        );
      }
      const url = new URL("/inventario", request.url);
      url.searchParams.set(
        "error",
        "No encontre costos. Usa columnas SKU MAESTRO y COSTO o COSTO PROMEDIO.",
      );
      return NextResponse.redirect(url, { status: 303 });
    }

    const result = await bulkUpdateProductCosts(costs);
    await addAuditLog({
      action: "import.product_costs",
      entityType: "import",
      entityId: "product_costs",
      organizationId: auth.user.organizationId,
      after: {
        parsed: costs.length,
        updated: result.updated.length,
        ignored: result.ignored.length,
        ignoredSkus: result.ignored.slice(0, 25).map((cost) => cost.masterSku),
      },
    });

    const url = new URL("/inventario", request.url);
    url.searchParams.set("costs_imported", String(result.updated.length));
    if (result.ignored.length > 0) {
      url.searchParams.set("costs_ignored", String(result.ignored.length));
      url.searchParams.set(
        "costs_ignored_examples",
        result.ignored
          .slice(0, 8)
          .map((cost) => cost.masterSku)
          .join(", "),
      );
    }
    if (wantsJson) {
      return NextResponse.json({
        ok: true,
        message: `Costos importados: ${result.updated.length}. Sin ligar: ${result.ignored.length}.`,
        imported: result.updated.length,
        ignored: result.ignored.length,
      });
    }
    return NextResponse.redirect(url, { status: 303 });
  } catch (error) {
    if (wantsJson) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? `No se pudieron importar costos: ${error.message}`
              : "No se pudieron importar costos.",
        },
        { status: 400 },
      );
    }
    const url = new URL("/setup", request.url);
    url.searchParams.set(
      "error",
      error instanceof Error
        ? `No se pudieron importar costos: ${error.message}`
        : "No se pudieron importar costos.",
    );
    return NextResponse.redirect(url, { status: 303 });
  }
}
