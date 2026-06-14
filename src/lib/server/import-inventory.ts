import ExcelJS from "exceljs";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";
import { createEmptyStore } from "./empty-store";
import type { LocalMarketplaceOrder, LocalStore, ManualSaleLineInput } from "./local-store";

function normalizeSku(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function numberOrZero(value: unknown) {
  const normalized =
    typeof value === "string" ? value.replace(/[$,\s]/g, "") : value;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function cellValue(cell: ExcelJS.Cell) {
  const value = cell.value;
  if (value && typeof value === "object") {
    if ("result" in value) {
      return value.result;
    }
    if ("text" in value) {
      return value.text;
    }
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("");
    }
  }

  return value;
}

function readRows(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  requiredHeaders: string[] = [],
) {
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet || sheet.rowCount === 0) {
    return [] as Record<string, unknown>[];
  }

  const headerRowNumber = findHeaderRowNumber(sheet, requiredHeaders);
  const headerRow = sheet.getRow(headerRowNumber);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = normalizeSku(cellValue(cell));
  });

  const rows: Record<string, unknown>[] = [];
  for (let rowNumber = headerRowNumber + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const record: Record<string, unknown> = {};
    let hasValue = false;

    for (let colNumber = 1; colNumber < headers.length; colNumber += 1) {
      const header = headers[colNumber];
      if (!header) {
        continue;
      }

      const value = cellValue(row.getCell(colNumber));
      if (value !== null && value !== undefined && value !== "") {
        hasValue = true;
      }
      record[header] = value ?? null;
    }

    if (hasValue) {
      rows.push(record);
    }
  }

  return rows;
}

function findHeaderRowNumber(sheet: ExcelJS.Worksheet, requiredHeaders: string[]) {
  if (requiredHeaders.length === 0) {
    return 1;
  }

  const maxHeaderScanRows = Math.min(sheet.rowCount, 12);
  for (let rowNumber = 1; rowNumber <= maxHeaderScanRows; rowNumber += 1) {
    const headers: string[] = [];
    sheet.getRow(rowNumber).eachCell({ includeEmpty: true }, (cell) => {
      headers.push(normalizeSku(cellValue(cell)));
    });

    const headerSet = new Set(headers.map(normalizeHeader));
    if (requiredHeaders.every((header) => headerSet.has(normalizeHeader(header)))) {
      return rowNumber;
    }
  }

  return 1;
}

function readRowsFromSheetWithHeaders(
  workbook: ExcelJS.Workbook,
  preferredSheetName: string,
  requiredHeaders: string[],
) {
  const preferredRows = readRows(workbook, preferredSheetName, requiredHeaders);
  if (preferredRows.length > 0 && hasHeaders(preferredRows[0], requiredHeaders)) {
    return preferredRows;
  }

  for (const sheet of workbook.worksheets) {
    const rows = readRows(workbook, sheet.name, requiredHeaders);
    if (rows.length > 0 && hasHeaders(rows[0], requiredHeaders)) {
      return rows;
    }
  }

  return preferredRows;
}

function hasHeaders(row: Record<string, unknown>, requiredHeaders: string[]) {
  const headers = new Set(Object.keys(row).map(normalizeHeader));
  return requiredHeaders.every((header) => headers.has(normalizeHeader(header)));
}

function rowValue(row: Record<string, unknown>, aliases: string[]) {
  const normalizedAliases = new Set(aliases.map(normalizeHeader));
  const match = Object.entries(row).find(([header]) =>
    normalizedAliases.has(normalizeHeader(header)),
  );

  return match?.[1] ?? null;
}

function sumBy(
  rows: Record<string, unknown>[],
  keySelector: (row: Record<string, unknown>) => string,
  valueSelector: (row: Record<string, unknown>) => number,
) {
  const totals = new Map<string, number>();

  for (const row of rows) {
    const key = keySelector(row);
    if (!key) {
      continue;
    }

    totals.set(key, (totals.get(key) ?? 0) + valueSelector(row));
  }

  return totals;
}

async function loadWorkbook(input: Buffer | string) {
  const workbook = new ExcelJS.Workbook();

  const buffer =
    typeof input === "string" ? await readFile(input) : Buffer.from(input);

  try {
    await workbook.xlsx.load(toArrayBuffer(buffer));
  } catch (error) {
    const repairedBuffer = await repairOfficeOpenXmlBuffer(buffer);
    try {
      await workbook.xlsx.load(toArrayBuffer(repairedBuffer));
    } catch {
      throw error;
    }
  }

  return workbook;
}

