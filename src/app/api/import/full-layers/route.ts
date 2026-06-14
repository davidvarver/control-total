import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { requireApiWritablePermission } from "@/lib/server/auth-store";
import {
  addFullInventoryLayer,
  addFullShipment,
} from "@/lib/server/local-store";
import { addAuditLog } from "@/lib/server/audit";
import { validateExcelUpload } from "@/lib/server/upload-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
    const workbook = new ExcelJS.Workbook();
    const arrayBuffer = await file.arrayBuffer();
    await workbook.xlsx.load(arrayBuffer);
    const worksheet =
      workbook.getWorksheet("FULL_FIFO") ?? workbook.worksheets[0] ?? null;
    const rows = worksheet ? readFullLayerRows(worksheet) : [];

    if (rows.length === 0) {
      if (wantsJson) {
        return NextResponse.json(
          {
            error:
              "No encontre envios Full. Usa la plantilla Full FIFO con SKU Maestro, Piezas, Volumen total y Costo envio del embarque.",
          },
          { status: 400 },
        );
      }
      const url = new URL("/inventario", request.url);
      url.searchParams.set(
        "error",
        "No encontre envios Full. Usa la plantilla Full FIFO con SKU Maestro, Piezas, Volumen total y Costo envio del embarque.",
      );
      return NextResponse.redirect(url, { status: 303 });
    }

    const imported = await importFullRows(rows);
    await addAuditLog({
      action: "import.full_layers",
      entityType: "import",
      entityId: "full_layers",
      organizationId: auth.user.organizationId,
      after: { layers: imported },
    });

    const url = new URL("/inventario", request.url);
    url.searchParams.set("full_layers_imported", String(imported));
    if (wantsJson) {
      return NextResponse.json({
        ok: true,
        message: `Capas Full importadas: ${imported}.`,
        imported,
      });
    }
    return NextResponse.redirect(url, { status: 303 });
  } catch (error) {
    if (wantsJson) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? `No se pudieron importar capas Full: ${error.message}`
              : "No se pudieron importar capas Full.",
        },
        { status: 400 },
      );
    }
    const url = new URL("/inventario", request.url);
    url.searchParams.set(
      "error",
      error instanceof Error
        ? `No se pudieron importar capas Full: ${error.message}`
        : "No se pudieron importar capas Full.",
    );
    return NextResponse.redirect(url, { status: 303 });
  }
}

type FullImportRow = Parameters<typeof addFullInventoryLayer>[0] & {
  totalVolumeM3: number;
  shipmentFreightCostTotal: number;
};

async function importFullRows(rows: FullImportRow[]) {
  let imported = 0;

  const grouped = new Map<string, FullImportRow[]>();
  for (const row of rows) {
    const key = [
      row.dateReceived ?? "",
      row.note ?? "",
      row.storageCostPerUnitPerDay,
    ].join("|");
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }

  for (const group of grouped.values()) {
    const [first] = group;
    const shipmentFreightCostTotal = group.find(
      (row) => row.shipmentFreightCostTotal > 0,
    )?.shipmentFreightCostTotal;

    if (shipmentFreightCostTotal) {
      const layers = await addFullShipment({
        rows: group.map((row) => ({
          masterSku: row.masterSku,
          quantity: row.quantity,
          totalVolumeM3: row.totalVolumeM3,
        })),
        shipmentFreightCostTotal,
        storageCostPerUnitPerDay: first.storageCostPerUnitPerDay,
        dateReceived: first.dateReceived,
        note: first.note,
      });
      imported += layers.length;
      continue;
    }

    for (const row of group) {
      await addFullInventoryLayer(row);
      imported += 1;
    }
  }

  return imported;
}

function readFullLayerRows(worksheet: ExcelJS.Worksheet) {
  const headerRow = worksheet.getRow(1);
  const headers = new Map<string, number>();
  headerRow.eachCell((cell, columnNumber) => {
    headers.set(normalizeHeader(String(cell.value ?? "")), columnNumber);
  });

  const rows: FullImportRow[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }

    const masterSku = getCellText(row, headers, "sku maestro");
    const quantity = getCellNumber(row, headers, "piezas");
    if (!masterSku || quantity <= 0) {
      return;
    }

    const totalVolumeM3 = getTotalVolumeM3(row, headers);
    rows.push({
      masterSku,
      quantity,
      totalVolumeM3,
      unitVolumeM3:
        totalVolumeM3 > 0
          ? totalVolumeM3 / quantity
          : getCellNumber(row, headers, "m3 por pieza"),
      inboundFreightCostTotal: getCellNumber(row, headers, "costo envio total"),
      shipmentFreightCostTotal: getCellNumber(
        row,
        headers,
        "costo envio del embarque",
      ),
      storageCostPerUnitPerDay: getCellNumber(
        row,
        headers,
        "almacenaje por pieza por dia",
      ),
      dateReceived: getCellText(row, headers, "fecha recibido"),
      note:
        getCellText(row, headers, "folio nota full") ||
        getCellText(row, headers, "folio/nota full") ||
        getCellText(row, headers, "nota"),
    });
  });

  return rows;
}

function getTotalVolumeM3(row: ExcelJS.Row, headers: Map<string, number>) {
  const totalVolume = getCellNumber(row, headers, "volumen total");
  const unit = getCellText(row, headers, "unidad volumen").toLowerCase();

  if (totalVolume > 0) {
    return unit === "m3" ? totalVolume : totalVolume / 1_000_000;
  }

  return 0;
}

function getCellText(row: ExcelJS.Row, headers: Map<string, number>, label: string) {
  const column = headers.get(label);
  if (!column) {
    return "";
  }

  const value = row.getCell(column).value;
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value ?? "").trim();
}

function getCellNumber(row: ExcelJS.Row, headers: Map<string, number>, label: string) {
  const text = getCellText(row, headers, label).replace(/[$,\s]/g, "");
  const number = Number(text);
  return Number.isFinite(number) ? number : 0;
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
