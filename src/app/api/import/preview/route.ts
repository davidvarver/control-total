import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { requireApiWritablePermission } from "@/lib/server/auth-store";
import {
  importInventoryQuantitiesWorkbook,
  importManualSalesWorkbook,
  importProductCostsWorkbook,
  importSkuMappingWorkbook,
} from "@/lib/server/import-inventory";
import { validateExcelUpload } from "@/lib/server/upload-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const type = String(formData.get("type") ?? "");
    const auth = await requireApiWritablePermission(
      type === "manual-sales" ? "sales.write" : "imports.write",
    );
    if (auth.response) {
      return auth.response;
    }
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Selecciona un archivo Excel." }, { status: 400 });
    }

    validateExcelUpload(file);
    const buffer = Buffer.from(await file.arrayBuffer());

    if (type === "inventario") {
      const imported = await importInventoryQuantitiesWorkbook(buffer);
      if (imported.products.length === 0) {
        throw new Error("No encontre productos validos en la plantilla de inventario.");
      }
      return NextResponse.json({
        count: imported.products.length,
        summary: `Inventario detectado: ${imported.products.length} SKU maestro.`,
        examples: imported.products
          .slice(0, 5)
          .map((product) => `${product.masterSku}: ${product.currentStock} pieza(s)`),
      });
    }

    if (type === "equivalencias") {
      const mappings = await importSkuMappingWorkbook(buffer);
      if (mappings.length === 0) {
        throw new Error("No encontre equivalencias validas.");
      }
      return NextResponse.json({
        count: mappings.length,
        summary: `Equivalencias detectadas: ${mappings.length} SKU online.`,
        examples: mappings
          .slice(0, 5)
          .map((mapping) => `${mapping.onlineSku} -> ${mapping.components[0]?.masterSku ?? "sin SKU maestro"}`),
      });
    }

    if (type === "costos") {
      const costs = await importProductCostsWorkbook(buffer);
      if (costs.length === 0) {
        throw new Error("No encontre costos validos.");
      }
      return NextResponse.json({
        count: costs.length,
        summary: `Costos detectados: ${costs.length} SKU maestro.`,
        examples: costs
          .slice(0, 5)
          .map((cost) => `${cost.masterSku}: $${cost.averageUnitCost}`),
      });
    }

    if (type === "manual-sales") {
      const sales = await importManualSalesWorkbook(buffer);
      if (sales.length === 0) {
        throw new Error("No encontre ventas externas validas.");
      }
      return NextResponse.json({
        count: sales.length,
        summary: `Ventas externas detectadas: ${sales.length} venta(s).`,
        examples: sales
          .slice(0, 5)
          .map((sale) => `${sale.channel}: ${sale.lines.length} renglon(es)`),
      });
    }

    if (type === "full") {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(toArrayBuffer(buffer));
      const sheet = workbook.getWorksheet("FULL_FIFO") ?? workbook.worksheets[0];
      const count = sheet ? Math.max(0, sheet.rowCount - 1) : 0;
      if (count === 0) {
        throw new Error("No encontre renglones Full validos.");
      }
      return NextResponse.json({
        count,
        summary: `Renglones Full detectados: ${count}.`,
        examples: readSheetExamples(sheet),
        warnings: ["Confirma que el costo de envio del embarque este en un solo grupo para repartirlo bien."],
      });
    }

    return NextResponse.json({ error: "Tipo de importacion no soportado." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo previsualizar el archivo.",
      },
      { status: 400 },
    );
  }
}

function toArrayBuffer(buffer: Buffer) {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

function readSheetExamples(sheet: ExcelJS.Worksheet) {
  const examples: string[] = [];
  for (let rowNumber = 2; rowNumber <= Math.min(sheet.rowCount, 6); rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const cells = [1, 2, 3, 4]
      .map((column) => String(row.getCell(column).value ?? "").trim())
      .filter(Boolean);
    if (cells.length > 0) {
      examples.push(cells.join(" | "));
    }
  }
  return examples;
}
