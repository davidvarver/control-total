import {
  getMarketplaceAccount,
  type LocalMarketplaceAccount,
  type LocalMarketplaceOrder,
  type LocalStore,
  readLocalStore,
  recalculateMarketplaceOrders,
  replaceFullInventory,
  saveFullStockAudit,
  saveMarketplaceListingImages,
  saveMarketplaceOrders,
  upsertMarketplaceAccount,
  type LocalFullStockSnapshotItem,
  type LocalMarketplaceListingImage,
} from "@/lib/server/local-store";
import { buildSalesAuditReportFromStore } from "@/lib/server/sales-audit";
import {
  getMeliFulfillmentStock,
  getMeliItems,
  getMeliOrder,
  getMeliOrderBillingDetails,
  getMeliMarketplacePackOrders,
  getMeliPayment,
  getMeliPack,
  getMeliShipment,
  getMeliShipmentCosts,
  refreshMeliToken,
  searchMeliOrders,
  searchMeliSellerItems,
  searchRecentMeliOrders,
} from "./client";
import { getMeliPaymentIds, isCancelledOrder, normalizeMeliOrder } from "./normalize";
import {
  getMarketplaceRealSaleKey,
  groupMarketplaceOrdersIntoRealSales,
  isLikelyMeliSplitShipmentSibling,
} from "./order-group";
import {
  createMeliInitialSalesBackfillState,
  getMeliBackfillCutoff,
  getMeliMonthBackfillFrom,
} from "./backfill-window";
import {
  extractOrderRequestIds,
  extractPackFamilyPackIds,
  extractPackOrderIds,
  referencesMeliIdentifier,
} from "./pack";
import { normalizeSkuKey } from "../domain/sku-match";

type SalesBackfillState = NonNullable<LocalMarketplaceAccount["salesBackfill"]>;

function tokenNeedsRefresh(tokenExpiresAt: string) {
  const expiresAt = new Date(tokenExpiresAt).getTime();
  const fiveMinutes = 5 * 60 * 1000;
  return Number.isFinite(expiresAt) && expiresAt - Date.now() < fiveMinutes;
}

export async function syncMeliRecentOrders(params: {
  accountId: string;
  limit?: number;
}) {
  let account = await getMarketplaceAccount(params.accountId);
  if (!account) {
    throw new Error("Mercado Libre account not found");
  }

  if (tokenNeedsRefresh(account.tokenExpiresAt)) {
    const refreshed = await refreshMeliToken(account.refreshToken);
    account = await upsertMarketplaceAccount({
      ...account,
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token,
      tokenExpiresAt: new Date(
        Date.now() + refreshed.expires_in * 1000,
      ).toISOString(),
      status: "connected",
    });
  }

  const requestedLimit = Math.max(1, Math.min(params.limit ?? 50, 200));
  const result = await searchRecentOrderPages({
    accessToken: account.accessToken,
    sellerId: account.externalAccountId,
    limit: requestedLimit,
  });
  const store = await readLocalStore();
  const expandedOrders = await expandOrdersWithPacks(
    {
      accessToken: account.accessToken,
      sellerId: account.externalAccountId,
      orders: result.results,
    },
  );
  const billingDetailsByOrderId = await getBillingDetailsByOrderId(
    account.accessToken,
    expandedOrders.map((order) => getOrderId(order)).filter(Boolean),
  );
  const paymentDetailsByPaymentId = await getPaymentDetailsByPaymentId(
    account.accessToken,
    expandedOrders,
  );
  const normalizedOrders = await Promise.all(
    expandedOrders.map(async (order) => {
      const shipmentId = getOrderShipmentId(order);
      const shipment = shipmentId
        ? await safeGetShipment(account.accessToken, shipmentId)
        : undefined;
      const shipmentCosts = shipmentId
        ? await safeGetShipmentCosts(account.accessToken, shipmentId)
        : undefined;

      return normalizeMeliOrder({
        accountId: account.id,
        order,
        shipment,
        shipmentCosts,
        store,
        billingDetails: billingDetailsByOrderId.get(getOrderId(order)),
        paymentDetails: getOrderPaymentDetails(order, paymentDetailsByPaymentId),
      });
    }),
  );
  const orders = includeStoredPackSiblings(store, normalizedOrders);
  allocatePackShipping(orders);

  await saveMarketplaceOrders(account.id, orders);

  return {
    accountId: account.id,
    importedOrders: orders.length,
    paging: result.paging ?? null,
    unmappedItems: orders.flatMap((order) =>
      order.items
        .filter((item) => !item.masterSku)
        .map((item) => ({
          orderId: order.externalOrderId,
          externalSku: item.externalSku,
          title: item.title,
        })),
    ),
  };
}

export async function syncMeliAutomationOrders(params: {
  accountId: string;
  backfillLimit?: number;
  backfillMonths?: number;
  recentLimit?: number;
  recentIntervalMinutes?: number;
  maxRuntimeMs?: number;
}) {
  let account = await getFreshMarketplaceAccount(params.accountId);
  const store = await readLocalStore();
  const now = new Date();
  const existingOrders = store.marketplaceOrders.filter(
    (order) =>
      order.channel === "mercado_libre" &&
      order.marketplaceAccountId === account.id,
  );
  const backfill = getActiveBackfillState(
    account.salesBackfill,
    now,
    params.backfillMonths,
  );

  if (!backfill.completedAt) {
    const startedAt = Date.now();
    const batchLimit = Math.max(1, Math.min(params.backfillLimit ?? 150, 5_000));
    let checked = 0;
    let importedOrders = 0;
    let nextOffset = backfill.offset;
    let total = backfill.lastTotal ?? backfill.offset;
    let completed = false;
    const unmappedItems: Awaited<
      ReturnType<typeof normalizeAndSaveMeliOrders>
    >["unmappedItems"] = [];

    while (checked < batchLimit) {
      const remainingBatch = batchLimit - checked;
      const pageLimit = Math.min(50, remainingBatch);
      const page = await searchMeliOrders({
        accessToken: account.accessToken,
        sellerId: account.externalAccountId,
        sort: "date_asc",
        limit: pageLimit,
        offset: nextOffset,
        dateClosedFrom: backfill.from,
        dateClosedTo: backfill.to,
      });
      const imported = await normalizeAndSaveMeliOrders({
        account,
        rawOrders: page.results,
        mode: "basic",
      });

      checked += page.results.length;
      importedOrders += imported.orders.length;
      unmappedItems.push(...imported.unmappedItems);
      nextOffset += page.results.length;
      total = page.paging?.total ?? Math.max(total, nextOffset);
      completed =
        page.results.length === 0 ||
        page.results.length < pageLimit ||
        nextOffset >= total;
      const runtimeExhausted =
        params.maxRuntimeMs !== undefined &&
        Date.now() - startedAt >= params.maxRuntimeMs;
      const limitReached = checked >= batchLimit;

      account = await upsertMarketplaceAccount({
        ...account,
        salesBackfill: {
          ...backfill,
          offset: completed ? 0 : nextOffset,
          completedAt: completed ? now.toISOString() : undefined,
          lastRunAt: now.toISOString(),
          lastTotal: total,
        },
        salesAutomation: {
          ...account.salesAutomation,
          lastRunAt: now.toISOString(),
          lastMode: "basic_import",
          lastChecked: checked,
          lastImported: importedOrders,
          lastTotal: total,
          lastBacklogRemaining: Math.max(0, total - nextOffset),
          nextRecommendedMinutes: completed ? 60 : limitReached || runtimeExhausted ? 15 : 1,
          lastError: undefined,
        },
      });

      if (completed || limitReached || runtimeExhausted) {
        break;
      }
    }

    const remaining = Math.max(0, total - nextOffset);
    completed = completed || remaining === 0;
    account = await upsertMarketplaceAccount({
      ...account,
      salesBackfill: {
        ...backfill,
        offset: completed ? 0 : nextOffset,
        completedAt: completed ? now.toISOString() : undefined,
        lastRunAt: now.toISOString(),
        lastTotal: total,
      },
      salesAutomation: {
        ...account.salesAutomation,
        lastRunAt: now.toISOString(),
        lastMode: "basic_import",
        lastChecked: checked,
        lastImported: importedOrders,
        lastTotal: total,
        lastBacklogRemaining: remaining,
        nextRecommendedMinutes: completed ? 60 : 15,
        lastError: undefined,
      },
    });

    return {
      mode: "basic_import" as const,
      importedOrders,
      unmappedItems,
      checked,
      total,
      nextOffset: completed ? 0 : nextOffset,
      remaining,
      isCaughtUp: completed,
      nextRecommendedMinutes: completed ? 60 : 15,
    };
  }

  const nextRecommendedMinutes = getMinutesUntilNextClosedHour(now);
  await upsertMarketplaceAccount({
    ...account,
    salesAutomation: {
      ...account.salesAutomation,
      lastRunAt: now.toISOString(),
      lastMode: "skip_recent",
      lastChecked: 0,
      lastImported: 0,
      lastTotal: existingOrders.length,
      lastBacklogRemaining: 0,
      nextRecommendedMinutes,
      lastError: undefined,
    },
  });

  return {
    mode: "skip_recent" as const,
    importedOrders: 0,
    unmappedItems: [],
    checked: 0,
    total: existingOrders.length,
    nextOffset: 0,
    remaining: 0,
    isCaughtUp: true,
    nextRecommendedMinutes,
  };
}