function toArrayBuffer(buffer: Buffer) {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

async function repairOfficeOpenXmlBuffer(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);

  for (const name of Object.keys(zip.files)) {
    if (!name.endsWith(".xml") && !name.endsWith(".rels")) {
      continue;
    }

    const file = zip.file(name);
    if (!file) {
      continue;
    }

    const original = await file.async("string");
    let fixed = original.replace(/^\uFEFF/, "");
    fixed = fixed.replace(/<\/?x:/g, (match) => match.replace("x:", ""));
    fixed = fixed.replace(/\sxmlns:x=/g, " xmlns=");
    fixed = fixed.replace(/<tableParts[\s\S]*?<\/tableParts>/g, "");

    if (name === "_rels/.rels") {
      fixed = fixed.replace(
        /Target="\/xl\/workbook.xml"/g,
        'Target="xl/workbook.xml"',
      );
    }

    if (name === "xl/_rels/workbook.xml.rels") {
      fixed = fixed.replace(/Target="\/xl\//g, 'Target="');
    }

    if (name === "[Content_Types].xml") {
      fixed = fixed.replace(
        'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"',
        'ContentType="application/xml"',
      );

      if (!fixed.includes('PartName="/xl/workbook.xml"')) {
        fixed = fixed.replace(
          "</Types>",
          '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml" /></Types>',
        );
      }
    }

    if (fixed !== original) {
      zip.file(name, fixed);
    }
  }

  for (const name of Object.keys(zip.files)) {
    if (name.includes("/tables/")) {
      zip.remove(name);
    }
  }

  return zip.generateAsync({ type: "nodebuffer" });
}

export async function importSkuMappingWorkbook(input: Buffer | string) {
  const workbook = await loadWorkbook(input);
  const catalogRows = readRowsFromSheetWithHeaders(workbook, "CATALOGO", [
    "SKU ONLINE",
    "SKU MAESTRO",
    "MULTIPLICADOR",
  ]);
  const onlineSkus: LocalStore["onlineSkus"] = [];

  for (const row of catalogRows) {
    const onlineSku = normalizeSku(rowValue(row, ["SKU ONLINE"]));
    const masterSku = normalizeSku(rowValue(row, ["SKU MAESTRO", "SKU Maestro"]));
    const multiplier = numberOrZero(rowValue(row, ["MULTIPLICADOR"])) || 1;

    if (!onlineSku || !masterSku) {
      continue;
    }

    onlineSkus.push({
      id: `online_${onlineSku.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
      onlineSku,
      title: onlineSku,
      channel: "manual",
      marketplaceAccount: "manual_import",
      safetyBufferUnits: 0,
      components: [{ masterSku, quantityRequired: multiplier }],
    });
  }

  return onlineSkus;
}

export async function importInventoryQuantitiesWorkbook(input: Buffer | string) {
  const workbook = await loadWorkbook(input);
  const inventoryRows = readRowsFromSheetWithHeaders(workbook, "INVENTARIO", [
    "SKU Maestro",
  ]);
  const catalogRows = readRowsFromSheetWithHeaders(workbook, "CATALOGO", [
    "SKU ONLINE",
    "SKU MAESTRO",
    "MULTIPLICADOR",
  ]);
  const ingresoRows = readRowsFromSheetWithHeaders(workbook, "INGRESOS", [
    "SKU MAESTRO",
    "CANTIDAD",
  ]);
  const salesRows = readRowsFromSheetWithHeaders(workbook, "VENTAS_HISTORIAL", [
    "SKU",
    "CANTIDAD",
  ]);
  const catalogByOnlineSku = new Map<string, { masterSku: string; multiplier: number }>();

  for (const row of catalogRows) {
    const onlineSku = normalizeSku(rowValue(row, ["SKU ONLINE"]));
    const masterSku = normalizeSku(rowValue(row, ["SKU MAESTRO", "SKU Maestro"]));
    const multiplier = numberOrZero(rowValue(row, ["MULTIPLICADOR"])) || 1;

    if (!onlineSku || !masterSku) {
      continue;
    }

    catalogByOnlineSku.set(onlineSku, { masterSku, multiplier });
  }

  const ingresosByMasterSku = sumBy(
    ingresoRows,
    (row) => normalizeSku(rowValue(row, ["SKU MAESTRO", "SKU Maestro"])),
    (row) => numberOrZero(rowValue(row, ["CANTIDAD", "Cantidad"])),
  );

  const salesByMasterSku = new Map<string, number>();
  const sales: LocalStore["sales"] = [];

  for (const row of salesRows) {
    const onlineSku = normalizeSku(rowValue(row, ["SKU", "SKU ONLINE"]));
    const quantity = numberOrZero(rowValue(row, ["CANTIDAD", "Cantidad"]));
    const platform =
      normalizeSku(rowValue(row, ["PLATAFORMA", "Plataforma"])) || "MANUAL";

    if (!onlineSku || quantity <= 0) {
      continue;
    }

    const catalogEntry = catalogByOnlineSku.get(onlineSku) ?? {
      masterSku: onlineSku,
      multiplier: 1,
    };
    const consumedQuantity = quantity * catalogEntry.multiplier;
    salesByMasterSku.set(
      catalogEntry.masterSku,
      (salesByMasterSku.get(catalogEntry.masterSku) ?? 0) + consumedQuantity,
    );
    sales.push({
      date: normalizeSku(rowValue(row, ["FECHA", "Fecha"])) || null,
      onlineSku,
      masterSku: catalogEntry.masterSku,
      quantity,
      consumedQuantity,
      platform,
    });
  }

  const products: LocalStore["products"] = [];

  for (const row of inventoryRows) {
    const masterSku = normalizeSku(
      rowValue(row, ["SKU Maestro", "SKU MAESTRO", "SKU", "Master SKU"]),
    );
    if (!masterSku) {
      continue;
    }

    const ingresado = ingresosByMasterSku.get(masterSku) ?? 0;
    const vendido = salesByMasterSku.get(masterSku) ?? 0;
    const stockActual = numberOrZero(
      rowValue(row, [
        "Stock Actual",
        "STOCK ACTUAL",
        "Stock",
        "STOCK",
        "Existencia",
        "EXISTENCIA",
        "Cantidad",
        "CANTIDAD",
      ]),
    );
    const hasDirectStock = stockActual !== 0 || (ingresado === 0 && vendido === 0);
    const currentStock = hasDirectStock ? stockActual : ingresado - vendido;

    products.push({
      id: `prod_${masterSku.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
      masterSku,
      name:
        normalizeSku(rowValue(row, ["Descripcion", "Producto", "Nombre"])) ||
        masterSku,
      currentStock,
      totalIngresado: ingresado || currentStock,
      totalVendido: vendido,
      targetInventoryDays: 90,
      averageUnitCost: 0,
    });
  }

  return {
    products,
    sales,
    inventoryBalances: products.map((product) => ({
      masterSku: product.masterSku,
      warehouseId: "wh_main",
      physicalQuantity: product.currentStock,
      reservedQuantity: 0,
      blockedQuantity: 0,
    })),
  };
}

export async function importProductCostsWorkbook(input: Buffer | string) {
  const workbook = await loadWorkbook(input);
  let rows = readRowsFromSheetWithHeaders(workbook, "COSTOS", ["SKU MAESTRO"]);
  if (rows.length === 0) {
    rows = readRowsFromSheetWithHeaders(workbook, "Costo promedio", [
      "SKU / ARTICULO",
    ]);
  }
  const costs: Array<{ masterSku: string; averageUnitCost: number }> = [];

  for (const row of rows) {
    const masterSku = normalizeSku(
      rowValue(row, [
        "SKU MAESTRO",
        "SKU Maestro",
        "sku maestro",
        "SKU / ARTICULO",
        "ARTICULO",
        "SKU",
      ]),
    );
    const averageUnitCost =
      numberOrZero(rowValue(row, ["COSTO PROMEDIO POR PIEZA"])) ||
      numberOrZero(rowValue(row, ["COSTO PROMEDIO"])) ||
      numberOrZero(rowValue(row, ["COSTO PROMEDIO UNITARIO"])) ||
      numberOrZero(rowValue(row, ["COSTO UNITARIO"])) ||
      numberOrZero(rowValue(row, ["COSTO", "Costo"])) ||
      numberOrZero(rowValue(row, ["PRECIO COSTO"])) ||
      numberOrZero(rowValue(row, ["PRECIO DE COSTO"])) ||
      numberOrZero(rowValue(row, ["PRECIO UNITARIO"])) ||
      numberOrZero(rowValue(row, ["UNITARIO"])) ||
      numberOrZero(rowValue(row, ["UNIT COST"]));

    if (!masterSku || averageUnitCost <= 0) {
      continue;
    }

    costs.push({ masterSku, averageUnitCost });
  }

  return costs;
}

export type ImportedManualSale = {
  channel: LocalMarketplaceOrder["channel"];
  externalOrderId?: string;
  orderedAt: string;
  customerName?: string;
  warehouseId: string;
  netReceivedAmount?: number;
  chargeAmount?: number;
  chargeType?: string;
  note?: string;
  lines: ManualSaleLineInput[];
};

export async function importManualSalesWorkbook(input: Buffer | string) {
  const workbook = await loadWorkbook(input);
  const rows = readRowsFromSheetWithHeaders(workbook, "VENTAS_EXTERNAS", [
    "SKU MAESTRO",
    "CANTIDAD",
  ]);
  const groups = new Map<string, ImportedManualSale>();

  rows.forEach((row, index) => {
    const masterSku = normalizeSku(
      rowValue(row, ["SKU MAESTRO", "SKU Maestro", "SKU", "Master SKU"]),
    );
    const quantity = numberOrZero(rowValue(row, ["CANTIDAD", "Cantidad", "Piezas"]));
    const unitPrice =
      numberOrZero(rowValue(row, ["PRECIO UNITARIO", "Precio Unitario"])) ||
      numberOrZero(rowValue(row, ["PRECIO", "Precio", "VENTA", "Venta"]));

    if (!masterSku || quantity <= 0) {
      return;
    }

    const reference = normalizeSku(
      rowValue(row, ["REFERENCIA", "Referencia", "ORDEN", "Orden", "FOLIO", "Folio"]),
    );
    const channel = normalizeManualSaleChannel(
      normalizeSku(rowValue(row, ["CANAL", "Canal", "PLATAFORMA", "Plataforma"])),
    );
    const orderedAt =
      normalizeSku(rowValue(row, ["FECHA", "Fecha", "FECHA VENTA", "Fecha venta"])) ||
      new Date().toISOString();
    const groupKey = reference || `row_${index + 2}`;
    const existing = groups.get(groupKey) ?? {
      channel,
      externalOrderId: reference || undefined,
      orderedAt,
      customerName: normalizeSku(rowValue(row, ["CLIENTE", "Cliente"])) || undefined,
      warehouseId:
        normalizeSku(rowValue(row, ["BODEGA", "Bodega", "WAREHOUSE"])) || "wh_main",
      netReceivedAmount: optionalNumber(rowValue(row, ["RECIBIDO REAL", "Recibido Real", "RECIBIDO"])),
      chargeAmount: optionalNumber(rowValue(row, ["CARGO", "Cargo", "COMISION", "Comision"])),
      chargeType: normalizeSku(rowValue(row, ["TIPO CARGO", "Tipo Cargo"])) || "other",
      note: normalizeSku(rowValue(row, ["NOTA", "Nota"])) || undefined,
      lines: [],
    };

    existing.lines.push({
      masterSku,
      quantity,
      unitPrice,
    });
    groups.set(groupKey, existing);
  });

  return [...groups.values()];
}

export async function importInventoryWorkbook(input: Buffer | string): Promise<LocalStore> {
  const [inventory, onlineSkus] = await Promise.all([
    importInventoryQuantitiesWorkbook(input),
    importSkuMappingWorkbook(input),
  ]);
  const store = createEmptyStore();

  return {
    ...store,
    importedAt: new Date().toISOString(),
    products: inventory.products,
    onlineSkus,
    sales: inventory.sales,
    inventoryBalances: inventory.inventoryBalances,
  };
}

function optionalNumber(value: unknown) {
  const parsed = numberOrZero(value);
  return parsed > 0 ? parsed : undefined;
}

function normalizeManualSaleChannel(value: string): LocalMarketplaceOrder["channel"] {
  const normalized = normalizeHeader(value);

  if (normalized.includes("tiktok")) {
    return "tiktok";
  }
  if (normalized.includes("whatsapp") || normalized === "wa") {
    return "whatsapp";
  }
  if (normalized.includes("extern") || normalized.includes("otro")) {
    return "external";
  }

  return "manual";
}
