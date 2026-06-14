import { NextResponse } from "next/server";
import { requireApiWritablePermission } from "@/lib/server/auth-store";
import {
  readLocalStore,
  replaceSkuMappings,
  writeLocalStore,
  type LocalStore,
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
    const currentOnlineSku = String(formData.get("currentOnlineSku") ?? "").trim();
    const onlineSku = String(formData.get("onlineSku") ?? "").trim();
    const masterSku = String(formData.get("masterSku") ?? "").trim();
    const multiplier = Number(formData.get("multiplier") ?? 1);
    const redirectTo = String(formData.get("redirectTo") ?? "/meli");
    const inputTitle = String(formData.get("title") ?? "").trim();
    const inputChannel = String(formData.get("channel") ?? "").trim();
    const inputMarketplaceAccount = String(
      formData.get("marketplaceAccountId") ??
        formData.get("marketplaceAccount") ??
        "",
    ).trim();

    if (!onlineSku || !masterSku || !Number.isFinite(multiplier) || multiplier <= 0) {
      return NextResponse.json(
        { error: "onlineSku, masterSku y multiplier validos son requeridos" },
        { status: 400 },
      );
    }

    const store = await readLocalStore();
    const targetKey = normalizeSkuKey(onlineSku);
    const currentKey = normalizeSkuKey(currentOnlineSku || onlineSku);
    const existingTarget = store.onlineSkus.find(
      (sku) => normalizeSkuKey(sku.onlineSku) === targetKey,
    );
    const existingCurrent = store.onlineSkus.find(
      (sku) => normalizeSkuKey(sku.onlineSku) === currentKey,
    );
    const detected = findDetectedOnlineSku(store, onlineSku);
    const base = existingTarget ?? existingCurrent ?? detected;
    const nextMappings = store.onlineSkus.filter(
      (sku) => {
        const key = normalizeSkuKey(sku.onlineSku);
        return key !== targetKey && key !== currentKey;
      },
    );

    const mappingLocalId =
      existingTarget?.id ??
      (targetKey === currentKey ? existingCurrent?.id : undefined) ??
      detected?.id ??
      mappingId(onlineSku);

    nextMappings.push({
      id: mappingLocalId,
      onlineSku,
      title: base?.title?.trim() || inputTitle || onlineSku,
      imageUrl: base?.imageUrl ?? null,
      channel: base?.channel || inputChannel || "mercado_libre",
      marketplaceAccount:
        base?.marketplaceAccount || inputMarketplaceAccount || "manual_mapping",
      externalListingId: base?.externalListingId ?? null,
      safetyBufferUnits: base?.safetyBufferUnits ?? 0,
      components: [{ masterSku, quantityRequired: multiplier }],
    });

    const updatedStore = await replaceSkuMappings(nextMappings);
    updatedStore.archivedUnmappedSkus = (updatedStore.archivedUnmappedSkus ?? []).filter(
      (item) =>
        normalizeSkuKey(item.onlineSku) !== targetKey &&
        normalizeSkuKey(item.onlineSku) !== currentKey,
    );
    await writeLocalStore(updatedStore);

    const redirectUrl = new URL(redirectTo, request.url);
    redirectUrl.searchParams.set("sku_mapped", onlineSku);
    if (wantsJson) {
      return NextResponse.json({
        ok: true,
        onlineSku,
        masterSku,
        multiplier,
        redirectUrl: redirectUrl.pathname + redirectUrl.search + redirectUrl.hash,
      });
    }
    return NextResponse.redirect(redirectUrl, { status: 303 });
  } catch (error) {
    const message =
      error instanceof Error
        ? `No se pudo guardar la equivalencia: ${error.message}`
        : "No se pudo guardar la equivalencia.";

    if (wantsJson) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const url = new URL("/inventario", request.url);
    url.searchParams.set("error", message);
    return NextResponse.redirect(url, { status: 303 });
  }
}

function findDetectedOnlineSku(store: LocalStore, onlineSku: string) {
  const targetKey = normalizeSkuKey(onlineSku);

  for (const order of store.marketplaceOrders) {
    const item = order.items.find(
      (entry) => normalizeSkuKey(entry.externalSku) === targetKey,
    );
    if (item) {
      return {
        id: mappingId(onlineSku),
        onlineSku,
        title: item.title || onlineSku,
        imageUrl: item.imageUrl ?? null,
        channel: order.channel,
        marketplaceAccount: order.marketplaceAccountId,
        externalListingId: null,
        safetyBufferUnits: 0,
      };
    }
  }

  const fullItems = [
    ...(store.fullStockSync?.items ?? []),
    ...(store.fullStockSync?.auditItems ?? []),
    ...(store.fullStockSync?.unmappedItems ?? []),
  ];
  const fullItem = fullItems.find(
    (entry) => normalizeSkuKey(entry.externalSku) === targetKey,
  );
  if (fullItem) {
    return {
      id: mappingId(onlineSku),
      onlineSku,
      title: fullItem.title || onlineSku,
      imageUrl: fullItem.imageUrl ?? null,
      channel: "mercado_libre",
      marketplaceAccount: store.fullStockSync?.accountId ?? "manual_mapping",
      externalListingId: null,
      safetyBufferUnits: 0,
    };
  }

  return null;
}

function wantsJsonResponse(request: Request) {
  return (
    request.headers.get("accept")?.includes("application/json") ||
    request.headers.get("x-requested-with") === "fetch"
  );
}