function getActiveBackfillState(
  current: LocalMarketplaceAccount["salesBackfill"],
  now: Date,
  backfillMonths?: number,
): SalesBackfillState {
  const cutoff = getMeliBackfillCutoff(now);

  if (!current) {
    return createInitialBackfillState(now, backfillMonths);
  }

  const oldestAllowedFrom = getMeliMonthBackfillFrom(now, backfillMonths).getTime();
  const currentFrom = new Date(current.from).getTime();
  const requestedHistoricalBackfill = backfillMonths !== undefined;
  if (
    requestedHistoricalBackfill &&
    current.completedAt &&
    Number.isFinite(currentFrom) &&
    currentFrom > oldestAllowedFrom
  ) {
    return createInitialBackfillState(now, backfillMonths);
  }

  if (
    !current.completedAt &&
    Number.isFinite(currentFrom) &&
    currentFrom < oldestAllowedFrom
  ) {
    return createInitialBackfillState(now, backfillMonths);
  }

  const currentTo = new Date(current.to).getTime();
  if (
    current.completedAt &&
    Number.isFinite(currentTo) &&
    currentTo < cutoff.getTime()
  ) {
    return {
      from: current.to,
      to: cutoff.toISOString(),
      offset: 0,
      startedAt: now.toISOString(),
    };
  }

  return current;
}

function createInitialBackfillState(now: Date, backfillMonths?: number): SalesBackfillState {
  return createMeliInitialSalesBackfillState(now, backfillMonths);
}

function getMinutesUntilNextClosedHour(now: Date) {
  const currentClosedHour = getMeliBackfillCutoff(now);
  const nextClosedHour = currentClosedHour.getTime() + 60 * 60 * 1000;

  return Math.max(1, Math.ceil((nextClosedHour - now.getTime()) / 60000));
}

async function normalizeAndSaveMeliOrders(params: {
  account: LocalMarketplaceAccount;
  rawOrders: unknown[];
  mode?: "basic" | "financial";
}) {
  const store = await readLocalStore();
  const mode = params.mode ?? "financial";
  const expandedOrders =
    mode === "financial"
      ? await expandOrdersWithPacks({
          accessToken: params.account.accessToken,
          sellerId: params.account.externalAccountId,
          orders: params.rawOrders,
        })
      : params.rawOrders;
  const billingDetailsByOrderId =
    mode === "financial"
      ? await getBillingDetailsByOrderId(
          params.account.accessToken,
          expandedOrders.map((order) => getOrderId(order)).filter(Boolean),
        )
      : new Map<string, unknown>();
  const paymentDetailsByPaymentId =
    mode === "financial"
      ? await getPaymentDetailsByPaymentId(params.account.accessToken, expandedOrders)
      : new Map<string, unknown>();
  const existingByOrderId = new Map(
    store.marketplaceOrders
      .filter((order) => order.marketplaceAccountId === params.account.id)
      .map((order) => [order.externalOrderId, order]),
  );
  const normalizedOrders = await Promise.all(
    expandedOrders.map(async (order) => {
      const shipmentId = getOrderShipmentId(order);
      const shipment = mode === "financial" && shipmentId
        ? await safeGetShipment(params.account.accessToken, shipmentId)
        : undefined;
      const shipmentCosts = mode === "financial" && shipmentId
        ? await safeGetShipmentCosts(params.account.accessToken, shipmentId)
        : undefined;

      const normalized = normalizeMeliOrder({
        accountId: params.account.id,
        order,
        shipment,
        shipmentCosts,
        store,
        billingDetails: billingDetailsByOrderId.get(getOrderId(order)),
        paymentDetails: getOrderPaymentDetails(order, paymentDetailsByPaymentId),
      });

      return mode === "basic"
        ? preserveExistingFinancialFields(
            normalized,
            existingByOrderId.get(normalized.externalOrderId),
          )
        : normalized;
    }),
  );
  const orders =
    mode === "financial"
      ? includeStoredPackSiblings(store, normalizedOrders)
      : normalizedOrders;

  if (mode === "financial") {
    allocatePackShipping(orders);
  }

  await saveMarketplaceOrders(params.account.id, orders);

  return {
    orders,
    unmappedItems: orders.flatMap((order) =>
      order.items
        .filter((item) => !item.masterSku)
        .map((item) => ({
          orderId: order.externalOrderId,
          externalSku: item.externalSku,
          title: item.title,
        })),
    ),
  };
}

function preserveExistingFinancialFields(
  order: LocalMarketplaceOrder,
  existingOrder: LocalMarketplaceOrder | undefined,
) {
  if (!existingOrder || existingOrder.billingStatus !== "confirmed") {
    return order;
  }

  return {
    ...order,
    netReceivedAmount: existingOrder.netReceivedAmount,
    billingStatus: existingOrder.billingStatus,
    billingLastTriedAt: existingOrder.billingLastTriedAt,
    billingError: existingOrder.billingError,
    charges: existingOrder.charges,
    fullCostAllocations: existingOrder.fullCostAllocations,
  };
}

async function searchRecentOrderPages(params: {
  accessToken: string;
  sellerId: string;
  limit: number;
}) {
  const results: unknown[] = [];
  const seenOrderIds = new Set<string>();
  let offset = 0;
  let latestPaging: Awaited<ReturnType<typeof searchRecentMeliOrders>>["paging"] = undefined;

  while (results.length < params.limit) {
    const pageLimit = Math.min(50, params.limit - results.length);
    const page = await searchRecentMeliOrders({
      accessToken: params.accessToken,
      sellerId: params.sellerId,
      limit: pageLimit,
      offset,
    });

    latestPaging = page.paging;
    if (page.results.length === 0) {
      break;
    }

    for (const order of page.results) {
      const orderId = getOrderId(order);
      const key = orderId || `offset:${offset}:index:${results.length}`;
      if (seenOrderIds.has(key)) {
        continue;
      }

      seenOrderIds.add(key);
      results.push(order);
      if (results.length >= params.limit) {
        break;
      }
    }

    offset += page.results.length;
    if (page.paging && offset >= page.paging.total) {
      break;
    }
  }

  return {
    results,
    paging: latestPaging
      ? {
          ...latestPaging,
          limit: params.limit,
          offset: 0,
        }
      : null,
  };
}

