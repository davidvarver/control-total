import { NextResponse } from "next/server";
import { addAuditLog } from "@/lib/server/audit";
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

type ComponentAction = "upsert" | "delete";

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
    const action = normalizeAction(String(formData.get("action") ?? "upsert"));
    const onlineSku = String(formData.get("onlineSku") ?? "").trim();
    const masterSku = String(formData.get("masterSku") ?? "").trim();
    const quantityRequired = Number(
      formData.get("quantityRequired") ?? formData.get("multiplier") ?? 1,
    );
    const redirectTo = String(formData.get("redirectTo") ?? "/inventario#productos-skus");
    const inputTitle = String(formData.get("title") ?? "").trim();
    const inputChannel = String(formData.get("channel") ?? "").trim();
    const inputMarketplaceAccount = String(
      formData.get("marketplaceAccountId") ??
        formData.get("marketplaceAccount") ??
        "",
    ).trim();

    if (!onlineSku || !masterSku) {
      return jsonOrRedirectError({
        request,
        wantsJson,
        message: "SKU online y SKU maestro son requeridos.",
      });
    }

    if (
      action === "upsert" &&
      (!Number.isFinite(quantityRequired) || quantityRequired <= 0)
    ) {
      return jsonOrRedirectError({
        request,
        wantsJson,
        message: "La cantidad que consume debe ser mayor a 0.",
      });
    }

    const store = await readLocalStore();
    const masterProduct = store.products.find(
      (product) =>
        normalizeSkuKey(product.masterSku) === normalizeSkuKey(masterSku) &&
        product.isActive !== false,
    );

    if (!masterProduct) {
      return jsonOrRedirectError({
        request,
        wantsJson,
        message: `SKU maestro no existe o esta archivado: ${masterSku}.`,
      });
    }

    const onlineSkuKey = normalizeSkuKey(onlineSku);
    const existing = store.onlineSkus.find(
      (sku) => normalizeSkuKey(sku.onlineSku) === onlineSkuKey,
    );
    const detected = existing ? null : findDetectedOnlineSku(store, onlineSku);

    if (action === "delete" && !existing) {
      return jsonOrRedirectError({
        request,
        wantsJson,
        message: "No existe esa relacion para eliminar.",
      });
    }

    const base = existing ?? detected;
    const nextComponents =
      action === "delete"
        ? (existing?.components ?? []).filter(
            (component) =>
              normalizeSkuKey(component.masterSku) !== normalizeSkuKey(masterSku),
          )
        : [
            ...(existing?.components ?? []).filter(
              (component) =>
                normalizeSkuKey(component.masterSku) !== normalizeSkuKey(masterSku),
            ),
            {
              masterSku: masterProduct.masterSku,
              quantityRequired,
            },
          ];

    const nextMappings = store.onlineSkus.filter(
      (sku) => normalizeSkuKey(sku.onlineSku) !== onlineSkuKey,
    );
    nextMappings.push({
      id: base?.id ?? mappingId(onlineSku),
      onlineSku: existing?.onlineSku ?? onlineSku,
      title: base?.title?.trim() || inputTitle || onlineSku,
      imageUrl: base?.imageUrl ?? null,
      channel: base?.channel || inputChannel || "mercado_libre",
      marketplaceAccount:
        base?.marketplaceAccount || inputMarketplaceAccount || "manual_mapping",
      externalListingId: base?.externalListingId ?? null,
      safetyBufferUnits: base?.safetyBufferUnits ?? 0,
      components: nextComponents.sort((left, right) =>
        left.masterSku.localeCompare(right.masterSku),
      ),
    });

    const updatedStore = await replaceSkuMappings(nextMappings);
    if (action === "upsert") {
      updatedStore.archivedUnmappedSkus = (
        updatedStore.archivedUnmappedSkus ?? []
      ).filter((item) => normalizeSkuKey(item.onlineSku) !== onlineSkuKey);
      await writeLocalStore(updatedStore);
    }

    await addAuditLog({
      action: action === "delete" ? "sku.component.delete" : "sku.component.upsert",
      entityType: "sku_mapping",
      entityId: `${onlineSku}:${masterProduct.masterSku}`,
      organizationId: auth.user.organizationId,
      after: {
        onlineSku,
        masterSku: masterProduct.masterSku,
        quantityRequired: action === "delete" ? 0 : quantityRequired,
      },
    });

    const redirectUrl = new URL(redirectTo, request.url);
    redirectUrl.searchParams.set(
      action === "delete" ? "sku_component_deleted" : "sku_component_saved",
      onlineSku,
    );

    if (wantsJson) {
      return NextResponse.json({
        ok: true,
        onlineSku,
        masterSku: masterProduct.masterSku,
        quantityRequired: action === "delete" ? 0 : quantityRequired,
        redirectUrl: redirectUrl.pathname + redirectUrl.search + redirectUrl.hash,
      });
    }

    return NextResponse.redirect(redirectUrl, { status: 303 });
  } catch (error) {
    return jsonOrRedirectError({
      request,
      wantsJson,
      message:
        error instanceof Error
          ? `No se pudo guardar la relacion: ${error.message}`
          : "No se pudo guardar la relacion.",
    });
  }
}

function normalizeAction(value: string): ComponentAction {
  return value === "delete" ? "delete" : "upsert";
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

function jsonOrRedirectError({
  request,
  wantsJson,
  message,
}: {
  request: Request;
  wantsJson: boolean;
  message: string;
}) {
  if (wantsJson) {
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const url = new URL("/inventario", request.url);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url, { status: 303 });
}

function wantsJsonResponse(request: Request) {
  return (
    request.headers.get("accept")?.includes("application/json") ||
    request.headers.get("x-requested-with") === "fetch"
  );
}
