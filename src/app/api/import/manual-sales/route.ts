import { NextResponse } from "next/server";
import { requireApiWritablePermission } from "@/lib/server/auth-store";
import { addAuditLog } from "@/lib/server/audit";
import { importManualSalesWorkbook } from "@/lib/server/import-inventory";
import { createManualSaleOrder } from "@/lib/server/local-store";
import { validateExcelUpload } from "@/lib/server/upload-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const wantsJson = request.headers.get("accept")?.includes("application/json");
  const auth = await requireApiWritablePermission("sales.write");
  if (auth.response) {
    return auth.response;
  }

  const redirectUrl = new URL("/ventas/nueva", request.url);

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new Error("Selecciona un archivo Excel.");
    }

    validateExcelUpload(file);
    const sales = await importManualSalesWorkbook(Buffer.from(await file.arrayBuffer()));

    if (sales.length === 0) {
      throw new Error("No encontre ventas. Usa la plantilla de ventas externas.");
    }

    const created = [];
    for (const sale of sales) {
      created.push(await createManualSaleOrder(sale));
    }

    await addAuditLog({
      action: "import.manual_sales",
      entityType: "import",
      entityId: "manual_sales",
      organizationId: auth.user.organizationId,
      after: {
        parsed: sales.length,
        created: created.length,
        channels: [...new Set(created.map((order) => order.channel))],
      },
    });

    const url = new URL("/ventas", request.url);
    url.searchParams.set("manual_imported", String(created.length));
    if (wantsJson) {
      return NextResponse.json({
        ok: true,
        message: `Ventas externas importadas: ${created.length}.`,
        imported: created.length,
      });
    }
    return NextResponse.redirect(url, { status: 303 });
  } catch (error) {
    if (wantsJson) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? `No se pudieron importar ventas externas: ${error.message}`
              : "No se pudieron importar ventas externas.",
        },
        { status: 400 },
      );
    }
    redirectUrl.searchParams.set(
      "error",
      error instanceof Error
        ? `No se pudieron importar ventas externas: ${error.message}`
        : "No se pudieron importar ventas externas.",
    );
    return NextResponse.redirect(redirectUrl, { status: 303 });
  }
}