export async function syncSingleMeliOrder(params: {
  accountId: string;
  orderId: string;
}) {
  const account = await getFreshMarketplaceAccount(params.accountId);

  const order = await getMeliOrder(account.accessToken, params.orderId);
  const expandedOrders = await expandOrdersWithPacks({
    accessToken: account.accessToken,
    sellerId: account.externalAccountId,
    orders: [order],
  });
  const billingDetailsByOrderId = await getBillingDetailsByOrderId(
    account.accessToken,
    expandedOrders.map((entry) => getOrderId(entry)).filter(Boolean),
  );
  const paymentDetailsByPaymentId = await getPaymentDetailsByPaymentId(
    account.accessToken,
    expandedOrders,
  );
  const store = await readLocalStore();
  const normalizedOrders = await Promise.all(
    expandedOrders.map(async (entry) => {
      const shipmentId = getOrderShipmentId(entry);
      const shipment = shipmentId
        ? await safeGetShipment(account.accessToken, shipmentId)
        : undefined;
      const shipmentCosts = shipmentId
        ? await safeGetShipmentCosts(account.accessToken, shipmentId)
        : undefined;

      return normalizeMeliOrder({
        accountId: account.id,
        order: entry,
        shipment,
        shipmentCosts,
        store,
        billingDetails: billingDetailsByOrderId.get(getOrderId(entry)),
        paymentDetails: getOrderPaymentDetails(entry, paymentDetailsByPaymentId),
      });
    }),
  );
  const orders = includeStoredPackSiblings(store, normalizedOrders);
  allocatePackShipping(orders);

  await saveMarketplaceOrders(account.id, orders);
  return (
    orders.find((entry) => entry.externalOrderId === String(params.orderId)) ??
    normalizedOrders[0]
  );
}

export async function retryPendingMeliBilling(params: {
  accountId?: string;
  orderId?: string;
  limit?: number;
}) {
  const store = await readLocalStore();
  const candidateOrders = store.marketplaceOrders
    .filter((order) => order.channel === "mercado_libre")
    .filter((order) => !params.accountId || order.marketplaceAccountId === params.accountId)
    .filter((order) => !params.orderId || order.externalOrderId === params.orderId)
    .filter(
      (order) =>
        Boolean(params.orderId) ||
        order.netReceivedAmount === null ||
        order.billingStatus === "pending" ||
        order.billingStatus === "error" ||
        (isCancelledOrder(order.status) &&
          (order.grossAmount !== 0 ||
            order.netReceivedAmount !== 0 ||
            order.charges.some((charge) => charge.amount > 0))),
    )
    .sort((a, b) => {
      const left = new Date(a.orderedAt).getTime();
      const right = new Date(b.orderedAt).getTime();
      return (Number.isFinite(right) ? right : 0) - (Number.isFinite(left) ? left : 0);
    })
    .slice(0, params.limit ?? 100);

  const accountIds = [...new Set(candidateOrders.map((order) => order.marketplaceAccountId))];
  let updated = 0;
  let pending = 0;
  let errors = 0;

  for (const accountId of accountIds) {
    const account = await getFreshMarketplaceAccount(accountId);
    const ordersForAccount = candidateOrders.filter(
      (order) => order.marketplaceAccountId === accountId,
    );
    const freshSeedOrders = await Promise.all(
      ordersForAccount.map(async (existingOrder) => {
        const freshOrder = await safeGetOrder(
          account.accessToken,
          existingOrder.externalOrderId,
        );

        return freshOrder ?? existingOrder.raw;
      }),
    );
    const expandedOrders = await expandOrdersWithPacks(
      {
        accessToken: account.accessToken,
        sellerId: account.externalAccountId,
        orders: freshSeedOrders,
      },
    );
    const expandedOrderIds = expandedOrders.map(getOrderId).filter(Boolean);
    const candidateOrderIds = new Set(
      ordersForAccount.map((order) => order.externalOrderId),
    );
    const billingDetailsByOrderId = await getBillingDetailsByOrderId(
      account.accessToken,
      expandedOrderIds,
    );
    const paymentDetailsByPaymentId = await getPaymentDetailsByPaymentId(
      account.accessToken,
      expandedOrders,
    );
    const normalizedOrders = await Promise.all(
      expandedOrders.map(async (orderPayload) => {
        const orderId = getOrderId(orderPayload);
        const billingDetails = billingDetailsByOrderId.get(orderId);
        const existingOrder = store.marketplaceOrders.find(
          (storedOrder) =>
            storedOrder.marketplaceAccountId === account.id &&
            storedOrder.externalOrderId === orderId,
        );

        const shipmentId = getOrderShipmentId(orderPayload);
        const shipment = shipmentId
          ? await safeGetShipment(account.accessToken, shipmentId)
          : undefined;
        const shipmentCosts = shipmentId
          ? await safeGetShipmentCosts(account.accessToken, shipmentId)
          : undefined;
        const normalized = normalizeMeliOrder({
          accountId: account.id,
          order: orderPayload,
          store,
          shipment,
          shipmentCosts,
          billingDetails,
          paymentDetails: getOrderPaymentDetails(
            orderPayload,
            paymentDetailsByPaymentId,
          ),
          billingError: billingDetails ? null : "Billing aun no disponible en Mercado Libre",
        });

        if (
          !billingDetails &&
          normalized.netReceivedAmount === null &&
          existingOrder?.billingStatus === "confirmed"
        ) {
          return {
            ...existingOrder,
            billingLastTriedAt: new Date().toISOString(),
          };
        }

        if (candidateOrderIds.has(normalized.externalOrderId)) {
          if (normalized.netReceivedAmount === null) {
            pending += 1;
          } else {
            updated += 1;
          }

          if (normalized.billingStatus === "error") {
            errors += 1;
          }
        }

        return normalized;
      }),
    );
    const ordersToSave = includeStoredPackSiblings(store, normalizedOrders);
    allocatePackShipping(ordersToSave);

    await saveMarketplaceOrders(account.id, ordersToSave);
  }

  return {
    checked: candidateOrders.length,
    updated,
    pending,
    errors,
  };
}

const repairableAuditRules = new Set([
  "cancelled_money",
  "mixed_cancelled_pack",
  "possible_cancelled_not_marked",
  "net_mismatch",
  "old_pending_billing",
  "item_gross_mismatch",
]);

