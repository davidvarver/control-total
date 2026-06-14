import { NextResponse } from "next/server";
import { addAuditLog } from "@/lib/server/audit";
import { requireApiWritablePermission } from "@/lib/server/auth-store";
import {
  createProduct,
  readLocalStore,
  replaceSkuMappings,
  writeLocalStore,
} from "@/lib/server/local-store";
import { normalizeSkuKey } from "@/lib/domain/sku-match";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mappingId(onlineSku: string) {
  return `online_${onlineSku.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
}

export async function POST(request: Request) {
  const wantsJson = wantsJsonResponse(request);
  const auth = await requireApiWritablePermission("inventory.write");
  if (auth.response) {
    return auth.response;
  }

  try {
    const formData = await request.formData();
    const onlineSku = String(formData.get("onlineSku") ?? "").trim();
    const masterSku = String(formData.get("masterSku") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim() || masterSku;
    const multiplier = Number(formData.get("multiplier") ?? 1);
    const averageUnitCost = Number(formData.get("averageUnitCost") ?? 0);
    const initialStock = Number(formData.get("initialStock") ?? 0);
    const warehouseId = String(formData.get("warehouseId") ?? "wh_main");
    const redirectTo = String(formData.get("redirectTo") ?? "/meli");

    if (
      !onlineSku ||
      !masterSku ||
      !Number.isFinite(multiplier) ||
      multiplier <= 0
    ) {
      return NextResponse.json(
        { error: "SKU Meli, SKU maestro y unidades validas son requeridos." },
        { status: 400 },
      );
    }

    let beforeCreateStore = await readLocalStore();
    const existingProduct = beforeCreateStore.products.find(
      (product) =>
        normalizeSkuKey(product.masterSku) === normalizeSkuKey(masterSku),
    );

    const product = existingProduct
      ? existingProduct
      : await createProduct({
        masterSku,
        name,
        initialStock,
        averageUnitCost,
        warehouseId,
      });

    if (existingProduct) {
      existingProduct.isActive = true;
      existingProduct.name = existingProduct.name || name;
      if ((existingProduct.averageUnitCost ?? 0) <= 0 && averageUnitCost > 0) {
        existingProduct.averageUnitCost = averageUnitCost;
      }
      if (
        !beforeCreateStore.inventoryBalances.some(
          (balance) =>
            normalizeSkuKey(balance.masterSku) === normalizeSkuKey(masterSku) &&
            balance.warehouseId === warehouseId,
        )
      ) {
        beforeCreateStore.inventoryBalances.push({
          masterSku: existingProduct.masterSku,
          warehouseId,
          physicalQuantity: Math.max(0, Number.isFinite(initialStock) ? initialStock : 0),
          reservedQuantity: 0,
          blockedQuantity: 0,
        });
      }
      beforeCreateStore.importedAt = new Date().toISOString();
      await writeLocalStore(beforeCreateStore);
      beforeCreateStore = await readLocalStore();
    }

    const store = existingProduct ? beforeCreateStore : await readLocalStore();
    const onlineSkuKey = normalizeSkuKey(onlineSku);
    const existingOnlineSku = store.onlineSkus.find(
      (sku) => normalizeSkuKey(sku.onlineSku) === onlineSkuKey,
    );
    const nextMappings = store.onlineSkus.filter(
      (sku) => normalizeSkuKey(sku.onlineSku) !== onlineSkuKey,
    );

    nextMappings.push({
      id: existingOnlineSku?.id ?? mappingId(onlineSku),
      onlineSku,
      title: existingOnlineSku?.title?.trim() || name,
      imageUrl: existingOnlineSku?.imageUrl ?? null,
      channel: existingOnlineSku?.channel || "mercado_libre",
      marketplaceAccount: existingOnlineSku?.marketplaceAccount || "manual_mapping",
      externalListingId: existingOnlineSku?.externalListingId ?? null,
      safetyBufferUnits: existingOnlineSku?.safetyBufferUnits ?? 0,
      components: [{ masterSku: product.masterSku, quantityRequired: multiplier }],
    });

    const updatedStore = await replaceSkuMappings(nextMappings);
    updatedStore.archivedUnmappedSkus = (updatedStore.archivedUnmappedSkus ?? []).filter(
      (item) => normalizeSkuKey(item.onlineSku) !== normalizeSkuKey(onlineSku),
    );
    await writeLocalStore(updatedStore);

    await addAuditLog({
      action: existingProduct ? "sku.map" : "product.create_and_map",
      entityType: "sku_mapping",
      entityId: onlineSku,
      organizationId: auth.user.organizationId,
      after: {
        onlineSku,
        masterSku: product.masterSku,
        multiplier,
        productCreated: !existingProduct,
      },
    });

    if (wantsJson) {
      const redirectUrl = new URL(redirectTo, request.url);
      redirectUrl.searchParams.set("sku_mapped", onlineSku);
      return NextResponse.json({
        ok: true,
        onlineSku,
        masterSku: product.masterSku,
        multiplier,
        productCreated: !existingProduct,
        redirectUrl: redirectUrl.pathname + redirectUrl.search + redirectUrl.hash,
      });
    }

    const url = new URL(redirectTo, request.url);
    url.searchParams.set("sku_mapped", onlineSku);
    return NextResponse.redirect(url, { status: 303 });
  } catch (error) {
    const message =
      error instanceof Error
        ? `No se pudo crear/mapear el SKU: ${error.message}`
        : "No se pudo crear/mapear el SKU.";

    if (wantsJson) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const url = new URL("/meli#skus-sin-mapear", request.url);
    url.searchParams.set("error", message);
    return NextResponse.redirect(url, { status: 303 });
  }
}

function wantsJsonResponse(request: Request) {
  return (
    request.headers.get("accept")?.includes("application/json") ||
    request.headers.get("x-requested-with") === "fetch"
  );
}
