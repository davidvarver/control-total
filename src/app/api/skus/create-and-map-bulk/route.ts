import { NextResponse } from "next/server";
import { addAuditLog } from "@/lib/server/audit";
import { requireApiWritablePermission } from "@/lib/server/auth-store";
import {
  readLocalStore,
  replaceSkuMappings,
  writeLocalStore,
  type LocalProduct,
  type LocalStore,
} from "@/lib/server/local-store";
import { normalizeSkuKey } from "@/lib/domain/sku-match";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BulkRow = {
  id: string;
  onlineSku: string;
  title: string;
  channel: string;
  marketplaceAccountId: string;
  masterSku: string;
  name: string;
  multiplier: number;
  averageUnitCost: number;
};

function mappingId(onlineSku: string) {
  return `online_${onlineSku.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
}

export async function POST(request: Request) {
  const auth = await requireApiWritablePermission("inventory.write");
  if (auth.response) {
    return auth.response;
  }

  const payload = (await request.json().catch(() => null)) as {
    rows?: unknown[];
  } | null;
  const normalizedRows = Array.isArray(payload?.rows)
    ? payload.rows
        .map(normalizeRow)
        .filter((row: BulkRow | null): row is BulkRow => Boolean(row))
    : [];
  const rows = [
    ...new Map(
      normalizedRows.map((row) => [
        `${row.channel}:${normalizeSkuKey(row.onlineSku)}`,
        row,
      ]),
    ).values(),
  ];

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "Selecciona al menos un SKU con SKU maestro, producto y unidades validas." },
      { status: 400 },
    );
  }

  const store = await readLocalStore();
  const warehouseId = "wh_main";
  const existingBySku = new Map(
    store.products.map((product) => [normalizeSkuKey(product.masterSku), product]),
  );
  let productsCreated = 0;

  for (const row of rows) {
    const key = normalizeSkuKey(row.masterSku);
    const existing = existingBySku.get(key);

    if (existing) {
      existing.isActive = true;
      if (!existing.name || existing.name === existing.masterSku) {
        existing.name = row.name;
      }
      if ((existing.averageUnitCost ?? 0) <= 0 && row.averageUnitCost > 0) {
        existing.averageUnitCost = row.averageUnitCost;
      }
      if (
        !store.inventoryBalances.some(
          (balance) =>
            normalizeSkuKey(balance.masterSku) === normalizeSkuKey(row.masterSku) &&
            balance.warehouseId === warehouseId,
        )
      ) {
        store.inventoryBalances.push({
          masterSku: existing.masterSku,
          warehouseId,
          physicalQuantity: 0,
          reservedQuantity: 0,
          blockedQuantity: 0,
        });
      }
      continue;
    }

    const product: LocalProduct = {
      id: buildUniqueProductId(store, row.masterSku),
      masterSku: row.masterSku,
      name: row.name,
      currentStock: 0,
      totalIngresado: 0,
      totalVendido: 0,
      targetInventoryDays: 90,
      averageUnitCost: row.averageUnitCost,
      isActive: true,
    };

    store.products.push(product);
    store.inventoryBalances.push({
      masterSku: product.masterSku,
      warehouseId,
      physicalQuantity: 0,
      reservedQuantity: 0,
      blockedQuantity: 0,
    });
    existingBySku.set(key, product);
    productsCreated += 1;
  }

  store.importedAt = new Date().toISOString();
  await writeLocalStore(store);

  const latestStore = await readLocalStore();
  const mappedOnlineSkus = new Set(rows.map((row) => normalizeSkuKey(row.onlineSku)));
  const existingOnlineSkuByKey = new Map(
    latestStore.onlineSkus.map((sku) => [normalizeSkuKey(sku.onlineSku), sku]),
  );
  const nextMappings = latestStore.onlineSkus.filter(
    (sku) => !mappedOnlineSkus.has(normalizeSkuKey(sku.onlineSku)),
  );

  for (const row of rows) {
    const existingOnlineSku = existingOnlineSkuByKey.get(normalizeSkuKey(row.onlineSku));
    nextMappings.push({
      id: existingOnlineSku?.id ?? mappingId(row.onlineSku),
      onlineSku: row.onlineSku,
      title: existingOnlineSku?.title?.trim() || row.title || row.name,
      imageUrl: existingOnlineSku?.imageUrl ?? null,
      channel: existingOnlineSku?.channel || row.channel || "mercado_libre",
      marketplaceAccount:
        existingOnlineSku?.marketplaceAccount ||
        row.marketplaceAccountId ||
        "manual_mapping",
      externalListingId: existingOnlineSku?.externalListingId ?? null,
      safetyBufferUnits: existingOnlineSku?.safetyBufferUnits ?? 0,
      components: [
        { masterSku: row.masterSku, quantityRequired: row.multiplier },
      ],
    });
  }

  const remappedStore = await replaceSkuMappings(nextMappings);
  remappedStore.archivedUnmappedSkus = (remappedStore.archivedUnmappedSkus ?? []).filter(
    (item) =>
      !rows.some(
        (row) =>
          row.id === item.id ||
          normalizeSkuKey(row.onlineSku) === normalizeSkuKey(item.onlineSku),
      ),
  );
  await writeLocalStore(remappedStore);

  await addAuditLog({
    action: "sku.create_and_map_bulk",
    entityType: "sku_mapping",
    entityId: `bulk_${Date.now()}`,
    organizationId: auth.user.organizationId,
    after: {
      rows: rows.length,
      productsCreated,
      onlineSkus: rows.map((row) => row.onlineSku),
    },
  });

  return NextResponse.json({ ok: true, mapped: rows.length, productsCreated });
}

function buildUniqueProductId(store: LocalStore, masterSku: string) {
  const slug = masterSku.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const base = `prod_${slug || "sku"}`;
  const existingIds = new Set(store.products.map((product) => product.id));
  if (!existingIds.has(base)) {
    return base;
  }

  let counter = 2;
  let candidate = `${base}_${counter}`;
  while (existingIds.has(candidate)) {
    counter += 1;
    candidate = `${base}_${counter}`;
  }
  return candidate;
}

function normalizeRow(input: unknown): BulkRow | null {
  const row = input as Partial<Record<keyof BulkRow, unknown>> | null;
  if (!row) {
    return null;
  }

  const onlineSku = String(row.onlineSku ?? "").trim();
  const masterSku = String(row.masterSku ?? "").trim();
  const name = String(row.name ?? "").trim();
  const multiplier = Number(row.multiplier ?? 1);
  const averageUnitCost = Number(row.averageUnitCost ?? 0);

  if (
    !onlineSku ||
    !masterSku ||
    !name ||
    !Number.isFinite(multiplier) ||
    multiplier <= 0
  ) {
    return null;
  }

  return {
    id: String(row.id ?? `${onlineSku}`).trim() || onlineSku,
    onlineSku,
    title: String(row.title ?? name).trim() || name,
    channel: String(row.channel ?? "mercado_libre").trim() || "mercado_libre",
    marketplaceAccountId: String(row.marketplaceAccountId ?? "manual_mapping").trim() || "manual_mapping",
    masterSku,
    name,
    multiplier,
    averageUnitCost: Number.isFinite(averageUnitCost) ? Math.max(0, averageUnitCost) : 0,
  };
}