export async function repairMeliAuditOrders(params: {
  orderIds?: string[];
  limit?: number;
}) {
  const store = await readLocalStore();
  const requestedOrderIds = (params.orderIds ?? [])
    .map((orderId) => orderId.trim())
    .filter(Boolean);
  const isTargetedRepair = requestedOrderIds.length > 0;
  const beforeReport = isTargetedRepair
    ? null
    : buildSalesAuditReportFromStore(store);
  const candidateOrderIds =
    isTargetedRepair
      ? requestedOrderIds
      : beforeReport!.issues
          .filter((issue) => repairableAuditRules.has(issue.rule))
          .map((issue) => issue.orderId);
  const orderIds = [...new Set(candidateOrderIds)].slice(
    0,
    params.limit ?? (isTargetedRepair ? 1 : 10),
  );
  const failures: Array<{ orderId: string; error: string }> = [];
  let repaired = 0;

  for (const orderId of orderIds) {
    const existingOrder = store.marketplaceOrders.find(
      (order) => order.externalOrderId === orderId,
    );

    if (!existingOrder) {
      failures.push({ orderId, error: "La venta no existe en la base local." });
      continue;
    }

    try {
      await syncSingleMeliOrder({
        accountId: existingOrder.marketplaceAccountId,
        orderId,
      });
      repaired += 1;
    } catch (error) {
      failures.push({
        orderId,
        error:
          error instanceof Error
            ? error.message
            : "Mercado Libre no respondio la venta.",
      });
    }
  }

  let afterIssues: number | null = null;

  if (!isTargetedRepair) {
    await recalculateMarketplaceOrders();
    const afterStore = await readLocalStore();
    const afterReport = buildSalesAuditReportFromStore(afterStore);
    afterIssues = afterReport.issues.length;
  }

  return {
    checked: orderIds.length,
    repaired,
    failed: failures.length,
    failures,
    beforeIssues: beforeReport?.issues.length ?? null,
    afterIssues,
  };
}

async function expandOrdersWithPacks(params: {
  accessToken: string;
  sellerId: string;
  orders: unknown[];
}) {
  const byOrderId = new Map<string, unknown>();
  const groupHintByOrderId = new Map<string, { groupId: string; size: number }>();

  for (const order of params.orders) {
    const orderId = getOrderId(order);
    if (orderId) {
      byOrderId.set(orderId, order);
    }
  }

  const packIds = new Set(params.orders.map(getOrderPackId).filter(Boolean));

  for (const order of params.orders) {
    const shipmentId = getOrderShipmentId(order);
    if (!shipmentId) {
      continue;
    }

    try {
      const shipment = await getMeliShipment(params.accessToken, shipmentId);
      for (const packId of extractShipmentPackIds(shipment)) {
        packIds.add(packId);
      }
    } catch {
      // Shipment metadata is a secondary source for split-pack families.
    }
  }

  for (const packId of packIds) {
    try {
      const packExpansion = await getAllPackOrderIds(params.accessToken, packId);
      rememberOrderGroupHints(
        groupHintByOrderId,
        packExpansion.orderIds,
        packExpansion.groupId,
      );
      const packOrderIds = packExpansion.orderIds;
      const missingOrderIds = packOrderIds.filter(
        (orderId) => !byOrderId.has(orderId),
      );

      const missingOrders = await Promise.all(
        missingOrderIds.map((orderId) => getMeliOrder(params.accessToken, orderId)),
      );

      for (const order of missingOrders) {
        const orderId = getOrderId(order);
        if (orderId) {
          byOrderId.set(orderId, order);
        }
      }
    } catch {
      // If the pack endpoint is unavailable, keep the orders we already have.
    }
  }

  const searchedRelatedOrders = await searchRelatedOrdersByIdentifier({
    accessToken: params.accessToken,
    sellerId: params.sellerId,
    identifiers: buildRelatedOrderSearchIds(params.orders, packIds),
  });

  for (const result of searchedRelatedOrders) {
    const orderIds = result.orders.map(getOrderId).filter(Boolean);
    rememberOrderGroupHints(groupHintByOrderId, orderIds, result.identifier);

    for (const order of result.orders) {
      const orderId = getOrderId(order);
      if (orderId && !byOrderId.has(orderId)) {
        byOrderId.set(orderId, order);
      }
    }
  }

  const relatedOrders = await searchRelatedPackOrders(params);
  for (const order of relatedOrders) {
    const orderId = getOrderId(order);
    if (orderId && !byOrderId.has(orderId)) {
      byOrderId.set(orderId, order);
    }
  }

  return [...byOrderId.entries()].map(([orderId, order]) =>
    applyOrderRequestGroupHint(order, groupHintByOrderId.get(orderId)?.groupId),
  );
}

function buildRelatedOrderSearchIds(orders: unknown[], packIds: Set<string>) {
  const ids = new Set<string>();

  for (const packId of packIds) {
    addSearchIdentifier(ids, packId);
  }

  for (const order of orders) {
    for (const id of extractPackFamilyPackIds(order)) {
      addSearchIdentifier(ids, id);
    }

    for (const id of extractOrderRequestIds(order)) {
      addSearchIdentifier(ids, id);
    }
  }

  return [...ids].slice(0, 12);
}

function addSearchIdentifier(ids: Set<string>, value: string) {
  const identifier = String(value).trim();
  if (/^\d{8,}$/.test(identifier)) {
    ids.add(identifier);
  }
}

async function searchRelatedOrdersByIdentifier(params: {
  accessToken: string;
  sellerId: string;
  identifiers: string[];
}) {
  const results: Array<{ identifier: string; orders: unknown[] }> = [];

  for (const identifier of params.identifiers) {
    try {
      const page = await searchMeliOrders({
        accessToken: params.accessToken,
        sellerId: params.sellerId,
        q: identifier,
        sort: "date_desc",
        limit: 50,
        offset: 0,
      });
      const orders = (page.results ?? []).filter((order) =>
        referencesMeliIdentifier(order, identifier),
      );

      if (orders.length > 0) {
        results.push({ identifier, orders });
      }
    } catch {
      // Seller Center can resolve grouped sale ids even when pack endpoints are partial.
      // Keep sync resilient if this optional search path is unavailable.
    }
  }

  return results;
}

function rememberOrderGroupHints(
  hints: Map<string, { groupId: string; size: number }>,
  orderIds: string[],
  groupId: string,
) {
  const uniqueOrderIds = [...new Set(orderIds)];
  if (uniqueOrderIds.length < 2) {
    return;
  }

  for (const orderId of uniqueOrderIds) {
    const existing = hints.get(orderId);
    if (!existing || uniqueOrderIds.length > existing.size) {
      hints.set(orderId, { groupId, size: uniqueOrderIds.length });
    }
  }
}

function applyOrderRequestGroupHint(order: unknown, groupId: string | undefined) {
  if (!groupId || !order || typeof order !== "object" || Array.isArray(order)) {
    return order;
  }

  const record = order as Record<string, unknown>;
  const existingOrderRequest = record.order_request;
  if (
    existingOrderRequest &&
    typeof existingOrderRequest === "object" &&
    !Array.isArray(existingOrderRequest) &&
    (existingOrderRequest as { id?: unknown }).id
  ) {
    return order;
  }

  return {
    ...record,
    order_request: { id: groupId },
  };
}

function extractShipmentPackIds(shipment: unknown) {
  const ids = new Set<string>();
  const seen = new Set<object>();

  function visit(value: unknown) {
    if (!value || typeof value !== "object") {
      return;
    }

    if (seen.has(value)) {
      return;
    }
    seen.add(value);

    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    const record = value as Record<string, unknown>;
    for (const [key, child] of Object.entries(record)) {
      if (
        key === "pack_id" ||
        key === "packId" ||
        key === "family_pack_id" ||
        key === "familyPackId"
      ) {
        const packId = typeof child === "string" || typeof child === "number"
          ? String(child)
          : "";
        if (packId) {
          ids.add(packId);
        }
      }

      if (key === "pack" && child && typeof child === "object") {
        const pack = child as { id?: string | number; pack_id?: string | number };
        const packId = pack.id ?? pack.pack_id;
        if (packId) {
          ids.add(String(packId));
        }
      }

      visit(child);
    }
  }

  visit(shipment);
  return [...ids];
}

