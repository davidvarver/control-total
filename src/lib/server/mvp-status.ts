import { cache } from "react";
import { readLocalStore, type LocalStore } from "./local-store";
import { isCancelledOrder } from "./order-status";
import { getLatestSuccessfulSyncRun } from "./sync-runs";
import { normalizeSkuKey } from "../domain/sku-match";

export const buildMvpStatus = cache(async function buildMvpStatus(input?: { store?: LocalStore }) {
  const store = input?.store ?? await readLocalStore();
  const latestMeliSyncRun = await getLatestSuccessfulSyncRun({
    organizationId: store.organization.id,
    jobType: "meli-hourly",
  });
  const products = store.products.filter((product) => product.isActive !== false);
  const meliOrders = store.marketplaceOrders.filter(
    (order) => order.channel === "mercado_libre",
  );
  const activeMeliOrders = meliOrders.filter(
    (order) => !isCancelledOrder(order.status),
  );
  const archivedUnmappedIds = new Set(
    (store.archivedUnmappedSkus ?? []).map((item) => item.id),
  );
  const unmappedOrderItems = activeMeliOrders.flatMap((order) =>
    order.items
      .filter((item) => !item.masterSku)
      .filter(
        (item) =>
          !archivedUnmappedIds.has(
            buildUnmappedSkuArchiveId({
              channel: order.channel,
              marketplaceAccountId: order.marketplaceAccountId,
              externalSku: item.externalSku,
            }),
          ),
      )
      .map((item) => ({
        source: "venta" as const,
        orderId: order.externalOrderId,
        externalSku: item.externalSku,
        title: item.title,
        quantity: item.quantity,
        fullQuantity: 0,
      })),
  );
  const productsWithoutCost = products.filter(
    (product) => !product.averageUnitCost || product.averageUnitCost <= 0,
  );
  const productBySku = new Map(
    products.map((product) => [normalizeSkuKey(product.masterSku), product]),
  );
  const inferredTitleByOnlineSku = new Map<string, string>();
  for (const order of activeMeliOrders) {
    for (const item of order.items) {
      rememberUsefulTitle(
        inferredTitleByOnlineSku,
        item.externalSku,
        item.title,
      );
    }
  }
  for (const item of store.fullStockSync?.items ?? []) {
    rememberUsefulTitle(inferredTitleByOnlineSku, item.externalSku, item.title);
  }
  for (const item of store.fullStockSync?.auditItems ?? []) {
    rememberUsefulTitle(inferredTitleByOnlineSku, item.externalSku, item.title);
  }
  for (const item of store.fullStockSync?.unmappedItems ?? []) {
    rememberUsefulTitle(inferredTitleByOnlineSku, item.externalSku, item.title);
  }
  const skuEquivalences = store.onlineSkus
    .map((sku) => {
      const components = sku.components.map((component) => {
        const product = productBySku.get(normalizeSkuKey(component.masterSku));

        return {
          masterSku: component.masterSku,
          masterName: product?.name ?? component.masterSku,
          multiplier: component.quantityRequired,
          exists: Boolean(product),
        };
      });

      return {
        onlineSku: sku.onlineSku,
        title: bestOnlineSkuTitle(
          sku.onlineSku,
          sku.title,
          inferredTitleByOnlineSku.get(normalizeSkuKey(sku.onlineSku)),
        ),
        channel: sku.channel,
        marketplaceAccount: sku.marketplaceAccount,
        components,
        isComplete:
          components.length > 0 &&
          components.every(
            (component) => component.exists && component.multiplier > 0,
          ),
      };
    })
    .sort((a, b) => a.onlineSku.localeCompare(b.onlineSku));
  const incompleteSkuEquivalences = skuEquivalences.filter(
    (sku) => !sku.isComplete,
  );
  const incompleteOrders = activeMeliOrders.filter(
    (order) =>
      order.netReceivedAmount === null ||
      order.items.some((item) => !item.masterSku) ||
      order.items.some((item) => {
        if (!item.masterSku) {
          return false;
        }

        const product = productBySku.get(normalizeSkuKey(item.masterSku));
        return !product?.averageUnitCost || product.averageUnitCost <= 0;
      }),
  );
  const pendingBillingOrders = activeMeliOrders.filter(
    (order) => order.netReceivedAmount === null,
  );
  const staleBillingOrders = pendingBillingOrders.filter((order) => {
    const orderedAt = new Date(order.orderedAt).getTime();
    if (!Number.isFinite(orderedAt)) {
      return true;
    }

    const fortyEightHours = 48 * 60 * 60 * 1000;
    return Date.now() - orderedAt >= fortyEightHours;
  });
  const fullOrders = activeMeliOrders.filter((order) =>
    order.items.some((item) => item.warehouseId === "wh_full"),
  );
  const fullOrdersWithoutFifo = fullOrders.filter(
    (order) => !order.fullCostAllocations?.length,
  );
  const fullLayersRemaining = store.fullInventoryLayers.reduce(
    (sum, layer) => sum + layer.remainingQuantity,
    0,
  );
  const fullUnmapped = store.fullStockSync?.unmappedItems ?? [];
  const unmappedSkuByKey = new Map<
    string,
    {
      externalSku: string;
      title: string;
      sources: string[];
      orderIds: string[];
      quantity: number;
      fullQuantity: number;
      inventoryIds: string[];
    }
  >();

  for (const item of unmappedOrderItems) {
    const key = item.externalSku.toLowerCase();
    const row =
      unmappedSkuByKey.get(key) ??
      {
        externalSku: item.externalSku,
        title: item.title,
        sources: [],
        orderIds: [],
        quantity: 0,
        fullQuantity: 0,
        inventoryIds: [],
      };

    if (!row.sources.includes("Ventas")) {
      row.sources.push("Ventas");
    }
    row.orderIds.push(item.orderId);
    row.quantity += item.quantity;
    unmappedSkuByKey.set(key, row);
  }

  for (const item of fullUnmapped) {
    const key = item.externalSku.toLowerCase();
    const row =
      unmappedSkuByKey.get(key) ??
      {
        externalSku: item.externalSku,
        title: item.title,
        sources: [],
        orderIds: [],
        quantity: 0,
        fullQuantity: 0,
        inventoryIds: [],
      };

    if (!row.sources.includes("Full")) {
      row.sources.push("Full");
    }
    row.fullQuantity += item.availableQuantity;
    row.inventoryIds.push(item.inventoryId);
    unmappedSkuByKey.set(key, row);
  }
  const unmappedSkus = [...unmappedSkuByKey.values()].sort((a, b) =>
    a.externalSku.localeCompare(b.externalSku),
  );
  const activeProductSkus = new Set(
    products.map((product) => product.masterSku.toLowerCase()),
  );
  const negativeBalances = store.inventoryBalances.filter(
    (balance) =>
      activeProductSkus.has(balance.masterSku.toLowerCase()) &&
      balance.physicalQuantity < 0,
  );
  const lowStock = products.filter(
    (product) => product.currentStock >= 0 && product.currentStock <= 10,
  );
  const lastMeliSync = store.marketplaceAccounts
    .map((account) => account.lastSyncAt)
    .filter(Boolean)
    .sort()
    .at(-1);
  const hasInventory = products.length > 0;
  const hasMeliAccount = store.marketplaceAccounts.length > 0;
  const hasMeliOrders = meliOrders.length > 0;
  const inventoryBaselineTime = getInventoryBaselineTime(store.inventoryBaselineAt);
  const baselineProtectedOrders = activeMeliOrders.filter((order) => {
    if (inventoryBaselineTime <= 0) {
      return false;
    }

    const orderedAt = new Date(order.orderedAt).getTime();
    return Number.isFinite(orderedAt) && orderedAt < inventoryBaselineTime;
  });
  const inventoryBaselineConfigured = inventoryBaselineTime > 0;
  const latestMeliSyncAt = latestMeliSyncRun?.finishedAt?.toISOString();
  const isMeliSyncFresh = latestMeliSyncRun?.finishedAt
    ? Date.now() - latestMeliSyncRun.finishedAt.getTime() <= 2 * 60 * 60 * 1000
    : false;
  const fullSyncedAtTime = store.fullStockSync?.syncedAt
    ? new Date(store.fullStockSync.syncedAt).getTime()
    : 0;
  const isFullSyncFresh =
    Number.isFinite(fullSyncedAtTime) &&
    fullSyncedAtTime > 0 &&
    Date.now() - fullSyncedAtTime <= 36 * 60 * 60 * 1000;
  const hasMappingInputs =
    skuEquivalences.length > 0 ||
    unmappedSkus.length > 0 ||
    incompleteSkuEquivalences.length > 0;
  const hasFullSales = fullOrders.length > 0;
  const latestFullBillingCharge = (store.fullBillingCharges ?? [])
    .slice()
    .sort((a, b) => {
      const periodCompare = b.period.localeCompare(a.period);
      if (periodCompare !== 0) {
        return periodCompare;
      }

      return new Date(b.syncedAt).getTime() - new Date(a.syncedAt).getTime();
    })
    .at(0);
  const latestFullBillingPeriod = latestFullBillingCharge?.period;
  const latestFullBillingCharges = latestFullBillingPeriod
    ? (store.fullBillingCharges ?? []).filter(
        (charge) => charge.period === latestFullBillingPeriod,
      )
    : [];
  const latestFullBillingAmount = latestFullBillingCharges.reduce(
    (sum, charge) => sum + charge.amount,
    0,
  );

  return {
    organization: store.organization,
    counts: {
      products: products.length,
      onlineSkus: store.onlineSkus.length,
      meliAccounts: store.marketplaceAccounts.length,
      meliOrders: meliOrders.length,
      productsWithoutCost: productsWithoutCost.length,
      skuEquivalences: skuEquivalences.length,
      skuEquivalenceIssues:
        unmappedSkus.length + incompleteSkuEquivalences.length,
      incompleteSkuEquivalences: incompleteSkuEquivalences.length,
      unmappedOrderItems: unmappedOrderItems.length,
      unmappedSkus: unmappedSkus.length,
      incompleteOrders: incompleteOrders.length,
      pendingBillingOrders: pendingBillingOrders.length,
      staleBillingOrders: staleBillingOrders.length,
      fullOrders: fullOrders.length,
      fullOrdersWithoutFifo: fullOrdersWithoutFifo.length,
      fullBillingCharges: latestFullBillingCharges.length,
      fullBillingAmount: roundMoney(latestFullBillingAmount),
      fullLayers: store.fullInventoryLayers.length,
      fullLayersRemaining,
      fullUnmapped: fullUnmapped.length,
      negativeBalances: negativeBalances.length,
      lowStock: lowStock.length,
      pendingCostImports: store.pendingCostImports.length,
      staleSyncAccounts: hasMeliAccount && !isMeliSyncFresh ? 1 : 0,
      baselineProtectedOrders: baselineProtectedOrders.length,
    },
    readiness: {
      hasMappings:
        hasMappingInputs &&
        skuEquivalences.length > 0 &&
        unmappedSkus.length + incompleteSkuEquivalences.length === 0,
      hasInventory,
      hasCosts: hasInventory && productsWithoutCost.length === 0,
      hasMeliAccount,
      hasMeliOrders,
      hasFullSync: hasMeliAccount && isFullSyncFresh,
      hasFullFifo:
        hasFullSales &&
        store.fullInventoryLayers.length > 0 &&
        fullOrdersWithoutFifo.length === 0,
      hasFullBilling: !hasFullSales || latestFullBillingCharges.length > 0,
      hasInventoryBaseline:
        !hasInventory || !hasMeliOrders || inventoryBaselineConfigured,
      hasCleanMappings:
        hasMappingInputs &&
        unmappedSkus.length === 0 &&
        incompleteSkuEquivalences.length === 0,
      hasCleanProfit: activeMeliOrders.length > 0 && incompleteOrders.length === 0,
      hasCleanBilling: activeMeliOrders.length > 0 && staleBillingOrders.length === 0,
      hasFreshMeliSync: !hasMeliAccount || isMeliSyncFresh,
    },
    dates: {
      importedAt: store.importedAt,
      lastMeliSync,
      latestMeliSyncRun: latestMeliSyncAt,
      fullSyncedAt: store.fullStockSync?.syncedAt,
      inventoryBaselineAt: inventoryBaselineConfigured
        ? store.inventoryBaselineAt
        : undefined,
      latestFullBillingPeriod,
      latestFullBillingSyncedAt: latestFullBillingCharge?.syncedAt,
    },
    accounts: store.marketplaceAccounts.map(({ accessToken, refreshToken, ...account }) => {
      void accessToken;
      void refreshToken;
      return account;
    }),
    productsWithoutCost: productsWithoutCost
      .slice()
      .sort((a, b) => a.masterSku.localeCompare(b.masterSku))
      .slice(0, 25),
    skuEquivalences: skuEquivalences.slice(0, 250),
    incompleteSkuEquivalences: incompleteSkuEquivalences.slice(0, 100),
    pendingCostImports: store.pendingCostImports.slice(0, 100),
    unmappedOrderItems: unmappedOrderItems.slice(0, 25),
    unmappedSkus: unmappedSkus.slice(0, 100),
    pendingBillingOrders: pendingBillingOrders.slice(0, 25).map((order) => ({
      externalOrderId: order.externalOrderId,
      orderedAt: order.orderedAt,
      grossAmount: order.grossAmount,
      status: order.status,
      isStale: staleBillingOrders.some(
        (entry) => entry.externalOrderId === order.externalOrderId,
      ),
    })),
    fullOrdersWithoutFifo: fullOrdersWithoutFifo.slice(0, 25).map((order) => ({
      externalOrderId: order.externalOrderId,
      orderedAt: order.orderedAt,
      status: order.status,
      items: order.items
        .filter((item) => item.warehouseId === "wh_full")
        .map((item) => ({
          externalSku: item.externalSku,
          masterSku: item.masterSku,
          title: item.title,
          consumedQuantity: item.consumedQuantity,
        })),
    })),
    fullInventoryLayers: store.fullInventoryLayers
      .slice()
      .sort(
        (a, b) =>
          new Date(b.dateReceived).getTime() -
          new Date(a.dateReceived).getTime(),
      )
      .slice(0, 20),
    fullUnmapped: fullUnmapped.slice(0, 50),
    negativeBalances: negativeBalances.slice(0, 25),
    masterSkus: products
      .map((product) => ({ masterSku: product.masterSku, name: product.name }))
    .sort((a, b) => a.masterSku.localeCompare(b.masterSku)),
  };
});