async function searchRelatedPackOrders(params: {
  accessToken: string;
  sellerId: string;
  orders: unknown[];
}) {
  const byOrderId = new Map<string, unknown>();

  for (const seedOrder of params.orders) {
    const packId = getOrderPackId(seedOrder);
    const closedAt = getOrderClosedAt(seedOrder);

    if (!packId || !closedAt) {
      continue;
    }

    const from = new Date(closedAt.getTime() - 5 * 60 * 1000).toISOString();
    const to = new Date(closedAt.getTime() + 5 * 60 * 1000).toISOString();

    try {
      const page = await searchMeliOrders({
        accessToken: params.accessToken,
        sellerId: params.sellerId,
        sort: "date_asc",
        limit: 50,
        offset: 0,
        dateClosedFrom: from,
        dateClosedTo: to,
      });

      for (const candidate of page.results ?? []) {
        if (
          getOrderPackId(candidate) !== packId &&
          !isLikelyRawSplitPackSibling(seedOrder, candidate)
        ) {
          continue;
        }

        const orderId = getOrderId(candidate);
        if (orderId) {
          byOrderId.set(orderId, candidate);
        }
      }
    } catch {
      // The pack endpoints remain the primary source; this is only a bounded fallback.
    }
  }

  return [...byOrderId.values()];
}

function isLikelyRawSplitPackSibling(left: unknown, right: unknown) {
  const leftOrderId = getOrderId(left);
  const rightOrderId = getOrderId(right);
  if (!leftOrderId || !rightOrderId || leftOrderId === rightOrderId) {
    return false;
  }

  const leftPackId = getOrderPackId(left);
  const rightPackId = getOrderPackId(right);
  if (!leftPackId || !rightPackId || leftPackId === rightPackId) {
    return false;
  }

  const leftPackNumber = Number(leftPackId);
  const rightPackNumber = Number(rightPackId);
  if (
    Number.isFinite(leftPackNumber) &&
    Number.isFinite(rightPackNumber) &&
    Math.abs(leftPackNumber - rightPackNumber) > 50
  ) {
    return false;
  }

  const leftClosedAt = getOrderClosedAt(left);
  const rightClosedAt = getOrderClosedAt(right);
  if (
    !leftClosedAt ||
    !rightClosedAt ||
    Math.abs(leftClosedAt.getTime() - rightClosedAt.getTime()) > 120_000
  ) {
    return false;
  }

  const leftShipmentId = getOrderShipmentId(left);
  const rightShipmentId = getOrderShipmentId(right);
  if (!leftShipmentId || !rightShipmentId || leftShipmentId === rightShipmentId) {
    return false;
  }

  return hasSharedRawOrderItemUnit(left, right) && hasCompatibleRawUnitCount(left, right);
}

function hasCompatibleRawUnitCount(left: unknown, right: unknown) {
  const leftUnits = getRawOrderItemUnits(left);
  const rightUnits = getRawOrderItemUnits(right);
  if (leftUnits <= 0 || rightUnits <= 0) {
    return false;
  }

  const smaller = Math.min(leftUnits, rightUnits);
  const larger = Math.max(leftUnits, rightUnits);
  return larger / smaller <= 3;
}

function getRawOrderItemUnits(order: unknown) {
  const candidate = order as {
    order_items?: Array<{
      quantity?: number | string | null;
    }>;
  };

  return (candidate.order_items ?? []).reduce((sum, item) => {
    const quantity = Number(item.quantity);
    return sum + (Number.isFinite(quantity) ? quantity : 0);
  }, 0);
}

function hasSharedRawOrderItemUnit(left: unknown, right: unknown) {
  const leftKeys = getRawOrderItemUnitKeys(left);
  if (leftKeys.size === 0) {
    return false;
  }

  for (const key of getRawOrderItemUnitKeys(right)) {
    if (leftKeys.has(key)) {
      return true;
    }
  }

  return false;
}

function getRawOrderItemUnitKeys(order: unknown) {
  const candidate = order as {
    order_items?: Array<{
      item?: { seller_sku?: string | null; seller_custom_field?: string | null; title?: string | null };
      unit_price?: number | string | null;
    }>;
  };

  return new Set(
    (candidate.order_items ?? [])
      .map((item) => {
        const label =
          (item.item?.seller_sku ?? item.item?.seller_custom_field ?? item.item?.title ?? "")
            .trim()
            .toLowerCase();
        const unitPrice = Number(item.unit_price);
        return label && Number.isFinite(unitPrice)
          ? `${label}:${roundMoney(unitPrice)}`
          : "";
      })
      .filter(Boolean),
  );
}

async function getAllPackOrderIds(accessToken: string, packId: string) {
  const orderIds = new Set<string>();
  const familyPackIds = new Set<string>();
  const pendingPackIds = [packId];
  const visitedPackIds = new Set<string>();

  while (pendingPackIds.length > 0 && visitedPackIds.size < 20) {
    const currentPackId = pendingPackIds.shift();
    if (!currentPackId || visitedPackIds.has(currentPackId)) {
      continue;
    }
    visitedPackIds.add(currentPackId);

    for (const loadPack of [
      () => getMeliPack(accessToken, currentPackId),
      () => getMeliMarketplacePackOrders(accessToken, currentPackId),
    ]) {
      try {
        const packPayload = await loadPack();
        for (const orderId of extractPackOrderIds(packPayload)) {
          orderIds.add(orderId);
        }
        for (const familyPackId of extractPackFamilyPackIds(packPayload)) {
          familyPackIds.add(familyPackId);
          if (!visitedPackIds.has(familyPackId)) {
            pendingPackIds.push(familyPackId);
          }
        }
      } catch {
        // Mercado Libre exposes pack relations through multiple endpoints.
        // One endpoint can fail or return a partial shape while the other works.
      }
    }
  }

  return {
    groupId: [...familyPackIds][0] ?? packId,
    orderIds: [...orderIds],
  };
}

function includeStoredPackSiblings(
  store: LocalStore,
  normalizedOrders: Array<ReturnType<typeof normalizeMeliOrder>>,
) {
  const ordersByKey = new Map(
    normalizedOrders.map((order) => [
      `${order.channel}:${order.externalOrderId}`,
      order,
    ]),
  );
  const groupKeys = new Set(
    normalizedOrders.map(getMarketplaceRealSaleKey).filter(Boolean),
  );
  const seedOrders = [...ordersByKey.values()];

  for (const existingOrder of store.marketplaceOrders) {
    const groupKey = getMarketplaceRealSaleKey(existingOrder);
    const isExactSibling = Boolean(groupKey && groupKeys.has(groupKey));
    const isLikelySplitSibling = seedOrders.some((order) =>
      isLikelyMeliSplitShipmentSibling(order, existingOrder),
    );

    if (!isExactSibling && !isLikelySplitSibling) {
      continue;
    }

    const orderKey = `${existingOrder.channel}:${existingOrder.externalOrderId}`;
    if (!ordersByKey.has(orderKey)) {
      ordersByKey.set(orderKey, structuredClone(existingOrder));
    }
  }

  return [...ordersByKey.values()];
}

function allocatePackShipping(orders: Array<ReturnType<typeof normalizeMeliOrder>>) {
  for (const { orders: group } of groupMarketplaceOrdersIntoRealSales(orders)) {
    if (group.length < 2) {
      continue;
    }

    const shippingCharges = group.flatMap((order) =>
      order.charges.filter((charge) => charge.type === "shipping"),
    );

    if (shippingCharges.length === 0) {
      continue;
    }

    const packageShippingTotal = getPackageShippingTotal(shippingCharges);
    if (packageShippingTotal <= 0) {
      continue;
    }

    const totalUnits = group.reduce(
      (sum, order) =>
        sum +
        order.items.reduce((itemSum, item) => itemSum + Math.max(0, item.quantity), 0),
      0,
    );

    if (totalUnits <= 0) {
      continue;
    }

    for (const order of group) {
      const orderUnits = order.items.reduce(
        (sum, item) => sum + Math.max(0, item.quantity),
        0,
      );
      const previousShipping = getOrderShippingAmount(order);
      const allocatedAmount = roundMoney(
        (packageShippingTotal * orderUnits) / totalUnits,
      );
      setOrderShippingCharge(order, allocatedAmount);

      if (order.netReceivedAmount !== null) {
        order.netReceivedAmount = roundMoney(
          Math.max(0, order.netReceivedAmount + previousShipping - allocatedAmount),
        );
      }
    }
  }
}

function getPackageShippingTotal(
  shippingCharges: Array<{ amount: number; source: string }>,
) {
  const freshCharges = shippingCharges.filter(
    (charge) => !charge.source.includes("pack_allocated"),
  );
  const chargesToRead = freshCharges.length > 0 ? freshCharges : shippingCharges;
  const amounts = chargesToRead
    .map((charge) => charge.amount)
    .filter((amount) => amount > 0);

  if (amounts.length === 0) {
    return 0;
  }

  const firstAmount = amounts[0] ?? 0;
  const allSame = amounts.every((amount) => Math.abs(amount - firstAmount) < 0.01);

  return roundMoney(allSame ? firstAmount : amounts.reduce((sum, amount) => sum + amount, 0));
}

function getOrderShippingAmount(order: ReturnType<typeof normalizeMeliOrder>) {
  return order.charges
    .filter((charge) => charge.type === "shipping")
    .reduce((sum, charge) => sum + charge.amount, 0);
}

function setOrderShippingCharge(
  order: ReturnType<typeof normalizeMeliOrder>,
  amount: number,
) {
  const existing = order.charges.find((charge) => charge.type === "shipping");
  order.charges = order.charges.filter((charge) => charge.type !== "shipping");
  order.charges.push({
    type: "shipping",
    amount,
    source: existing?.source.includes("pack_allocated")
      ? existing.source
      : `${existing?.source ?? "meli"}:pack_allocated`,
  });
}

export async function syncMeliFullStock(params: {
  accountId: string;
  maxItems?: number;
}) {
  const account = await getFreshMarketplaceAccount(params.accountId);
  const store = await readLocalStore();
  const snapshot = await collectMeliFullStockSnapshot({
    accessToken: account.accessToken,
    sellerId: account.externalAccountId,
    store,
    maxItems: params.maxItems,
  });

  const result = await replaceFullInventory({
    accountId: account.id,
    balances: snapshot.balances,
    totalFulfillmentUnits: snapshot.uniqueFulfillmentUnits,
    mappedUnits: snapshot.mappedUnits,
    items: snapshot.uniqueRows,
    listingImages: snapshot.listingImages,
    unmappedItems: snapshot.unmappedItems,
  });

  return {
    accountId: account.id,
    scannedItems: snapshot.scannedItems,
    fullListings: snapshot.fullListings,
    mappedSkus: snapshot.balances.length,
    totalFulfillmentUnits: snapshot.uniqueFulfillmentUnits,
    duplicatedFulfillmentUnits: snapshot.totalFulfillmentUnits,
    mappedUnits: snapshot.mappedUnits,
    unmappedItems: snapshot.unmappedItems,
    syncedAt: result.syncedAt,
  };
}

export async function auditMeliFullStock(params: {
  accountId: string;
  maxItems?: number;
}) {
  const account = await getFreshMarketplaceAccount(params.accountId);
  const store = await readLocalStore();
  const snapshot = await collectMeliFullStockSnapshot({
    accessToken: account.accessToken,
    sellerId: account.externalAccountId,
    store,
    maxItems: params.maxItems,
  });

  const result = await saveFullStockAudit({
    accountId: account.id,
    totalFulfillmentUnits: snapshot.uniqueFulfillmentUnits,
    mappedUnits: snapshot.mappedUnits,
    items: snapshot.uniqueRows,
    listingImages: snapshot.listingImages,
    unmappedItems: snapshot.unmappedItems,
  });

  return {
    accountId: account.id,
    scannedItems: snapshot.scannedItems,
    fullListings: snapshot.fullListings,
    mappedSkus: snapshot.balances.length,
    totalFulfillmentUnits: snapshot.uniqueFulfillmentUnits,
    duplicatedFulfillmentUnits: snapshot.totalFulfillmentUnits,
    mappedUnits: snapshot.mappedUnits,
    unmappedItems: snapshot.unmappedItems,
    auditedAt: result.auditedAt,
  };
}

export async function refreshMeliListingImages(params: {
  accountId: string;
  maxItems?: number;
}) {
  const account = await getFreshMarketplaceAccount(params.accountId);
  const itemIds = await listAllSellerItemIds({
    accessToken: account.accessToken,
    sellerId: account.externalAccountId,
    maxItems: params.maxItems ?? 1000,
  });
  const listingImagesByKey = new Map<string, LocalMarketplaceListingImage>();

  for (const batch of chunk(itemIds, 20)) {
    const items = await getMeliItems(account.accessToken, batch);

    for (const item of items) {
      if (item.code !== 200) {
        continue;
      }

      for (const row of extractListingRows(item.body)) {
        const listingImage: LocalMarketplaceListingImage = {
          onlineSku: row.externalSku,
          title: row.title,
          listingId: row.listingId,
          variationId: row.variationId,
          imageUrl: row.imageUrl,
        };
        listingImagesByKey.set(buildListingImageKey(listingImage), listingImage);
      }
    }
  }

  const listingImages = [...listingImagesByKey.values()];
  const saved = await saveMarketplaceListingImages({
    accountId: account.id,
    listingImages,
  });

  return {
    accountId: account.id,
    scannedItems: itemIds.length,
    listingImages: listingImages.length,
    updatedOnlineSkus: saved.updatedOnlineSkus,
    refreshedAt: new Date().toISOString(),
  };
}