function rememberUsefulTitle(
  titlesBySku: Map<string, string>,
  onlineSku: string | null | undefined,
  title: string | null | undefined,
) {
  if (!onlineSku || !title) {
    return;
  }

  const key = normalizeSkuKey(onlineSku);
  const normalizedTitle = title.trim();
  if (!key || !normalizedTitle) {
    return;
  }

  const existing = titlesBySku.get(key);
  if (!existing || normalizedTitle.length > existing.length) {
    titlesBySku.set(key, normalizedTitle);
  }
}

function bestOnlineSkuTitle(
  onlineSku: string,
  currentTitle: string | null | undefined,
  inferredTitle: string | null | undefined,
) {
  const current = currentTitle?.trim();
  if (current && normalizeSkuKey(current) !== normalizeSkuKey(onlineSku)) {
    return current;
  }

  const inferred = inferredTitle?.trim();
  if (inferred && normalizeSkuKey(inferred) !== normalizeSkuKey(onlineSku)) {
    return inferred;
  }

  return current || onlineSku;
}

function buildUnmappedSkuArchiveId(input: {
  channel: string;
  marketplaceAccountId: string;
  externalSku: string;
}) {
  return [
    input.channel || "unknown",
    input.marketplaceAccountId || "manual",
    input.externalSku,
  ]
    .join("::")
    .toLowerCase();
}

function getInventoryBaselineTime(value: string | undefined) {
  if (!value) {
    return 0;
  }

  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