async function collectMeliFullStockSnapshot(params: {
  accessToken: string;
  sellerId: string;
  store: LocalStore;
  maxItems?: number;
}) {
  const { accessToken, sellerId, store } = params;
  const mappingBySku = new Map(
    store.onlineSkus.map((sku) => [normalizeSkuKey(sku.onlineSku), sku]),
  );
  const mappingByListingKey = buildListingMappingFromOrders(store, mappingBySku);
  const itemIds = await listAllSellerItemIds({
    accessToken,
    sellerId,
    maxItems: params.maxItems ?? 1000,
  });
  const fullRows: LocalFullStockSnapshotItem[] = [];
  const listingImagesByKey = new Map<string, LocalMarketplaceListingImage>();

  for (const batch of chunk(itemIds, 20)) {
    const items = await getMeliItems(accessToken, batch);

    for (const item of items) {
      if (item.code !== 200) {
        continue;
      }

      const listingRows = extractListingRows(item.body);
      for (const row of listingRows) {
        const listingImage: LocalMarketplaceListingImage = {
          onlineSku: row.externalSku,
          title: row.title,
          listingId: row.listingId,
          variationId: row.variationId,
          imageUrl: row.imageUrl,
        };
        listingImagesByKey.set(buildListingImageKey(listingImage), listingImage);
      }

      const rows = listingRows.filter(
        (row): row is MeliInventoryListingRow => Boolean(row.inventoryId),
      );

      for (const row of rows) {
        const stock = await safeGetFulfillmentStock(
          accessToken,
          row.inventoryId,
        );

        if (!stock) {
          continue;
        }

        const availableQuantity = toNumber(stock.available_quantity);
        const total = toNumber(stock.total) || availableQuantity;
        const notAvailableQuantity = toNumber(stock.not_available_quantity);
        const notAvailableDetail = (stock.not_available_detail ?? [])
          .map((detail) => ({
            status: String(detail.status ?? "unknown"),
            quantity: toNumber(detail.quantity),
          }))
          .filter((detail) => detail.quantity > 0);
        const mapping =
          mappingBySku.get(normalizeSkuKey(row.externalSku)) ??
          mappingByListingKey.get(row.listingId) ??
          (row.variationId
            ? mappingByListingKey.get(`${row.listingId}_${row.variationId}`)
            : undefined);
        const components =
          mapping?.components
            .map((component) => ({
              masterSku: component.masterSku,
              quantityRequired: component.quantityRequired,
              availableConsumedQuantity: availableQuantity * component.quantityRequired,
              totalConsumedQuantity: total * component.quantityRequired,
              notAvailableConsumedQuantity:
                notAvailableQuantity * component.quantityRequired,
            }))
            .filter(
              (component) =>
                component.masterSku &&
                Number.isFinite(component.quantityRequired) &&
                component.quantityRequired > 0,
            ) ?? [];
        const firstComponent = components[0] ?? null;
        const componentQuantityRequired = firstComponent?.quantityRequired ?? null;

        fullRows.push({
          ...row,
          availableQuantity,
          total,
          notAvailableQuantity,
          notAvailableDetail,
          masterSku: firstComponent?.masterSku ?? null,
          componentQuantityRequired,
          availableConsumedQuantity:
            firstComponent?.availableConsumedQuantity ?? null,
          totalConsumedQuantity: firstComponent?.totalConsumedQuantity ?? null,
          notAvailableConsumedQuantity:
            firstComponent?.notAvailableConsumedQuantity ?? null,
          components: components.length > 0 ? components : undefined,
        });
      }
    }
  }

  const balancesByMasterSku = new Map<string, number>();
  const unmappedItems = [];
  const uniqueRowsByInventoryId = new Map<string, LocalFullStockSnapshotItem>();

  for (const row of fullRows) {
    const existing = uniqueRowsByInventoryId.get(row.inventoryId);
    if (!existing || (!existing.masterSku && row.masterSku)) {
      uniqueRowsByInventoryId.set(row.inventoryId, row);
    }
  }

  const uniqueRows = [...uniqueRowsByInventoryId.values()];

  for (const row of uniqueRows) {
    const rowComponents =
      row.components && row.components.length > 0
        ? row.components.map((component) => ({
            masterSku: component.masterSku,
            availableConsumedQuantity: component.availableConsumedQuantity,
          }))
        : row.masterSku && row.availableConsumedQuantity !== null
          ? [
              {
                masterSku: row.masterSku,
                availableConsumedQuantity: row.availableConsumedQuantity,
              },
            ]
          : [];

    if (rowComponents.length === 0) {
        unmappedItems.push({
          externalSku: row.externalSku,
          title: row.title,
          imageUrl: row.imageUrl,
          inventoryId: row.inventoryId,
          availableQuantity: row.availableQuantity,
          total: row.total,
        notAvailableQuantity: row.notAvailableQuantity,
        notAvailableDetail: row.notAvailableDetail,
      });
      continue;
    }

    for (const component of rowComponents) {
      balancesByMasterSku.set(
        component.masterSku,
        (balancesByMasterSku.get(component.masterSku) ?? 0) +
          component.availableConsumedQuantity,
      );
    }
  }

  const balances = [...balancesByMasterSku.entries()].map(
    ([masterSku, physicalQuantity]) => ({
      masterSku,
      physicalQuantity,
    }),
  );
  const mappedUnits = balances.reduce(
    (sum, balance) => sum + balance.physicalQuantity,
    0,
  );
  const totalFulfillmentUnits = fullRows.reduce(
    (sum, row) => sum + row.availableQuantity,
    0,
  );
  const uniqueFulfillmentUnits = uniqueRows.reduce(
    (sum, row) => sum + row.availableQuantity,
    0,
  );
  return {
    scannedItems: itemIds.length,
    fullListings: fullRows.length,
    balances,
    uniqueRows,
    listingImages: [...listingImagesByKey.values()],
    uniqueFulfillmentUnits,
    totalFulfillmentUnits,
    mappedUnits,
    unmappedItems,
  };
}

async function getFreshMarketplaceAccount(accountId: string) {
  let account = await getMarketplaceAccount(accountId);
  if (!account) {
    throw new Error("Mercado Libre account not found");
  }

  if (tokenNeedsRefresh(account.tokenExpiresAt)) {
    const refreshed = await refreshMeliToken(account.refreshToken);
    account = await upsertMarketplaceAccount({
      ...account,
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token,
      tokenExpiresAt: new Date(
        Date.now() + refreshed.expires_in * 1000,
      ).toISOString(),
      status: "connected",
    });
  }

  return account;
}

function getOrderShipmentId(order: unknown) {
  const candidate = order as { shipping?: { id?: string | number } };
  return candidate.shipping?.id ? String(candidate.shipping.id) : null;
}

function getOrderId(order: unknown) {
  const candidate = order as { id?: string | number };
  return candidate.id ? String(candidate.id) : "";
}

function getOrderPackId(order: unknown) {
  const candidate = order as {
    pack_id?: string | number | null;
    packId?: string | number | null;
    pack?: { id?: string | number | null; pack_id?: string | number | null } | null;
  };
  const packId =
    candidate.pack_id ??
    candidate.packId ??
    candidate.pack?.id ??
    candidate.pack?.pack_id;
  return packId ? String(packId) : "";
}

function getOrderClosedAt(order: unknown) {
  const candidate = order as {
    date_closed?: string | null;
    date_created?: string | null;
  };
  const rawDate = candidate.date_closed ?? candidate.date_created;
  if (!rawDate) {
    return null;
  }

  const date = new Date(rawDate);
  return Number.isFinite(date.getTime()) ? date : null;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function getBillingDetailsByOrderId(accessToken: string, orderIds: string[]) {
  const detailsByOrderId = new Map<string, unknown>();
  const uniqueOrderIds = [...new Set(orderIds.filter(Boolean))];

  for (const batch of chunk(uniqueOrderIds, 20)) {
    try {
      const payload = await getMeliOrderBillingDetails(accessToken, batch);
      const response = payload as {
        results?: Array<{ order_id?: string | number }>;
      };

      for (const result of response.results ?? []) {
        if (result.order_id) {
          detailsByOrderId.set(String(result.order_id), result);
        }
      }
    } catch {
      // Billing details can lag behind the order. Fallback normalization still works.
    }
  }

  return detailsByOrderId;
}

async function getPaymentDetailsByPaymentId(accessToken: string, orders: unknown[]) {
  const detailsByPaymentId = new Map<string, unknown>();
  const paymentIds = [
    ...new Set(orders.flatMap((order) => getMeliPaymentIds(order))),
  ];

  for (const paymentId of paymentIds) {
    const detail = await safeGetPayment(accessToken, paymentId);
    if (detail) {
      detailsByPaymentId.set(paymentId, detail);
    }
  }

  return detailsByPaymentId;
}

function getOrderPaymentDetails(
  order: unknown,
  detailsByPaymentId: Map<string, unknown>,
) {
  return getMeliPaymentIds(order)
    .map((paymentId) => detailsByPaymentId.get(paymentId))
    .filter((detail): detail is unknown => Boolean(detail));
}

function buildListingMappingFromOrders(
  store: LocalStore,
  mappingBySku: Map<string, LocalStore["onlineSkus"][number]>,
) {
  const mappingByListingKey = new Map<string, LocalStore["onlineSkus"][number]>();

  for (const order of store.marketplaceOrders) {
    const rawOrder = order.raw as {
      order_items?: Array<{
        item?: {
          id?: string;
          seller_sku?: string | null;
          seller_custom_field?: string | null;
          variation_id?: number | string | null;
        };
      }>;
    };

    for (const item of rawOrder.order_items ?? []) {
      const listingId = item.item?.id ? String(item.item.id) : "";
      const sellerSku = item.item?.seller_sku ?? item.item?.seller_custom_field;
      const mapping = sellerSku
        ? mappingBySku.get(normalizeSkuKey(sellerSku))
        : undefined;

      if (!listingId || !mapping) {
        continue;
      }

      mappingByListingKey.set(listingId, mapping);

      if (item.item?.variation_id) {
        mappingByListingKey.set(
          `${listingId}_${String(item.item.variation_id)}`,
          mapping,
        );
      }
    }
  }

  return mappingByListingKey;
}

async function safeGetShipment(accessToken: string, shipmentId: string) {
  try {
    return await getMeliShipment(accessToken, shipmentId);
  } catch {
    return undefined;
  }
}

async function safeGetOrder(accessToken: string, orderId: string) {
  try {
    return await getMeliOrder(accessToken, orderId);
  } catch {
    return undefined;
  }
}

async function safeGetPayment(accessToken: string, paymentId: string) {
  try {
    return await getMeliPayment(accessToken, paymentId);
  } catch {
    return undefined;
  }
}

async function safeGetShipmentCosts(accessToken: string, shipmentId: string) {
  try {
    return await getMeliShipmentCosts(accessToken, shipmentId);
  } catch {
    return undefined;
  }
}

async function safeGetFulfillmentStock(accessToken: string, inventoryId: string) {
  try {
    return await getMeliFulfillmentStock(accessToken, inventoryId);
  } catch {
    return null;
  }
}

async function listAllSellerItemIds(params: {
  accessToken: string;
  sellerId: string;
  maxItems: number;
}) {
  const ids: string[] = [];
  let offset = 0;
  const limit = 50;

  while (ids.length < params.maxItems) {
    const response = await searchMeliSellerItems({
      accessToken: params.accessToken,
      sellerId: params.sellerId,
      limit,
      offset,
    });

    ids.push(...response.results.map(String));

    if (
      response.results.length === 0 ||
      ids.length >= (response.paging?.total ?? 0)
    ) {
      break;
    }

    offset += limit;
  }

  return ids.slice(0, params.maxItems);
}

type MeliCatalogAttribute = {
  id?: string;
  name?: string;
  value_name?: string;
};

type MeliCatalogPicture = {
  id?: string;
  secure_url?: string | null;
  url?: string | null;
};

type MeliCatalogVariation = {
  id?: number | string;
  seller_sku?: string | null;
  seller_custom_field?: string | null;
  inventory_id?: string | null;
  thumbnail?: string | null;
  secure_thumbnail?: string | null;
  picture_ids?: Array<string | number>;
  attribute_combinations?: MeliCatalogAttribute[];
  attributes?: MeliCatalogAttribute[];
};

type MeliCatalogItem = {
  id?: string;
  title?: string;
  thumbnail?: string | null;
  secure_thumbnail?: string | null;
  pictures?: MeliCatalogPicture[];
  seller_custom_field?: string | null;
  inventory_id?: string | null;
  attributes?: MeliCatalogAttribute[];
  variations?: MeliCatalogVariation[];
};

type MeliListingRow = {
  externalSku: string;
  listingId: string;
  variationId: string | null;
  title: string;
  imageUrl?: string | null;
  inventoryId?: string | null;
};

type MeliInventoryListingRow = MeliListingRow & {
  inventoryId: string;
};

function extractListingRows(item: unknown): MeliListingRow[] {
  const body = item as MeliCatalogItem;
  const rows: MeliListingRow[] = [];

  const listingId = body.id ?? "";
  const baseTitle = body.title ?? body.seller_custom_field ?? body.id ?? "";
  const baseExternalSku =
    getSellerSkuFromAttributes(body.attributes) ??
    body.seller_custom_field ??
    body.id ??
    body.inventory_id ??
    "";
  const hasVariations = (body.variations?.length ?? 0) > 0;

  if (baseExternalSku && (!hasVariations || body.inventory_id)) {
    rows.push({
      externalSku: baseExternalSku,
      listingId,
      variationId: null,
      title: baseTitle || baseExternalSku,
      imageUrl: getMeliItemImageUrl(body),
      inventoryId: body.inventory_id ?? null,
    });
  }

  for (const variation of body.variations ?? []) {
    const variationId = variation.id ? String(variation.id) : null;
    const externalSku =
      getSellerSkuFromAttributes(variation.attributes) ??
      getSellerSkuFromAttributes(variation.attribute_combinations) ??
      variation.seller_sku ??
      variation.seller_custom_field ??
      body.seller_custom_field ??
      (body.id && variation.id ? `${body.id}_${variation.id}` : "");

    if (!externalSku) {
      continue;
    }

    rows.push({
      externalSku,
      listingId,
      variationId,
      title: `${body.title ?? body.id ?? externalSku}${formatVariationLabel(
        variation.attribute_combinations,
      )}`,
      imageUrl: getMeliItemImageUrl(body, variation),
      inventoryId: variation.inventory_id ?? null,
    });
  }

  return rows;
}

function getMeliItemImageUrl(
  item: MeliCatalogItem,
  variation?: MeliCatalogVariation,
) {
  const variationPictureId = variation?.picture_ids?.map(String).find(Boolean);
  const variationPicture = variationPictureId
    ? item.pictures?.find((picture) => picture.id === variationPictureId)
    : null;

  return (
    normalizeImageUrl(variation?.secure_thumbnail) ??
    normalizeImageUrl(variation?.thumbnail) ??
    normalizeImageUrl(variationPicture?.secure_url) ??
    normalizeImageUrl(variationPicture?.url) ??
    normalizeImageUrl(item.secure_thumbnail) ??
    normalizeImageUrl(item.thumbnail) ??
    normalizeImageUrl(item.pictures?.[0]?.secure_url) ??
    normalizeImageUrl(item.pictures?.[0]?.url)
  );
}

function normalizeImageUrl(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const url = value.trim();
  if (!url) {
    return null;
  }

  if (url.startsWith("http://")) {
    return `https://${url.slice("http://".length)}`;
  }

  return url.startsWith("https://") ? url : null;
}

function buildListingImageKey(listing: LocalMarketplaceListingImage) {
  return [
    normalizeSkuKey(listing.onlineSku),
    listing.listingId,
    listing.variationId ?? "",
  ].join(":");
}

function getSellerSkuFromAttributes(
  attributes:
    | Array<{ id?: string; name?: string; value_name?: string }>
    | undefined,
) {
  const sellerSku = attributes?.find(
    (attribute) => {
      const id = normalizeSkuKey(attribute.id);
      const name = normalizeSkuKey(attribute.name);

      return (
        id === "seller_sku" ||
        id === "seller sku" ||
        name === "sku" ||
        name.includes("seller sku")
      );
    },
  );

  return sellerSku?.value_name ?? null;
}

function formatVariationLabel(
  attributes:
    | Array<{ name?: string; value_name?: string }>
    | undefined,
) {
  const label = (attributes ?? [])
    .map((attribute) => attribute.value_name ?? attribute.name)
    .filter(Boolean)
    .join(" / ");

  return label ? ` (${label})` : "";
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function toNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
