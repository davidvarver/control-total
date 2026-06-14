import { cache } from "react";
import type { Prisma } from "@prisma/client";
import {
  fromRelationalId,
  readLocalStore,
  type LocalFullBillingCharge,
  type LocalMarketplaceOrder,
  type LocalStore,
} from "./local-store";
import { getCurrentUser } from "./auth-store";
import { createEmptyStore } from "./empty-store";
import { prisma } from "./prisma";
import {
  calculateExpenseAmountForMonth,
  normalizeExpenseFrequency,
} from "../domain/expenses";
import { normalizeSkuKey } from "../domain/sku-match";
import {
  getMarketplaceRealSaleKey,
  getMarketplaceSaleDisplayId,
  groupMarketplaceOrdersIntoRealSales,
  marketplaceOrderMatchesIdentifier,
  marketplaceRealSaleMatchesIdentifier,
} from "../meli/order-group";
import { isCancelledOrder, needsCancelledBillingReview } from "./order-status";
import { buildStockCommitments } from "./stock-commitments";
import { hasDatabaseUrl } from "./database-url";

const defaultReportOrderLimit = 5_000;
const defaultSalesReportOrderLimit = 1_500;
const inventoryReportOrderLimit = 1_500;
const businessTimeZone = "America/Mexico_City";

export type ReportOrderDateRange = {
  orderedFrom?: string | null;
  orderedTo?: string | null;
};

type ReportOrderFilter = ReportOrderDateRange & {
  query?: string | null;
  status?: string | null;
};

type ReportMarketplaceOrder = Omit<
  LocalMarketplaceOrder,
  "items" | "charges" | "grossAmount"
> & {
  accountAlias: string;
  externalOrderIds: string[];
  marketplaceSaleId: string;
  realSaleKey: string;
  internalOrderCount: number;
  isCancelled: boolean;
  grossAmount: number;
  totalCharges: number;
  estimatedReceived: number;
  receivedAmount: number | null;
  isReceivedPending: boolean;
  needsCancelledBillingReview: boolean;
  additionalCosts: number;
  productCost: number;
  productGrossProfit: number;
  netProfit: number;
  marginPercent: number;
  missingCostItems: number;
  unmappedItems: number;
  charges: LocalMarketplaceOrder["charges"];
  items: ReportMarketplaceOrderItem[];
  summaryItems: ReportMarketplaceOrderItem[];
};

type ReportMarketplaceOrderItem = LocalMarketplaceOrder["items"][number] & {
  sourceOrderId?: string;
  sourceOrderIds?: string[];
  warehouseName?: string;
  imageUrl?: string | null;
  isCancelled: boolean;
  activeQuantity: number;
  cancelledQuantity: number;
  cancelledLineGross: number;
  productCost: number;
  averageUnitCost: number;
  lineGross: number;
  isIncomplete: boolean;
};

export const readReportStore = cache(async function readReportStore(
  orderLimit = getReportOrderLimit(),
  orderFilter?: ReportOrderFilter,
) {
  const fallbackStore = await readReportBaseStore();

  if (!hasDatabaseUrl()) {
    return {
      ...fallbackStore,
      marketplaceOrders: limitReportOrders(
        filterOrdersByReportFilter(fallbackStore.marketplaceOrders, orderFilter),
        orderLimit,
      ),
    };
  }

  try {
    const [
      products,
      warehouses,
      onlineSkus,
      marketplaceAccounts,
      inventoryBalances,
      inventoryMovements,
      marketplaceOrders,
    ] = await Promise.all([
      prisma.masterProduct.findMany({
        where: { organizationId: fallbackStore.organization.id },
        include: { costSnapshots: { orderBy: { calculatedAt: "desc" }, take: 1 } },
      }),
      prisma.warehouse.findMany({
        where: { organizationId: fallbackStore.organization.id, isActive: true },
      }),
      prisma.onlineSku.findMany({
        where: { organizationId: fallbackStore.organization.id, isActive: true },
        include: {
          marketplaceAccount: true,
          components: { include: { masterProduct: true } },
        },
      }),
      prisma.marketplaceAccount.findMany({
        where: { organizationId: fallbackStore.organization.id, isActive: true },
      }),
      prisma.inventoryBalance.findMany({
        where: { organizationId: fallbackStore.organization.id },
        include: { masterProduct: true },
      }),
      prisma.inventoryMovement.findMany({
        where: { organizationId: fallbackStore.organization.id },
        include: { masterProduct: true },
        orderBy: { createdAt: "desc" },
        take: 250,
      }),
      readMarketplaceOrdersForReports(fallbackStore, orderLimit, orderFilter),
    ]);

    const physicalQuantityByProductId = new Map<string, number>();
    for (const balance of inventoryBalances) {
      physicalQuantityByProductId.set(
        balance.masterProductId,
        (physicalQuantityByProductId.get(balance.masterProductId) ?? 0) +
          decimalToNumber(balance.physicalQuantity),
      );
    }

    const persistedProductKeys = new Set(
      fallbackStore.products.map((product) => normalizeSkuKey(product.masterSku)),
    );
    const visibleProducts = products.filter(
      (product) =>
        product.isActive || persistedProductKeys.has(normalizeSkuKey(product.masterSku)),
    );
    const fallbackOnlineSkuBySku = new Map(
      fallbackStore.onlineSkus.map((sku) => [
        `${sku.channel}:${normalizeSkuKey(sku.onlineSku)}`,
        sku,
      ]),
    );
    const fallbackOnlineSkuByListing = new Map(
      fallbackStore.onlineSkus
        .filter((sku) => Boolean(sku.externalListingId))
        .map((sku) => [`${sku.channel}:${sku.externalListingId}`, sku]),
    );

    return {
      ...fallbackStore,
      warehouses: warehouses.map((warehouse) => ({
        id: fromRelationalId(fallbackStore.organization.id, warehouse.id),
        name: warehouse.name,
        type: warehouse.type,
        channel: warehouse.channel,
        isSellable: warehouse.isSellable,
        isExclusive: warehouse.isExclusive,
      })),
      products: visibleProducts.map((product) => {
        const fallbackProduct = fallbackStore.products.find(
          (entry) => normalizeSkuKey(entry.masterSku) === normalizeSkuKey(product.masterSku),
        );
        const physicalQuantity = physicalQuantityByProductId.get(product.id) ?? 0;

        return {
          id: product.id,
          masterSku: product.masterSku,
          name: product.name,
          currentStock: fallbackProduct?.currentStock ?? physicalQuantity,
          totalIngresado: fallbackProduct?.totalIngresado ?? 0,
          totalVendido: fallbackProduct?.totalVendido ?? 0,
          targetInventoryDays: product.targetInventoryDays,
          averageUnitCost:
            product.costSnapshots[0]?.averageCost !== undefined
              ? decimalToNumber(product.costSnapshots[0].averageCost)
              : (fallbackProduct?.averageUnitCost ?? 0),
          isActive: product.isActive,
        };
      }),
      onlineSkus: onlineSkus.map((sku) => {
        const fallbackSku =
          fallbackOnlineSkuBySku.get(`${sku.channel}:${normalizeSkuKey(sku.onlineSku)}`) ??
          (sku.externalListingId
            ? fallbackOnlineSkuByListing.get(`${sku.channel}:${sku.externalListingId}`)
            : undefined);

        return {
          id: fromRelationalId(fallbackStore.organization.id, sku.id),
          onlineSku: sku.onlineSku,
          title: sku.title ?? sku.onlineSku,
          imageUrl: fallbackSku?.imageUrl ?? null,
          channel: sku.channel,
          marketplaceAccount: sku.marketplaceAccountId
            ? fromRelationalId(fallbackStore.organization.id, sku.marketplaceAccountId)
            : "",
          externalListingId: sku.externalListingId,
          safetyBufferUnits: sku.safetyBufferUnits,
          components: sku.components.map((component) => ({
            masterSku: component.masterProduct.masterSku,
            quantityRequired: decimalToNumber(component.quantityRequired),
          })),
        };
      }),
      marketplaceAccounts: marketplaceAccounts.map((account) => {
        const settings = normalizeJsonObject(account.settings);
        return {
          id: fromRelationalId(fallbackStore.organization.id, account.id),
          channel: "mercado_libre" as const,
          alias: account.alias,
          externalAccountId: account.externalAccountId ?? account.alias,
          nickname: stringFromJson(settings.nickname),
          siteId: stringFromJson(settings.siteId),
          accessToken: "",
          refreshToken: "",
          tokenExpiresAt: stringFromJson(settings.tokenExpiresAt) ?? new Date(0).toISOString(),
          lastSyncAt: account.lastSyncAt?.toISOString(),
          salesBackfill: normalizeSalesBackfill(settings.salesBackfill),
          salesAutomation: normalizeSalesAutomation(settings.salesAutomation),
          status: account.authStatus === "connected" ? "connected" as const : "error" as const,
        };
      }),
      marketplaceOrders,
      inventoryBalances: inventoryBalances.map((balance) => ({
        masterSku: balance.masterProduct.masterSku,
        warehouseId: fromRelationalId(fallbackStore.organization.id, balance.warehouseId),
        physicalQuantity: decimalToNumber(balance.physicalQuantity),
        reservedQuantity: decimalToNumber(balance.reservedQuantity),
        blockedQuantity: decimalToNumber(balance.blockedQuantity),
      })),
      inventoryMovements: inventoryMovements.map((movement) => ({
        id: fromRelationalId(fallbackStore.organization.id, movement.id),
        date: movement.createdAt.toISOString(),
        type: normalizeInventoryMovementType(movement.movementType),
        masterSku: movement.masterProduct.masterSku,
        warehouseId: fromRelationalId(fallbackStore.organization.id, movement.warehouseId),
        quantity: decimalToNumber(movement.quantity),
        reference: movement.referenceId ?? movement.referenceType ?? movement.id,
        note: movement.notes ?? movement.reason ?? undefined,
      })),
    };
  } catch (error) {
    console.error("[Reports] Failed to build relational report store, falling back to LocalDataStore:", error);
    return fallbackStore;
  }
});

async function readReportBaseStore() {
  if (!hasDatabaseUrl()) {
    return readLocalStore();
  }

  const organization = await resolveReportOrganization();
  if (organization.id === "org_public") {
    return readLocalStore();
  }

  try {
    const [storeRows, dbExpenses, dbLayers] = await Promise.all([
      prisma.$queryRaw<Array<{ payload: unknown; organizationName: string }>>`
        SELECT
          l.payload - 'marketplaceOrders' - 'sales' - 'integrationEvents' AS payload,
          o.name AS "organizationName"
        FROM "LocalDataStore" l
        JOIN "Organization" o ON o.id = l."organizationId"
        WHERE l."organizationId" = ${organization.id}
        LIMIT 1
      `,
      prisma.operatingExpense.findMany({
        where: { organizationId: organization.id },
      }),
      prisma.fullInventoryLayer.findMany({
        where: { organizationId: organization.id },
      }),
    ]);
    const row = storeRows[0];
    const payload = normalizeJsonObject(row?.payload);
    const store = normalizeReportStoreForOrganization(
      {
        ...createEmptyStore(),
        ...payload,
        marketplaceOrders: [],
        sales: [],
        integrationEvents: [],
      } as LocalStore,
      {
        id: organization.id,
        name: row?.organizationName ?? organization.name,
      },
    );

    store.operatingExpenses = dbExpenses.map((expense) => ({
      id: expense.id,
      month: expense.month,
      category: expense.category,
      description: expense.description,
      amount: decimalToNumber(expense.amount),
      paidAt: expense.paidAt?.toISOString(),
      isRecurring: expense.isRecurring,
      frequency: normalizeExpenseFrequency(expense.frequency),
      periodStart: expense.periodStart?.toISOString().slice(0, 10),
      activeUntil: expense.activeUntil?.toISOString().slice(0, 10),
    }));
    store.fullInventoryLayers = dbLayers.map((layer) => ({
      id: layer.id,
      dateReceived: layer.dateReceived.toISOString(),
      masterSku: layer.masterSku,
      initialQuantity: decimalToNumber(layer.initialQuantity),
      remainingQuantity: decimalToNumber(layer.remainingQuantity),
      unitVolumeM3: decimalToNumber(layer.unitVolumeM3),
      inboundFreightCostTotal: decimalToNumber(layer.inboundFreightCostTotal),
      inboundFreightCostPerUnit: decimalToNumber(layer.inboundFreightCostPerUnit),
      storageCostPerUnitPerDay: decimalToNumber(layer.storageCostPerUnitPerDay),
      note: layer.note ?? undefined,
    }));

    return store;
  } catch (error) {
    console.error("[Reports] Failed to read slim report store, falling back to LocalDataStore:", error);
    return readLocalStore();
  }
}

async function resolveReportOrganization() {
  const user = await getCurrentUser();
  return {
    id: user?.organizationId ?? "org_public",
    name: user?.organizationName ?? "Control Total",
  };
}

function normalizeReportStoreForOrganization(
  store: LocalStore,
  organization: { id: string; name: string },
) {
  store.organization = organization;
  store.warehouses ??= createEmptyStore().warehouses;
  store.products ??= [];
  store.products = store.products.map((product) => ({
    ...product,
    isActive: product.isActive ?? true,
  }));
  store.onlineSkus ??= [];
  store.marketplaceAccounts ??= [];
  store.marketplaceOrders ??= [];
  store.integrationEvents ??= [];
  store.sales ??= [];
  store.inventoryBalances ??= [];
  store.inventoryMovements ??= [];
  store.fullInventoryLayers ??= [];
  store.fullBillingCharges ??= [];
  store.costSkuMappings ??= [];
  store.ignoredCostSkus ??= [];
  store.dismissedRareChargeAlerts ??= [];
  store.archivedUnmappedSkus ??= [];
  store.dismissedFullAuditAlerts ??= [];
  store.pendingCostImports ??= [];
  store.operatingExpenses ??= [];

  return store;
}

export const buildInventoryReport = cache(async function buildInventoryReport() {
  const store = await readReportStore(Math.min(getReportOrderLimit(), inventoryReportOrderLimit));
  const activeProducts = store.products.filter(
    (product) => product.isActive !== false,
  );
  const productsBySku = new Map(
    activeProducts.map((product) => [product.masterSku, product]),
  );
  const activeProductSkus = new Set(
    activeProducts.map((product) => product.masterSku.toLowerCase()),
  );
  const warehouseById = new Map(
    store.warehouses.map((warehouse) => [warehouse.id, warehouse]),
  );
  const marketplaceAccountById = new Map(
    store.marketplaceAccounts.map((account) => [account.id, account]),
  );
  const onlineSkusByMasterSku = new Map<string, LocalStore["onlineSkus"]>();
  for (const sku of store.onlineSkus) {
    for (const component of sku.components) {
      const rows = onlineSkusByMasterSku.get(component.masterSku) ?? [];
      rows.push(sku);
      onlineSkusByMasterSku.set(component.masterSku, rows);
    }
  }
  const committedBySkuWarehouse = new Map(
    buildStockCommitments(store.marketplaceOrders).map((commitment) => [
      `${commitment.masterSku}::${commitment.warehouseId}`,
      commitment,
    ]),
  );
  const productImageByMasterSku = buildProductImageMap(store);
  const balancesByMasterSku = new Map<string, LocalStore["inventoryBalances"]>();
  for (const balance of store.inventoryBalances) {
    const rows = balancesByMasterSku.get(balance.masterSku) ?? [];
    rows.push(balance);
    balancesByMasterSku.set(balance.masterSku, rows);
  }
  const masterSkus = new Set([
    ...activeProducts.map((product) => product.masterSku),
    ...store.inventoryBalances
      .filter((balance) =>
        activeProductSkus.has(balance.masterSku.toLowerCase()),
      )
      .map((balance) => balance.masterSku),
    ...store.onlineSkus.flatMap((sku) =>
      sku.components
        .filter((component) =>
          activeProductSkus.has(component.masterSku.toLowerCase()),
        )
        .map((component) => component.masterSku),
    ),
  ]);

  const rows = [...masterSkus]
    .sort((a, b) => a.localeCompare(b))
    .map((masterSku) => {
      const product = productsBySku.get(masterSku);
      const balances = (balancesByMasterSku.get(masterSku) ?? [])
        .map((balance) => {
          const warehouse = warehouseById.get(balance.warehouseId);
          const availableQuantity =
            balance.physicalQuantity -
            balance.reservedQuantity -
            balance.blockedQuantity;
          const committedQuantity =
            committedBySkuWarehouse.get(`${balance.masterSku}::${balance.warehouseId}`)
              ?.quantity ?? 0;

          return {
            warehouseId: balance.warehouseId,
            warehouseName: warehouse?.name ?? balance.warehouseId,
            warehouseType: warehouse?.type ?? "unknown",
            isSellable: warehouse?.isSellable ?? true,
            physicalQuantity: balance.physicalQuantity,
            reservedQuantity: balance.reservedQuantity,
            blockedQuantity: balance.blockedQuantity,
            committedQuantity,
            estimatedPhysicalQuantity: balance.physicalQuantity + committedQuantity,
            availableQuantity,
          };
        });
      const sellableQuantity = balances
        .filter((balance) => balance.isSellable)
        .reduce((sum, balance) => sum + balance.availableQuantity, 0);
      const physicalQuantity = balances.reduce(
        (sum, balance) => sum + balance.physicalQuantity,
        0,
      );
      const committedQuantity = balances.reduce(
        (sum, balance) => sum + balance.committedQuantity,
        0,
      );
      const estimatedPhysicalQuantity = physicalQuantity + committedQuantity;
      const linkedOnlineSkus = (onlineSkusByMasterSku.get(masterSku) ?? [])
        .map((sku) => {
          const account = marketplaceAccountById.get(sku.marketplaceAccount);
          const component = sku.components.find(
            (entry) => entry.masterSku === masterSku,
          );

          return {
            id: sku.id,
            onlineSku: sku.onlineSku,
            title: sku.title,
            imageUrl: sku.imageUrl ?? null,
            channel: sku.channel,
            marketplaceAccount: sku.marketplaceAccount,
            accountAlias: account?.nickname ?? account?.alias ?? sku.marketplaceAccount,
            quantityRequired: component?.quantityRequired ?? 1,
          };
        });
      const onlineSkuCount = linkedOnlineSkus.length;
      const hasHistoricalReferences = productHasHistoricalReferences(store, masterSku);

      return {
        masterSku,
        name: product?.name ?? masterSku,
        imageUrl: productImageByMasterSku.get(normalizeSkuKey(masterSku)) ?? null,
        totalIngresado: product?.totalIngresado ?? 0,
        totalVendido: product?.totalVendido ?? 0,
        currentStock: product?.currentStock ?? physicalQuantity,
        physicalQuantity,
        committedQuantity,
        estimatedPhysicalQuantity,
        sellableQuantity,
        averageUnitCost: product?.averageUnitCost ?? 0,
        inventoryValue: physicalQuantity * (product?.averageUnitCost ?? 0),
        onlineSkuCount,
        hasHistoricalReferences,
        linkedOnlineSkus,
        balances,
      };
    });
  const archivedProducts = store.products
    .filter((product) => product.isActive === false)
    .slice()
    .sort((a, b) => a.masterSku.localeCompare(b.masterSku))
    .map((product) => {
      const balances = (balancesByMasterSku.get(product.masterSku) ?? [])
        .map((balance) => {
          const warehouse = warehouseById.get(balance.warehouseId);
          const availableQuantity =
            balance.physicalQuantity -
            balance.reservedQuantity -
            balance.blockedQuantity;
          const committedQuantity =
            committedBySkuWarehouse.get(`${balance.masterSku}::${balance.warehouseId}`)
              ?.quantity ?? 0;

          return {
            warehouseId: balance.warehouseId,
            warehouseName: warehouse?.name ?? balance.warehouseId,
            warehouseType: warehouse?.type ?? "unknown",
            isSellable: warehouse?.isSellable ?? true,
            physicalQuantity: balance.physicalQuantity,
            reservedQuantity: balance.reservedQuantity,
            blockedQuantity: balance.blockedQuantity,
            committedQuantity,
            estimatedPhysicalQuantity: balance.physicalQuantity + committedQuantity,
            availableQuantity,
          };
        });
      const physicalQuantity = balances.reduce(
        (sum, balance) => sum + balance.physicalQuantity,
        0,
      );
      const committedQuantity = balances.reduce(
        (sum, balance) => sum + balance.committedQuantity,
        0,
      );
      const sellableQuantity = balances
        .filter((balance) => balance.isSellable)
        .reduce((sum, balance) => sum + balance.availableQuantity, 0);
      const linkedOnlineSkus = (onlineSkusByMasterSku.get(product.masterSku) ?? [])
        .map((sku) => {
          const account = marketplaceAccountById.get(sku.marketplaceAccount);
          const component = sku.components.find(
            (entry) => entry.masterSku === product.masterSku,
          );

          return {
            id: sku.id,
            onlineSku: sku.onlineSku,
            title: sku.title,
            imageUrl: sku.imageUrl ?? null,
            channel: sku.channel,
            marketplaceAccount: sku.marketplaceAccount,
            accountAlias: account?.nickname ?? account?.alias ?? sku.marketplaceAccount,
            quantityRequired: component?.quantityRequired ?? 1,
          };
        });

      return {
        masterSku: product.masterSku,
        name: product.name,
        imageUrl: productImageByMasterSku.get(normalizeSkuKey(product.masterSku)) ?? null,
        physicalQuantity,
        committedQuantity,
        estimatedPhysicalQuantity: physicalQuantity + committedQuantity,
        sellableQuantity,
        averageUnitCost: product.averageUnitCost ?? 0,
        inventoryValue: physicalQuantity * (product.averageUnitCost ?? 0),
        onlineSkuCount: linkedOnlineSkus.length,
        hasHistoricalReferences: productHasHistoricalReferences(store, product.masterSku),
        linkedOnlineSkus,
        balances,
      };
    });
  const masterSkusWithoutEquivalences = rows
    .filter((row) => row.onlineSkuCount === 0)
    .map((row) => ({
      masterSku: row.masterSku,
      name: row.name,
      physicalQuantity: row.physicalQuantity,
      averageUnitCost: row.averageUnitCost,
      inventoryValue: row.inventoryValue,
      hasHistoricalReferences: row.hasHistoricalReferences,
    }));
  const onlineSkuOptionByKey = new Map<
    string,
    {
      onlineSku: string;
      title: string;
      channel: string;
      marketplaceAccount: string;
      accountAlias: string;
      linkedMasterSkus: string[];
      source: "mapeado" | "venta" | "full";
    }
  >();
  const rememberOnlineSkuOption = (input: {
    onlineSku: string | null | undefined;
    title: string | null | undefined;
    channel: string | null | undefined;
    marketplaceAccount: string | null | undefined;
    linkedMasterSkus?: string[];
    source: "mapeado" | "venta" | "full";
  }) => {
    const onlineSku = input.onlineSku?.trim();
    if (!onlineSku) {
      return;
    }

    const key = normalizeSkuKey(onlineSku);
    const account = input.marketplaceAccount
      ? marketplaceAccountById.get(input.marketplaceAccount)
      : null;
    const existing = onlineSkuOptionByKey.get(key);
    const linkedMasterSkus = [
      ...new Set([
        ...(existing?.linkedMasterSkus ?? []),
        ...(input.linkedMasterSkus ?? []),
      ]),
    ].sort((a, b) => a.localeCompare(b));

    onlineSkuOptionByKey.set(key, {
      onlineSku: existing?.onlineSku ?? onlineSku,
      title: existing?.title || input.title?.trim() || onlineSku,
      channel: existing?.channel ?? input.channel ?? "mercado_libre",
      marketplaceAccount:
        existing?.marketplaceAccount ?? input.marketplaceAccount ?? "",
      accountAlias:
        existing?.accountAlias ??
        account?.nickname ??
        account?.alias ??
        input.marketplaceAccount ??
        "sin cuenta",
      linkedMasterSkus,
      source: existing?.source === "mapeado" ? "mapeado" : input.source,
    });
  };

  for (const sku of store.onlineSkus) {
    rememberOnlineSkuOption({
      onlineSku: sku.onlineSku,
      title: sku.title,
      channel: sku.channel,
      marketplaceAccount: sku.marketplaceAccount,
      linkedMasterSkus: sku.components.map((component) => component.masterSku),
      source: "mapeado",
    });
  }
  for (const order of store.marketplaceOrders) {
    for (const item of order.items) {
      rememberOnlineSkuOption({
        onlineSku: item.externalSku,
        title: item.title,
        channel: order.channel,
        marketplaceAccount: order.marketplaceAccountId,
        linkedMasterSkus: item.masterSku ? [item.masterSku] : [],
        source: "venta",
      });
    }
  }
  for (const item of [
    ...(store.fullStockSync?.items ?? []),
    ...(store.fullStockSync?.auditItems ?? []),
    ...(store.fullStockSync?.unmappedItems ?? []),
  ]) {
    rememberOnlineSkuOption({
      onlineSku: item.externalSku,
      title: item.title,
      channel: "mercado_libre",
      marketplaceAccount: store.fullStockSync?.accountId,
      linkedMasterSkus: [],
      source: "full",
    });
  }
  const onlineSkuCatalog = [...onlineSkuOptionByKey.values()].sort((a, b) =>
    a.onlineSku.localeCompare(b.onlineSku),
  );
  const onlineSkusWithoutMaster = onlineSkuCatalog.filter(
    (sku) => sku.linkedMasterSkus.length === 0,
  );

  return {
    organization: store.organization,
    warehouses: store.warehouses,
    fullInventoryLayers: store.fullInventoryLayers
      .slice()
      .sort(
        (a, b) =>
          new Date(b.dateReceived).getTime() -
          new Date(a.dateReceived).getTime(),
    ),
    rows,
    archivedProducts,
    masterSkusWithoutEquivalences,
    onlineSkuCatalog,
    onlineSkusWithoutMaster,
    archivedUnmappedSkus: (store.archivedUnmappedSkus ?? [])
      .slice()
      .sort((a, b) => b.archivedAt.localeCompare(a.archivedAt)),
    recentMovements: [
      ...store.marketplaceOrders.slice(0, 100).flatMap((order) =>
        order.items
          .filter((item) => item.masterSku && item.consumedQuantity !== null)
          .map((item) => ({
            id: `${order.externalOrderId}-${item.externalSku}`,
            date: order.orderedAt,
            type: order.channel === "mercado_libre" ? "Venta Meli" : `Venta ${formatChannelLabel(order.channel)}`,
            reference: order.externalOrderId,
            masterSku: item.masterSku ?? "",
            externalSku: item.externalSku,
            warehouseName:
              warehouseById.get(item.warehouseId)?.name ?? item.warehouseId,
            quantity: -(item.consumedQuantity ?? 0),
          })),
      ),
      ...store.sales.map((sale, index) => ({
        id: `hist-${index}`,
        date: sale.date ?? store.importedAt,
        type: "Venta historica",
        reference: sale.platform,
        masterSku: sale.masterSku,
        externalSku: sale.onlineSku,
        warehouseName: "Mi Bodega",
        quantity: -sale.consumedQuantity,
      })),
      ...store.inventoryMovements.map((movement) => ({
        id: movement.id,
        date: movement.date,
        type:
          movement.type === "adjustment"
            ? "Ajuste manual"
            : movement.type === "transfer"
              ? "Traspaso"
              : movement.type,
        reference: movement.reference,
        masterSku: movement.masterSku,
        externalSku: movement.note ?? "",
        warehouseName:
          warehouseById.get(movement.warehouseId)?.name ?? movement.warehouseId,
        quantity: movement.quantity,
      })),
    ]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 50),
    totals: {
      masterSkus: rows.length,
      physicalQuantity: rows.reduce((sum, row) => sum + row.physicalQuantity, 0),
      sellableQuantity: rows.reduce((sum, row) => sum + row.sellableQuantity, 0),
      inventoryValue: rows.reduce((sum, row) => sum + row.inventoryValue, 0),
    },
  };
});

function groupMarketplaceOrdersByRealSale(orders: LocalMarketplaceOrder[]) {
  return groupMarketplaceOrdersIntoRealSales(orders);
}

async function readMarketplaceOrdersForReports(
  store: LocalStore,
  take: number,
  orderFilter?: ReportOrderFilter,
) {
  if (!hasDatabaseUrl()) {
    return limitReportOrders(
      filterOrdersByReportFilter(store.marketplaceOrders, orderFilter),
      take,
    );
  }

  try {
    let rows: RelationalMarketplaceOrderRow[];

    try {
      rows = await readRelationalMarketplaceOrderRows(
        store,
        take,
        true,
        orderFilter,
      );
    } catch (error) {
      if (!isMissingPayloadColumnError(error)) {
        throw error;
      }

      console.warn(
        "[Sales Report] SaleOrder.payload is not available in this database; using relational sales without payload metadata.",
      );
      rows = await readRelationalMarketplaceOrderRows(
        store,
        take,
        false,
        orderFilter,
      );
    }

    const orders = rows.map((row) => normalizeRelationalMarketplaceOrder(store, row));
    const ordersWithItems = orders.filter((order) => order.items.length > 0);

    if (ordersWithItems.length > 0) {
      return orders;
    }

    return limitReportOrders(
      filterOrdersByReportFilter(
        (await readLocalStore()).marketplaceOrders,
        orderFilter,
      ),
      take,
    );
  } catch (error) {
    console.error("[Sales Report] Failed to read relational SaleOrder rows, falling back to LocalDataStore:", error);
    return limitReportOrders(
      filterOrdersByReportFilter(
        (await readLocalStore()).marketplaceOrders,
        orderFilter,
      ),
      take,
    );
  }
}

async function readRelationalMarketplaceOrderRows(
  store: LocalStore,
  take: number,
  includePayload: boolean,
  orderFilter?: ReportOrderFilter,
) {
  const orderedAt = buildReportOrderedAtFilter(orderFilter);
  const query = normalizeReportSearchQuery(orderFilter?.query);
  const payloadMatchIds = query
    ? await readPayloadSearchSaleOrderIds(store.organization.id, query, take)
    : [];
  const queryConditions = query
    ? buildRelationalOrderSearchConditions(query, payloadMatchIds)
    : [];
  const where: Prisma.SaleOrderWhereInput = {
    organizationId: store.organization.id,
    ...(orderedAt ? { orderedAt } : {}),
    ...(orderFilter?.status ? { status: orderFilter.status } : {}),
    ...(queryConditions.length > 0 ? { OR: queryConditions } : {}),
  };
  const rows = await prisma.saleOrder.findMany({
    where,
    orderBy: { orderedAt: "desc" },
    select: {
      id: true,
      marketplaceAccountId: true,
      channel: true,
      externalOrderId: true,
      orderedAt: true,
      status: true,
      grossAmount: true,
      netReceivedAmount: true,
      currency: true,
      ...(includePayload ? { payload: true } : {}),
      items: {
        select: {
          externalSku: true,
          quantity: true,
          unitPrice: true,
          onlineSku: {
            select: {
              onlineSku: true,
              title: true,
              components: {
                select: {
                  quantityRequired: true,
                  masterProduct: { select: { masterSku: true } },
                },
              },
            },
          },
          components: {
            select: {
              quantityConsumed: true,
              masterProduct: { select: { masterSku: true } },
            },
          },
        },
      },
      charges: {
        select: {
          chargeType: true,
          amount: true,
          source: true,
          notes: true,
        },
      },
    },
    take,
  });

  return rows as RelationalMarketplaceOrderRow[];
}

function buildRelationalOrderSearchConditions(
  query: string,
  payloadMatchIds: string[],
): Prisma.SaleOrderWhereInput[] {
  const contains = { contains: query, mode: "insensitive" as const };
  const itemSearch: Prisma.SaleOrderItemWhereInput = {
    OR: [
      { externalSku: contains },
      { onlineSku: { is: { onlineSku: contains } } },
      { onlineSku: { is: { title: contains } } },
      {
        components: {
          some: {
            masterProduct: { is: { masterSku: contains } },
          },
        },
      },
    ],
  };
  const conditions: Prisma.SaleOrderWhereInput[] = [
    { externalOrderId: contains },
    { buyerReference: contains },
    { items: { some: itemSearch } },
  ];

  if (payloadMatchIds.length > 0) {
    conditions.push({ id: { in: payloadMatchIds } });
  }

  return conditions;
}

async function readPayloadSearchSaleOrderIds(
  organizationId: string,
  query: string,
  take: number,
) {
  if (!/^\d{6,}$/.test(query.trim())) {
    return [];
  }

  const pattern = `%${escapePostgresLike(query)}%`;
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "SaleOrder"
    WHERE "organizationId" = ${organizationId}
      AND COALESCE("payload"::text, '') ILIKE ${pattern} ESCAPE '\\'
    ORDER BY "orderedAt" DESC
    LIMIT ${Math.max(1, Math.min(Math.floor(take), 500))}
  `;

  return rows.map((row) => row.id);
}

type RelationalMarketplaceOrderRow = {
  id: string;
  marketplaceAccountId: string | null;
  channel: unknown;
  externalOrderId: string | null;
  orderedAt: Date;
  status: string;
  grossAmount: unknown;
  netReceivedAmount: unknown | null;
  currency: string;
  payload?: unknown;
  items: Array<{
    externalSku: string;
    quantity: unknown;
    unitPrice: unknown;
    onlineSku: {
      onlineSku: string;
      title: string | null;
      components: Array<{
        quantityRequired: unknown;
        masterProduct: { masterSku: string };
      }>;
    } | null;
    components: Array<{
      quantityConsumed: unknown;
      masterProduct: { masterSku: string };
    }>;
  }>;
  charges: Array<{
    chargeType: string;
    amount: unknown;
    source: string | null;
    notes: string | null;
  }>;
};

function normalizeRelationalMarketplaceOrder(
  store: LocalStore,
  row: RelationalMarketplaceOrderRow,
): LocalMarketplaceOrder {
  const payload = normalizeMarketplaceOrderPayload(row.payload);
  const isFulfillment = isRelationalFulfillmentOrder(row);
  const warehouseId = isFulfillment ? "wh_full" : "wh_main";
  const externalOrderId = row.externalOrderId ?? row.id;
  const payloadItems = payload?.items ?? [];

  return {
    id: fromRelationalId(store.organization.id, row.id),
    channel: normalizeReportOrderChannel(row.channel),
    marketplaceAccountId: row.marketplaceAccountId
      ? fromRelationalId(store.organization.id, row.marketplaceAccountId)
      : "",
    externalOrderId,
    packId: payload?.packId ?? null,
    shippingId: payload?.shippingId ?? null,
    status: row.status,
    orderedAt: row.orderedAt.toISOString(),
    grossAmount: decimalToNumber(row.grossAmount),
    netReceivedAmount:
      row.netReceivedAmount === null ? null : decimalToNumber(row.netReceivedAmount),
    billingStatus:
      payload?.billingStatus ??
      (row.netReceivedAmount === null ? "pending" : "confirmed"),
    billingLastTriedAt: payload?.billingLastTriedAt,
    billingError: payload?.billingError,
    currency: row.currency,
    raw: payload?.raw ?? {},
    items: row.items.map((item, index) => {
      const payloadItem =
        payloadItems[index] ??
        payloadItems.find((entry) => entry.externalSku === item.externalSku);
      const storedComponents = item.components.map((component) => ({
        masterSku: component.masterProduct.masterSku,
        quantityRequired: 0,
        consumedQuantity: decimalToNumber(component.quantityConsumed),
      }));
      const skuComponents =
        storedComponents.length > 0
          ? []
          : item.onlineSku?.components.map((component) => ({
              masterSku: component.masterProduct.masterSku,
              quantityRequired: decimalToNumber(component.quantityRequired),
              consumedQuantity:
                decimalToNumber(item.quantity) *
                decimalToNumber(component.quantityRequired),
            })) ?? [];
      const components = storedComponents.length > 0 ? storedComponents : skuComponents;
      const firstComponent = components[0] ?? null;

      return {
        externalSku: item.externalSku,
        title:
          payloadItem?.title ??
          item.onlineSku?.title ??
          item.onlineSku?.onlineSku ??
          item.externalSku,
        imageUrl: normalizeImageUrl(payloadItem?.imageUrl),
        quantity: decimalToNumber(item.quantity),
        unitPrice: decimalToNumber(item.unitPrice),
        masterSku: firstComponent?.masterSku ?? null,
        consumedQuantity: firstComponent?.consumedQuantity ?? null,
        warehouseId: payloadItem?.warehouseId ?? warehouseId,
        logisticType: payloadItem?.logisticType ?? (isFulfillment ? "fulfillment" : null),
        components: components.length > 0 ? components : undefined,
      };
    }),
    charges: row.charges.map((charge) => ({
      type: charge.notes ?? charge.chargeType,
      amount: decimalToNumber(charge.amount),
      source: charge.source ?? `relational:${charge.chargeType}`,
    })),
    fullCostAllocations: payload?.fullCostAllocations,
    inventoryApplied: payload?.inventoryApplied,
    inventoryApplications: payload?.inventoryApplications,
  };
}

function normalizeMarketplaceOrderPayload(value: unknown): Partial<LocalMarketplaceOrder> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Partial<LocalMarketplaceOrder>;
}

function isMissingPayloadColumnError(error: unknown) {
  const candidate = error as {
    code?: string;
    message?: string;
    meta?: { column?: string };
  };

  return (
    candidate.code === "P2022" &&
    (candidate.meta?.column === "SaleOrder.payload" ||
      candidate.message?.includes("SaleOrder.payload") === true)
  );
}

function isRelationalFulfillmentOrder(row: RelationalMarketplaceOrderRow) {
  return row.charges.some((charge) => {
    const value = [
      charge.chargeType,
      charge.source,
      charge.notes,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return (
      value.includes("full_fifo") ||
      value.includes("fulfillment") ||
      value.includes("mercado_libre_full")
    );
  });
}

function buildProductImageMap(store: LocalStore) {
  const imageByMasterSku = new Map<string, string>();
  const masterSkuByOnlineSku = new Map<string, string>();
  const setImage = (masterSku: string | null | undefined, imageUrl: unknown) => {
    const normalizedImageUrl = normalizeImageUrl(imageUrl);
    if (!masterSku || !normalizedImageUrl) {
      return;
    }

    const key = normalizeSkuKey(masterSku);
    if (!imageByMasterSku.has(key)) {
      imageByMasterSku.set(key, normalizedImageUrl);
    }
  };

  for (const sku of store.onlineSkus) {
    const masterSku = sku.components[0]?.masterSku;
    if (masterSku) {
      masterSkuByOnlineSku.set(normalizeSkuKey(sku.onlineSku), masterSku);
      setImage(masterSku, sku.imageUrl);
    }
  }

  const fullStockItems = [
    ...(store.fullStockSync?.items ?? []),
    ...(store.fullStockSync?.auditItems ?? []),
    ...(store.fullStockSync?.unmappedItems ?? []),
  ];
  for (const item of fullStockItems) {
    let masterSku = masterSkuByOnlineSku.get(normalizeSkuKey(item.externalSku));
    if ("masterSku" in item && typeof item.masterSku === "string" && item.masterSku) {
      masterSku = item.masterSku;
    }
    setImage(masterSku, item.imageUrl);
  }

  for (const order of store.marketplaceOrders) {
    for (const item of order.items) {
      const masterSku =
        item.masterSku ?? masterSkuByOnlineSku.get(normalizeSkuKey(item.externalSku));
      setImage(masterSku, item.imageUrl);
    }
  }

  return imageByMasterSku;
}

function buildOnlineSkuImageMap(store: LocalStore) {
  const imageByOnlineSku = new Map<string, string>();
  const setImage = (onlineSku: string | null | undefined, imageUrl: unknown) => {
    const normalizedOnlineSku = normalizeSkuKey(onlineSku ?? "");
    const normalizedImageUrl = normalizeImageUrl(imageUrl);
    if (!normalizedOnlineSku || !normalizedImageUrl || imageByOnlineSku.has(normalizedOnlineSku)) {
      return;
    }

    imageByOnlineSku.set(normalizedOnlineSku, normalizedImageUrl);
  };

  for (const sku of store.onlineSkus) {
    setImage(sku.onlineSku, sku.imageUrl);
  }

  for (const item of [
    ...(store.fullStockSync?.items ?? []),
    ...(store.fullStockSync?.auditItems ?? []),
    ...(store.fullStockSync?.unmappedItems ?? []),
  ]) {
    setImage(item.externalSku, item.imageUrl);
  }

  return imageByOnlineSku;
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

function getReportOrderLimit() {
  const value = Number(process.env.REPORT_MAX_ORDERS ?? defaultReportOrderLimit);
  return Number.isFinite(value) && value > 0
    ? Math.min(Math.floor(value), 100_000)
    : defaultReportOrderLimit;
}

function getSalesReportOrderLimit() {
  const value = Number(
    process.env.SALES_REPORT_MAX_ORDERS ?? defaultSalesReportOrderLimit,
  );
  return Number.isFinite(value) && value > 0
    ? Math.min(Math.floor(value), 100_000)
    : defaultSalesReportOrderLimit;
}

function limitReportOrders(orders: LocalMarketplaceOrder[], limit = getReportOrderLimit()) {
  return orders
    .slice()
    .sort(
      (a, b) => new Date(b.orderedAt).getTime() - new Date(a.orderedAt).getTime(),
    )
    .slice(0, limit);
}

function filterOrdersByReportDateRange(
  orders: LocalMarketplaceOrder[],
  range?: ReportOrderDateRange,
) {
  const bounds = getReportDateBounds(range);
  if (!bounds) {
    return orders;
  }

  return orders.filter((order) => {
    const orderedAt = new Date(order.orderedAt).getTime();
    return (
      Number.isFinite(orderedAt) &&
      orderedAt >= bounds.from.getTime() &&
      orderedAt < bounds.to.getTime()
    );
  });
}

function filterOrdersByReportFilter(
  orders: LocalMarketplaceOrder[],
  filter?: ReportOrderFilter,
) {
  const query = normalizeReportSearchQuery(filter?.query);
  const dateFiltered = filterOrdersByReportDateRange(orders, filter);

  if (!query && !filter?.status) {
    return dateFiltered;
  }

  return dateFiltered.filter((order) => {
    const matchesStatus = !filter?.status || order.status === filter.status;
    const matchesQuery =
      !query ||
      marketplaceOrderMatchesIdentifier(order, query) ||
      order.items.some(
        (item) =>
          item.externalSku.toLowerCase().includes(query) ||
          item.title.toLowerCase().includes(query) ||
          (item.masterSku ?? "").toLowerCase().includes(query),
      );

    return matchesStatus && matchesQuery;
  });
}

function buildReportOrderedAtFilter(range?: ReportOrderDateRange) {
  const bounds = getReportDateBounds(range);
  return bounds ? { gte: bounds.from, lt: bounds.to } : null;
}

function normalizeReportSearchQuery(value?: string | null) {
  const query = value?.trim().toLowerCase() ?? "";
  return query.length > 0 ? query : null;
}

function escapePostgresLike(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function getReportDateBounds(range?: ReportOrderDateRange) {
  const from = parseReportDateOnly(range?.orderedFrom);
  const to = parseReportDateOnly(range?.orderedTo);

  if (!from && !to) {
    return null;
  }

  const safeFrom = from ?? new Date(Date.UTC(2000, 0, 1));
  const safeTo = addUtcDays(to ?? new Date(), 1);

  if (safeFrom.getTime() >= safeTo.getTime()) {
    return { from: safeTo, to: addUtcDays(safeFrom, 1) };
  }

  return { from: safeFrom, to: safeTo };
}

function parseReportDateOnly(value?: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 6, 0, 0, 0));
}

function addUtcDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function normalizeReportOrderChannel(channel: unknown): LocalMarketplaceOrder["channel"] {
  const value = String(channel ?? "mercado_libre");

  return ["mercado_libre", "manual", "tiktok", "whatsapp", "external"].includes(value)
    ? (value as LocalMarketplaceOrder["channel"])
    : "external";
}

function decimalToNumber(value: unknown) {
  return Number(value ?? 0);
}

function normalizeJsonObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringFromJson(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function normalizeSalesBackfill(value: unknown): LocalStore["marketplaceAccounts"][number]["salesBackfill"] {
  const candidate = normalizeJsonObject(value);
  return typeof candidate.from === "string" &&
    typeof candidate.to === "string" &&
    typeof candidate.startedAt === "string"
    ? {
        from: candidate.from,
        to: candidate.to,
        offset: Number(candidate.offset ?? 0),
        startedAt: candidate.startedAt,
        completedAt: stringFromJson(candidate.completedAt),
        lastRunAt: stringFromJson(candidate.lastRunAt),
        lastTotal:
          candidate.lastTotal === undefined ? undefined : Number(candidate.lastTotal),
      }
    : undefined;
}

function normalizeSalesAutomation(value: unknown): LocalStore["marketplaceAccounts"][number]["salesAutomation"] {
  const candidate = normalizeJsonObject(value);
  const lastMode = ["backfill", "basic_import", "recent", "skip_recent"].includes(
    String(candidate.lastMode),
  )
    ? (candidate.lastMode as NonNullable<LocalStore["marketplaceAccounts"][number]["salesAutomation"]>["lastMode"])
    : undefined;

  return Object.keys(candidate).length > 0
    ? {
        lastRecentRunAt: stringFromJson(candidate.lastRecentRunAt),
        lastRunAt: stringFromJson(candidate.lastRunAt),
        lastMode,
        lastChecked:
          candidate.lastChecked === undefined ? undefined : Number(candidate.lastChecked),
        lastImported:
          candidate.lastImported === undefined ? undefined : Number(candidate.lastImported),
        lastTotal:
          candidate.lastTotal === undefined ? undefined : Number(candidate.lastTotal),
        lastBacklogRemaining:
          candidate.lastBacklogRemaining === undefined
            ? undefined
            : Number(candidate.lastBacklogRemaining),
        nextRecommendedMinutes:
          candidate.nextRecommendedMinutes === undefined
            ? undefined
            : Number(candidate.nextRecommendedMinutes),
        lastError: stringFromJson(candidate.lastError),
      }
    : undefined;
}

function normalizeInventoryMovementType(
  type: string,
): LocalStore["inventoryMovements"][number]["type"] {
  if (type === "sale" || type === "return" || type === "adjustment") {
    return type;
  }

  if (type === "transfer_in" || type === "transfer_out") {
    return "transfer";
  }

  return "sync";
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatChannelLabel(channel: LocalMarketplaceOrder["channel"]) {
  const labels: Record<LocalMarketplaceOrder["channel"], string> = {
    mercado_libre: "Mercado Libre",
    manual: "Mostrador",
    tiktok: "TikTok",
    whatsapp: "WhatsApp",
    external: "Canal externo",
  };

  return labels[channel] ?? channel;
}

function aggregateShippingCharges(
  charges: LocalMarketplaceOrder["charges"],
) {
  const shippingCharges = charges.filter(
    (charge) => charge.type === "shipping" && charge.amount > 0,
  );

  if (shippingCharges.length === 0) {
    return null;
  }

  const allAlreadyAllocated = shippingCharges.every((charge) =>
    charge.source.includes("pack_allocated"),
  );
  const amounts = shippingCharges.map((charge) => charge.amount);
  const allSameAmount = amounts.every(
    (amount) => Math.abs(amount - amounts[0]) < 0.01,
  );

  const amount =
    !allAlreadyAllocated && allSameAmount && amounts.length > 1
      ? amounts[0]
      : amounts.reduce((sum, value) => sum + value, 0);
  const sources = [...new Set(shippingCharges.map((charge) => charge.source))]
    .filter(Boolean)
    .join("+");

  return {
    type: "shipping",
    amount: roundMoney(amount),
    source:
      allAlreadyAllocated || amounts.length === 1
        ? sources || "meli_shipping"
        : `${sources || "meli_shipping"}:grouped_once`,
  };
}

function aggregateRealSaleCharges(group: LocalMarketplaceOrder[]) {
  const regularCharges = new Map<
    string,
    { type: string; amount: number; source: string }
  >();
  const allCharges = group.flatMap((order) => order.charges);
  const hasConfirmedMarketplaceCommission = allCharges.some(
    (charge) =>
      charge.type === "marketplace_commission" &&
      !charge.source.includes("fallback"),
  );

  for (const charge of allCharges) {
    if (charge.type === "shipping") {
      continue;
    }
    if (
      hasConfirmedMarketplaceCommission &&
      charge.type === "marketplace_commission" &&
      charge.source.includes("fallback")
    ) {
      continue;
    }

    const key = `${charge.type}:${charge.source}`;
    const row = regularCharges.get(key) ?? {
      type: charge.type,
      amount: 0,
      source: charge.source,
    };
    row.amount += charge.amount;
    regularCharges.set(key, row);
  }

  const shippingCharge = aggregateShippingCharges(allCharges);
  const charges = [...regularCharges.values()].map((charge) => ({
    ...charge,
    amount: roundMoney(charge.amount),
  }));

  if (shippingCharge) {
    charges.push(shippingCharge);
  }

  return charges.sort((a, b) => a.type.localeCompare(b.type));
}

function buildRealSaleOrder(input: {
  groupKey: string;
  group: LocalMarketplaceOrder[];
  store: LocalStore;
  productImageByMasterSku?: Map<string, string>;
  imageByOnlineSku?: Map<string, string>;
  withProductCost?: boolean;
}): ReportMarketplaceOrder {
  const {
    groupKey,
    group,
    store,
    productImageByMasterSku = buildProductImageMap(store),
    imageByOnlineSku = buildOnlineSkuImageMap(store),
    withProductCost = false,
  } = input;
  const primary = group[0];
  const latest = group.reduce((candidate, order) =>
    new Date(order.orderedAt).getTime() > new Date(candidate.orderedAt).getTime()
      ? order
      : candidate,
  );
  const productBySku = new Map(
    store.products.map((product) => [product.masterSku, product]),
  );
  const warehouseById = new Map(
    store.warehouses.map((warehouse) => [warehouse.id, warehouse]),
  );
  const accountById = new Map(
    store.marketplaceAccounts.map((account) => [account.id, account]),
  );
  const isCancelled = group.every((order) => isCancelledOrder(order.status));
  const charges = isCancelled ? [] : aggregateRealSaleCharges(group);
  const totalCharges = charges.reduce((sum, charge) => sum + charge.amount, 0);
  const grossAmount = isCancelled
    ? 0
    : roundMoney(group.reduce((sum, order) => sum + order.grossAmount, 0));
  const hasCancelledSibling =
    !isCancelled && group.some((order) => isCancelledOrder(order.status));
  const receivedAmount = isCancelled
    ? 0
    : group.some(
          (order) =>
            order.billingStatus !== "confirmed" ||
            order.netReceivedAmount === null,
        )
      ? null
      : (() => {
          const storedReceived = roundMoney(
            group.reduce(
              (sum, order) => sum + (order.netReceivedAmount ?? 0),
              0,
            ),
          );
          const chargeBasedReceived = roundMoney(grossAmount - totalCharges);
          return hasCancelledSibling && chargeBasedReceived < storedReceived
            ? chargeBasedReceived
            : storedReceived;
        })();
  const items: ReportMarketplaceOrderItem[] = group.flatMap((order) =>
    order.items.map((item) => {
      const isItemCancelled = isCancelledOrder(order.status);
      const itemComponents = getReportItemComponents(item);
      const hasMissingComponentCost = itemComponents.some(
        (component) => (productBySku.get(component.masterSku)?.averageUnitCost ?? 0) <= 0,
      );
      const productCost = isItemCancelled
        ? 0
        : itemComponents.reduce((sum, component) => {
            const averageUnitCost =
              productBySku.get(component.masterSku)?.averageUnitCost ?? 0;
            return sum + component.quantity * averageUnitCost;
          }, 0);
      const averageUnitCost =
        item.quantity > 0 ? productCost / item.quantity : 0;

      return {
        ...item,
        imageUrl:
          normalizeImageUrl(item.imageUrl) ??
          imageByOnlineSku.get(normalizeSkuKey(item.externalSku)) ??
          (item.masterSku
            ? productImageByMasterSku.get(normalizeSkuKey(item.masterSku))
            : null) ??
          null,
        sourceOrderId: order.externalOrderId,
        sourceOrderIds: [order.externalOrderId],
        warehouseName:
          warehouseById.get(item.warehouseId)?.name ?? item.warehouseId,
        isCancelled: isItemCancelled,
        activeQuantity: isItemCancelled ? 0 : item.quantity,
        cancelledQuantity: isItemCancelled ? item.quantity : 0,
        cancelledLineGross: isItemCancelled ? item.quantity * item.unitPrice : 0,
        averageUnitCost,
        productCost,
        lineGross: isItemCancelled ? 0 : item.quantity * item.unitPrice,
        isIncomplete:
          !isItemCancelled &&
          (itemComponents.length === 0 ||
            (withProductCost && hasMissingComponentCost)),
      };
    }),
  );
  const summaryItems = consolidateRealSaleItems(items);
  const productCost = items.reduce((sum, item) => sum + (item.productCost ?? 0), 0);
  const additionalCosts = isCancelled ? 0 : getAdditionalCosts(charges);
  const productGrossProfit = grossAmount - productCost;
  const estimatedReceived = receivedAmount ?? 0;
  const netProfit = estimatedReceived - productCost - additionalCosts;
  const status =
    group.find((order) => !isCancelledOrder(order.status))?.status ??
    latest.status;

  return {
    ...primary,
    status,
    orderedAt: latest.orderedAt,
    isCancelled,
    grossAmount,
    charges,
    totalCharges,
    estimatedReceived,
    receivedAmount,
    isReceivedPending: receivedAmount === null,
    needsCancelledBillingReview: group.some(needsCancelledBillingReview),
    accountAlias:
      accountById.get(primary.marketplaceAccountId)?.alias ??
      formatChannelLabel(primary.channel),
    items,
    summaryItems,
    externalOrderIds: group.map((order) => order.externalOrderId),
    marketplaceSaleId: getMarketplaceSaleDisplayId(group, groupKey),
    realSaleKey: groupKey,
    internalOrderCount: group.length,
    fullCostAllocations: group.flatMap(
      (order) => order.fullCostAllocations ?? [],
    ),
    additionalCosts,
    productCost,
    productGrossProfit,
    netProfit,
    marginPercent:
      grossAmount > 0 ? (netProfit / grossAmount) * 100 : 0,
    missingCostItems: withProductCost
      ? items.filter(
          (item) =>
            getReportItemComponents(item).length > 0 &&
            getReportItemComponents(item).some(
              (component) =>
                (productBySku.get(component.masterSku)?.averageUnitCost ?? 0) <= 0,
            ),
        ).length
      : 0,
    unmappedItems: withProductCost
      ? items.filter((item) => getReportItemComponents(item).length === 0).length
      : 0,
  };
}

function getReportItemComponents(item: LocalMarketplaceOrder["items"][number]) {
  const components =
    item.components
      ?.map((component) => ({
        masterSku: component.masterSku,
        quantity: Number(component.consumedQuantity),
      }))
      .filter(
        (component) =>
          component.masterSku &&
          Number.isFinite(component.quantity) &&
          component.quantity > 0,
      ) ?? [];

  if (components.length > 0) {
    return components;
  }

  const quantity = Number(item.consumedQuantity);
  if (!item.masterSku || !Number.isFinite(quantity) || quantity <= 0) {
    return [];
  }

  return [{ masterSku: item.masterSku, quantity }];
}

function consolidateRealSaleItems(items: ReportMarketplaceOrderItem[]) {
  const rows = new Map<string, ReportMarketplaceOrderItem>();

  for (const item of items) {
    const key = [
      normalizeSkuKey(item.externalSku),
      normalizeSkuKey(item.masterSku ?? ""),
      item.warehouseId,
      roundMoney(item.unitPrice),
    ].join("::");
    const existing = rows.get(key);

    if (!existing) {
      rows.set(key, {
        ...item,
        sourceOrderIds: [...new Set(item.sourceOrderIds ?? [item.sourceOrderId ?? ""])].filter(
          Boolean,
        ),
      });
      continue;
    }

    const sourceOrderIds = [
      ...(existing.sourceOrderIds ?? [existing.sourceOrderId ?? ""]),
      ...(item.sourceOrderIds ?? [item.sourceOrderId ?? ""]),
    ].filter(Boolean);
    const activeQuantity = existing.activeQuantity + item.activeQuantity;
    const cancelledQuantity = existing.cancelledQuantity + item.cancelledQuantity;
    const consumedQuantity =
      existing.consumedQuantity === null && item.consumedQuantity === null
        ? null
        : (existing.isCancelled ? 0 : existing.consumedQuantity ?? 0) +
          (item.isCancelled ? 0 : item.consumedQuantity ?? 0);

    rows.set(key, {
      ...existing,
      title: existing.activeQuantity > 0 ? existing.title : item.title,
      imageUrl: existing.imageUrl ?? item.imageUrl ?? null,
      quantity: activeQuantity > 0 ? activeQuantity : cancelledQuantity,
      consumedQuantity,
      isCancelled: activeQuantity <= 0,
      activeQuantity,
      cancelledQuantity,
      cancelledLineGross: existing.cancelledLineGross + item.cancelledLineGross,
      productCost: existing.productCost + item.productCost,
      lineGross: existing.lineGross + item.lineGross,
      sourceOrderIds: [...new Set(sourceOrderIds)],
      isIncomplete: existing.isIncomplete || item.isIncomplete,
      warehouseId: activeQuantity > 0 && item.activeQuantity > 0 ? item.warehouseId : existing.warehouseId,
      warehouseName:
        activeQuantity > 0 && item.activeQuantity > 0
          ? item.warehouseName
          : existing.warehouseName,
    });
  }

  return [...rows.values()];
}

export const buildSalesReport = cache(async function buildSalesReport(
  input?: {
    includeProductSummary?: boolean;
    orderLimit?: number;
    orderDateRange?: ReportOrderDateRange;
    query?: string | null;
    status?: string | null;
  },
) {
  const includeProductSummary = input?.includeProductSummary ?? true;
  const store = await readReportStore(input?.orderLimit ?? getSalesReportOrderLimit(), {
    orderedFrom: input?.orderDateRange?.orderedFrom,
    orderedTo: input?.orderDateRange?.orderedTo,
    query: input?.query,
    status: input?.status,
  });
  const marketplaceOrders = store.marketplaceOrders;
  const productImageByMasterSku = buildProductImageMap(store);
  const imageByOnlineSku = buildOnlineSkuImageMap(store);
  const orders = groupMarketplaceOrdersByRealSale(marketplaceOrders)
    .map(({ key, orders: group }) =>
      buildRealSaleOrder({
        groupKey: key,
        group,
        store,
        productImageByMasterSku,
        imageByOnlineSku,
      }),
    )
    .sort(
      (a, b) => new Date(b.orderedAt).getTime() - new Date(a.orderedAt).getTime(),
    );
  const activeOrders = orders.filter((order) => !order.isCancelled);
  const confirmedOrders = activeOrders.filter((order) => !order.isReceivedPending);

  return {
    organization: store.organization,
    orders,
    productSummary: includeProductSummary
      ? buildProductProfitSummary(activeOrders)
      : [],
    totals: {
      orders: orders.length,
      grossAmount: orders.reduce((sum, order) => sum + order.grossAmount, 0),
      totalCharges: orders.reduce((sum, order) => sum + order.totalCharges, 0),
      productCost: orders.reduce((sum, order) => sum + order.productCost, 0),
      productGrossProfit: orders.reduce(
        (sum, order) => sum + order.productGrossProfit,
        0,
      ),
      estimatedReceived: orders.reduce(
        (sum, order) => sum + order.estimatedReceived,
        0,
      ),
      confirmedOrders: confirmedOrders.length,
      confirmedGrossAmount: confirmedOrders.reduce(
        (sum, order) => sum + order.grossAmount,
        0,
      ),
      confirmedProductCost: confirmedOrders.reduce(
        (sum, order) => sum + order.productCost,
        0,
      ),
      confirmedNetProfit: confirmedOrders.reduce(
        (sum, order) => sum + order.netProfit,
        0,
      ),
      pendingReceivedOrders: orders.filter((order) => order.isReceivedPending).length,
      cancelledOrdersForReview: orders.filter(
        (order) => order.needsCancelledBillingReview,
      ).length,
    },
  };
});

function buildProductProfitSummary(
  orders: Array<{
    grossAmount: number;
    estimatedReceived: number;
    isReceivedPending?: boolean;
    totalCharges: number;
    additionalCosts?: number;
    items: Array<{
      masterSku: string | null;
      title: string;
      quantity: number;
      unitPrice: number;
      consumedQuantity: number | null;
      productCost?: number;
    }>;
  }>,
) {
  const summary = new Map<
    string,
    {
      masterSku: string;
      title: string;
      soldUnits: number;
      consumedUnits: number;
      grossAmount: number;
      estimatedReceived: number;
      allocatedCharges: number;
      additionalCosts: number;
      productCost: number;
      netProfit: number;
    }
  >();

  for (const order of orders) {
    if (order.isReceivedPending) {
      continue;
    }

    const grossBase =
      order.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0) ||
      order.grossAmount ||
      1;

    for (const item of order.items) {
      const masterSku = item.masterSku ?? "SIN_MAPEAR";
      const lineGross = item.quantity * item.unitPrice;
      const ratio = lineGross / grossBase;
      const row = summary.get(masterSku) ?? {
        masterSku,
        title: item.title,
        soldUnits: 0,
        consumedUnits: 0,
        grossAmount: 0,
        estimatedReceived: 0,
        allocatedCharges: 0,
        additionalCosts: 0,
        productCost: 0,
        netProfit: 0,
      };

      row.soldUnits += item.quantity;
      row.consumedUnits += item.consumedQuantity ?? 0;
      row.grossAmount += lineGross;
      row.estimatedReceived += order.estimatedReceived * ratio;
      row.allocatedCharges += order.totalCharges * ratio;
      row.additionalCosts += (order.additionalCosts ?? 0) * ratio;
      row.productCost += item.productCost ?? 0;
      summary.set(masterSku, row);
    }
  }

  return [...summary.values()]
    .map((row) => ({
      ...row,
      netProfit: row.estimatedReceived - row.productCost - row.additionalCosts,
      marginPercent:
        row.grossAmount > 0
          ? ((row.estimatedReceived - row.productCost - row.additionalCosts) /
              row.grossAmount) *
            100
          : 0,
    }))
    .sort((a, b) => b.grossAmount - a.grossAmount);
}

function buildProductMonthlyProfitSummary(input: {
  settledOrders: ReportMarketplaceOrder[];
  store: LocalStore;
}) {
  const productBySku = new Map(
    input.store.products.map((product) => [
      normalizeSkuKey(product.masterSku),
      product,
    ]),
  );
  const rows = new Map<
    string,
    {
      key: string;
      month: string;
      masterSku: string;
      title: string;
      soldUnits: number;
      consumedUnits: number;
      orders: Set<string>;
      grossAmount: number;
      estimatedReceived: number;
      allocatedCharges: number;
      saleFullCosts: number;
      productCost: number;
      fullBillingCharges: number;
    }
  >();

  function getRow(month: string, masterSku: string, title: string) {
    const product = productBySku.get(normalizeSkuKey(masterSku));
    const key = `${month}:${masterSku}`;
    const row = rows.get(key) ?? {
      key,
      month,
      masterSku,
      title: product?.name ?? title,
      soldUnits: 0,
      consumedUnits: 0,
      orders: new Set<string>(),
      grossAmount: 0,
      estimatedReceived: 0,
      allocatedCharges: 0,
      saleFullCosts: 0,
      productCost: 0,
      fullBillingCharges: 0,
    };
    rows.set(key, row);
    return row;
  }

  for (const order of input.settledOrders) {
    if (order.isReceivedPending || order.isCancelled) {
      continue;
    }

    const month = toReportMonth(order.orderedAt);
    const grossBase =
      order.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0) ||
      order.grossAmount ||
      1;

    for (const item of order.items) {
      const masterSku = item.masterSku ?? "SIN_MAPEAR";
      const lineGross = item.quantity * item.unitPrice;
      const ratio = lineGross / grossBase;
      const row = getRow(month, masterSku, item.title);

      row.orders.add(order.realSaleKey);
      row.soldUnits += item.quantity;
      row.consumedUnits += item.consumedQuantity ?? 0;
      row.grossAmount += lineGross;
      row.estimatedReceived += order.estimatedReceived * ratio;
      row.allocatedCharges += order.totalCharges * ratio;
      row.saleFullCosts += order.additionalCosts * ratio;
      row.productCost += item.productCost ?? 0;
    }
  }

  const billingMapping = buildFullBillingMasterSkuResolver(input.store);
  for (const charge of input.store.fullBillingCharges ?? []) {
    const masterSku = billingMapping(charge) ?? "SIN_MAPEAR_FULL";
    const month = toReportMonth(charge.period);
    const row = getRow(month, masterSku, charge.productTitle);
    row.fullBillingCharges += charge.amount;
  }

  return [...rows.values()]
    .map((row) => {
      const contributionProfit =
        row.estimatedReceived - row.productCost - row.saleFullCosts;
      const finalNetProfit = contributionProfit - row.fullBillingCharges;

      return {
        ...row,
        orders: row.orders.size,
        grossAmount: roundMoney(row.grossAmount),
        estimatedReceived: roundMoney(row.estimatedReceived),
        allocatedCharges: roundMoney(row.allocatedCharges),
        saleFullCosts: roundMoney(row.saleFullCosts),
        productCost: roundMoney(row.productCost),
        contributionProfit: roundMoney(contributionProfit),
        fullBillingCharges: roundMoney(row.fullBillingCharges),
        finalNetProfit: roundMoney(finalNetProfit),
        marginPercent:
          row.grossAmount > 0 ? (finalNetProfit / row.grossAmount) * 100 : 0,
      };
    })
    .sort(
      (a, b) =>
        b.month.localeCompare(a.month) ||
        a.finalNetProfit - b.finalNetProfit ||
        b.grossAmount - a.grossAmount,
    );
}

function buildFullBillingProductMonthlySummary(store: LocalStore) {
  const productBySku = new Map(
    store.products.map((product) => [
      normalizeSkuKey(product.masterSku),
      product,
    ]),
  );
  const billingMapping = buildFullBillingMasterSkuResolver(store);
  const rows = new Map<
    string,
    {
      key: string;
      month: string;
      masterSku: string;
      title: string;
      soldUnits: number;
      consumedUnits: number;
      orders: number;
      grossAmount: number;
      estimatedReceived: number;
      allocatedCharges: number;
      saleFullCosts: number;
      productCost: number;
      fullBillingCharges: number;
    }
  >();

  for (const charge of store.fullBillingCharges ?? []) {
    const masterSku = billingMapping(charge) ?? "SIN_MAPEAR_FULL";
    const month = toReportMonth(charge.period);
    const product = productBySku.get(normalizeSkuKey(masterSku));
    const key = `${month}:${masterSku}`;
    const row = rows.get(key) ?? {
      key,
      month,
      masterSku,
      title: product?.name ?? charge.productTitle,
      soldUnits: 0,
      consumedUnits: 0,
      orders: 0,
      grossAmount: 0,
      estimatedReceived: 0,
      allocatedCharges: 0,
      saleFullCosts: 0,
      productCost: 0,
      fullBillingCharges: 0,
    };

    row.fullBillingCharges += charge.amount;
    rows.set(key, row);
  }

  return [...rows.values()]
    .map((row) => ({
      ...row,
      fullBillingCharges: roundMoney(row.fullBillingCharges),
      contributionProfit: 0,
      finalNetProfit: roundMoney(-row.fullBillingCharges),
      marginPercent: 0,
    }))
    .sort((a, b) => b.month.localeCompare(a.month) || a.masterSku.localeCompare(b.masterSku));
}

function buildFullBillingMasterSkuResolver(store: LocalStore) {
  const onlineSkuByExternalSku = new Map(
    store.onlineSkus.map((sku) => [normalizeSkuKey(sku.onlineSku), sku]),
  );
  const fullRows = [
    ...(store.fullStockSync?.items ?? []),
    ...(store.fullStockSync?.auditItems ?? []),
  ];
  const fullRowByInventoryId = new Map(
    fullRows.map((row) => [row.inventoryId, row]),
  );
  const onlineSkuByListingId = new Map(
    store.onlineSkus
      .filter((sku) => sku.externalListingId)
      .map((sku) => [sku.externalListingId ?? "", sku]),
  );

  return (charge: LocalFullBillingCharge) => {
    const skuMapping = charge.externalSku
      ? onlineSkuByExternalSku.get(normalizeSkuKey(charge.externalSku))
      : undefined;
    const fullRow = charge.inventoryId
      ? fullRowByInventoryId.get(charge.inventoryId)
      : undefined;
    const listingMapping = charge.listingId
      ? onlineSkuByListingId.get(charge.listingId)
      : undefined;

    return (
      skuMapping?.components[0]?.masterSku ??
      fullRow?.masterSku ??
      listingMapping?.components[0]?.masterSku ??
      null
    );
  };
}

export const buildProfitReport = cache(async function buildProfitReport(input?: {
  includeProductSummary?: boolean;
  includeProductMonthlySummary?: boolean | "fullBillingOnly";
  includeProductOptions?: boolean;
  orderLimit?: number;
  orderDateFrom?: string | null;
  orderDateTo?: string | null;
}) {
  const includeProductSummary = input?.includeProductSummary ?? true;
  const includeProductMonthlySummary = input?.includeProductMonthlySummary ?? true;
  const includeProductOptions = input?.includeProductOptions ?? true;
  const store = await readReportStore(input?.orderLimit ?? getReportOrderLimit(), {
    orderedFrom: input?.orderDateFrom,
    orderedTo: input?.orderDateTo,
  });
  const productImageByMasterSku = buildProductImageMap(store);
  const imageByOnlineSku = buildOnlineSkuImageMap(store);
  const orders = groupMarketplaceOrdersByRealSale(store.marketplaceOrders)
    .map(({ key, orders: group }) =>
      buildRealSaleOrder({
        groupKey: key,
        group,
        store,
        productImageByMasterSku,
        imageByOnlineSku,
        withProductCost: true,
      }),
    )
    .sort(
      (a, b) => new Date(b.orderedAt).getTime() - new Date(a.orderedAt).getTime(),
    );

  const settledOrders = orders.filter((order) => !order.isReceivedPending);
  const activeSettledOrders = settledOrders.filter((order) => !order.isCancelled);
  const pendingBillingOrders = orders.filter((order) => order.isReceivedPending);
  const cancelledOrders = orders.filter((order) => order.isCancelled);
  const operatingExpenses = store.operatingExpenses
    .slice()
    .sort((a, b) => b.month.localeCompare(a.month) || b.id.localeCompare(a.id));
  const monthlySummary = buildMonthlyProfitSummary({
    settledOrders: activeSettledOrders,
    operatingExpenses,
    fullBillingCharges: store.fullBillingCharges ?? [],
  });
  const operatingExpenseTotal = monthlySummary.reduce(
    (sum, row) => sum + row.operatingExpenses,
    0,
  );
  const fullBillingTotal = monthlySummary.reduce(
    (sum, row) => sum + row.fullBillingCharges,
    0,
  );

  return {
    organization: store.organization,
    orders,
    settledOrders,
    cancelledOrders,
    pendingBillingOrders,
    productSummary: includeProductSummary
      ? buildProductProfitSummary(activeSettledOrders)
      : [],
    productMonthlySummary: includeProductMonthlySummary === "fullBillingOnly"
      ? buildFullBillingProductMonthlySummary(store)
      : includeProductMonthlySummary
      ? buildProductMonthlyProfitSummary({
          settledOrders: activeSettledOrders,
          store,
        })
      : [],
    productOptions: includeProductOptions
      ? store.products
          .slice()
          .sort((a, b) => a.masterSku.localeCompare(b.masterSku))
          .map((product) => ({
            masterSku: product.masterSku,
            name: product.name,
          }))
      : [],
    operatingExpenses,
    monthlySummary,
    totals: {
      orders: activeSettledOrders.length,
      allOrders: orders.length,
      pendingBillingOrders: pendingBillingOrders.length,
      pendingBillingGrossAmount: pendingBillingOrders.reduce(
        (sum, order) => sum + order.grossAmount,
        0,
      ),
      grossAmount: activeSettledOrders.reduce((sum, order) => sum + order.grossAmount, 0),
      estimatedReceived: activeSettledOrders.reduce(
        (sum, order) => sum + order.estimatedReceived,
        0,
      ),
      productCost: activeSettledOrders.reduce((sum, order) => sum + order.productCost, 0),
      additionalCosts: activeSettledOrders.reduce((sum, order) => sum + order.additionalCosts, 0),
      fullBillingCharges: fullBillingTotal,
      netProfit: activeSettledOrders.reduce((sum, order) => sum + order.netProfit, 0),
      operatingExpenses: operatingExpenseTotal,
      finalNetProfit:
        activeSettledOrders.reduce((sum, order) => sum + order.netProfit, 0) -
        fullBillingTotal -
        operatingExpenseTotal,
      missingCostOrders: activeSettledOrders.filter((order) => order.missingCostItems > 0).length,
      unmappedOrders: activeSettledOrders.filter((order) => order.unmappedItems > 0).length,
      pendingReceivedOrders: pendingBillingOrders.length,
    },
  };
});

function buildMonthlyProfitSummary(input: {
  settledOrders: Array<{
    orderedAt: string;
    grossAmount: number;
    estimatedReceived: number;
    productCost: number;
    additionalCosts: number;
    netProfit: number;
  }>;
  operatingExpenses: Array<{
    month: string;
    amount: number;
    frequency?: string | null;
    paidAt?: string | null;
    periodStart?: string | null;
    activeUntil?: string | null;
    isRecurring?: boolean | null;
  }>;
  fullBillingCharges: LocalFullBillingCharge[];
}) {
  const months = new Map<
    string,
    {
      month: string;
      orders: number;
      grossAmount: number;
      estimatedReceived: number;
      productCost: number;
      additionalCosts: number;
      fullBillingCharges: number;
      contributionProfit: number;
      operatingExpenses: number;
      finalNetProfit: number;
    }
  >();

  function getMonth(month: string) {
    const row = months.get(month) ?? {
      month,
      orders: 0,
      grossAmount: 0,
      estimatedReceived: 0,
      productCost: 0,
      additionalCosts: 0,
      fullBillingCharges: 0,
      contributionProfit: 0,
      operatingExpenses: 0,
      finalNetProfit: 0,
    };
    months.set(month, row);
    return row;
  }

  const reportMonths = new Set<string>();

  for (const order of input.settledOrders) {
    const month = toReportMonth(order.orderedAt);
    reportMonths.add(month);
    const row = getMonth(month);
    row.orders += 1;
    row.grossAmount += order.grossAmount;
    row.estimatedReceived += order.estimatedReceived;
    row.productCost += order.productCost;
    row.additionalCosts += order.additionalCosts;
    row.contributionProfit += order.netProfit;
  }

  for (const expense of input.operatingExpenses) {
    reportMonths.add(expense.month);
    if (expense.periodStart) {
      reportMonths.add(toReportMonth(expense.periodStart));
    }
    if (expense.paidAt) {
      reportMonths.add(toReportMonth(expense.paidAt));
    }
  }

  for (const charge of input.fullBillingCharges) {
    reportMonths.add(toReportMonth(charge.period));
  }

  const currentMonth = toReportMonth(new Date().toISOString());
  const currentBusinessDate = getCurrentBusinessDateOnly();
  reportMonths.add(currentMonth);
  for (const expense of input.operatingExpenses) {
    const firstMonth = expense.periodStart
      ? toReportMonth(expense.periodStart)
      : expense.paidAt
        ? toReportMonth(expense.paidAt)
        : expense.month;
    for (const month of enumerateMonths(firstMonth, currentMonth, 36)) {
      reportMonths.add(month);
    }
  }

  for (const month of reportMonths) {
    getMonth(month);
  }

  for (const expense of input.operatingExpenses) {
    for (const month of reportMonths) {
      const amount = calculateExpenseAmountForMonth(expense, month, {
        asOf: month === currentMonth ? currentBusinessDate : null,
      });
      if (amount > 0) {
        const row = getMonth(month);
        row.operatingExpenses += amount;
      }
    }
  }

  for (const charge of input.fullBillingCharges) {
    const row = getMonth(toReportMonth(charge.period));
    row.fullBillingCharges += charge.amount;
  }

  return [...months.values()]
    .map((row) => ({
      ...row,
      grossAmount: roundMoney(row.grossAmount),
      estimatedReceived: roundMoney(row.estimatedReceived),
      productCost: roundMoney(row.productCost),
      additionalCosts: roundMoney(row.additionalCosts),
      fullBillingCharges: roundMoney(row.fullBillingCharges),
      contributionProfit: roundMoney(row.contributionProfit),
      operatingExpenses: roundMoney(row.operatingExpenses),
      finalNetProfit: roundMoney(
        row.contributionProfit - row.fullBillingCharges - row.operatingExpenses,
      ),
      contributionMargin:
        row.grossAmount > 0 ? (row.contributionProfit / row.grossAmount) * 100 : 0,
      finalMargin:
        row.grossAmount > 0
          ? ((row.contributionProfit -
              row.fullBillingCharges -
              row.operatingExpenses) /
              row.grossAmount) *
            100
          : 0,
    }))
    .sort((a, b) => b.month.localeCompare(a.month));
}

function toReportMonth(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return getCurrentReportMonth();
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: businessTimeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}`;
}

function getCurrentReportMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: businessTimeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}`;
}

function getCurrentBusinessDateOnly() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: businessTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function enumerateMonths(startMonth: string, endMonth: string, maxMonths: number) {
  const start = parseReportMonth(startMonth);
  const end = parseReportMonth(endMonth);
  if (!start || !end || start > end) return [];

  const months: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end && months.length < maxMonths) {
    months.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

function parseReportMonth(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 1, 1));
}

export async function buildOrderDetailReport(externalOrderId: string) {
  const store = await readReportStore(getReportOrderLimit(), {
    query: externalOrderId,
  });
  const marketplaceOrders = store.marketplaceOrders;
  const realSaleGroups = groupMarketplaceOrdersByRealSale(marketplaceOrders);
  const realSaleGroup = realSaleGroups.find(
    (entry) => marketplaceRealSaleMatchesIdentifier(entry.orders, externalOrderId, entry.key),
  );
  const baseOrder =
    realSaleGroup?.orders[0] ??
    marketplaceOrders.find((entry) =>
      marketplaceOrderMatchesIdentifier(entry, externalOrderId),
    );

  if (!baseOrder) {
    return null;
  }

  const groupKey = realSaleGroup?.key ?? getMarketplaceRealSaleKey(baseOrder);
  const group = realSaleGroup?.orders ?? [baseOrder];
  const productImageByMasterSku = buildProductImageMap(store);
  const imageByOnlineSku = buildOnlineSkuImageMap(store);
  const order = buildRealSaleOrder({
    groupKey,
    group,
    store,
    productImageByMasterSku,
    imageByOnlineSku,
    withProductCost: true,
  });
  const account = store.marketplaceAccounts.find(
    (entry) => entry.id === order.marketplaceAccountId,
  );

  return {
    organization: store.organization,
    accountAlias: account?.alias ?? order.marketplaceAccountId,
    masterSkuOptions: store.products
      .filter((product) => product.isActive !== false)
      .map((product) => ({
        masterSku: product.masterSku,
        name: product.name,
      }))
      .sort((a, b) => a.masterSku.localeCompare(b.masterSku)),
    order: {
      ...order,
      missingCostItems: order.items.filter(
        (item) => item.masterSku && item.averageUnitCost <= 0,
      ).length,
      unmappedItems: order.items.filter((item) => !item.masterSku).length,
    },
  };
}

export async function buildSkuDetailReport(masterSku: string) {
  const store = await readReportStore();
  const decodedSku = decodeURIComponent(masterSku);
  const product = store.products.find(
    (entry) => entry.masterSku.toLowerCase() === decodedSku.toLowerCase(),
  );
  const productImageByMasterSku = buildProductImageMap(store);
  const warehouseById = new Map(
    store.warehouses.map((warehouse) => [warehouse.id, warehouse]),
  );
  const marketplaceAccountById = new Map(
    store.marketplaceAccounts.map((account) => [account.id, account]),
  );
  const committedBySkuWarehouse = new Map(
    buildStockCommitments(store.marketplaceOrders).map((commitment) => [
      `${commitment.masterSku}::${commitment.warehouseId}`,
      commitment,
    ]),
  );
  const balances = store.inventoryBalances
    .filter((balance) => balance.masterSku.toLowerCase() === decodedSku.toLowerCase())
    .map((balance) => {
      const warehouse = warehouseById.get(balance.warehouseId);
      const committedQuantity =
        committedBySkuWarehouse.get(`${balance.masterSku}::${balance.warehouseId}`)
          ?.quantity ?? 0;
      return {
        ...balance,
        warehouseName: warehouse?.name ?? balance.warehouseId,
        warehouseType: warehouse?.type ?? "unknown",
        committedQuantity,
        estimatedPhysicalQuantity: balance.physicalQuantity + committedQuantity,
        availableQuantity:
          balance.physicalQuantity - balance.reservedQuantity - balance.blockedQuantity,
      };
    });
  const onlineSkus = store.onlineSkus
    .filter((sku) =>
      sku.components.some(
        (component) => component.masterSku.toLowerCase() === decodedSku.toLowerCase(),
      ),
    )
    .map((sku) => ({
      ...sku,
      quantityRequired:
        sku.components.find(
          (component) => component.masterSku.toLowerCase() === decodedSku.toLowerCase(),
        )?.quantityRequired ?? 0,
    }));
  const onlineSkuChoiceByKey = new Map<
    string,
    {
      onlineSku: string;
      title: string;
      channel: string;
      marketplaceAccount: string;
      accountAlias: string;
      imageUrl?: string | null;
      isMapped: boolean;
      isLinkedToThisProduct: boolean;
      linkedMasterSkus: string[];
    }
  >();
  const rememberOnlineSkuChoice = (input: {
    onlineSku: string | null | undefined;
    title: string | null | undefined;
    imageUrl?: string | null | undefined;
    channel: string | null | undefined;
    marketplaceAccount: string | null | undefined;
  }) => {
    const onlineSku = input.onlineSku?.trim();
    if (!onlineSku) {
      return;
    }

    const key = normalizeSkuKey(onlineSku);
    const existingMapping = store.onlineSkus.find(
      (sku) => normalizeSkuKey(sku.onlineSku) === key,
    );
    const accountId = input.marketplaceAccount ?? existingMapping?.marketplaceAccount ?? "";
    const account = marketplaceAccountById.get(accountId);
    const linkedMasterSkus = existingMapping
      ? [
          ...new Set(
            existingMapping.components
              .map((component) => component.masterSku)
              .filter(Boolean),
          ),
        ]
      : [];
    const existingChoice = onlineSkuChoiceByKey.get(key);
    const title =
      existingMapping?.title?.trim() ||
      input.title?.trim() ||
      existingChoice?.title ||
      onlineSku;
    const imageUrl =
      normalizeImageUrl(existingMapping?.imageUrl) ??
      normalizeImageUrl(input.imageUrl) ??
      existingChoice?.imageUrl ??
      null;

    const marketplaceAccount =
      existingMapping?.marketplaceAccount ??
      existingChoice?.marketplaceAccount ??
      (accountId || "manual_mapping");
    const accountAlias =
      account?.alias ??
      account?.nickname ??
      existingChoice?.accountAlias ??
      (accountId || "Manual");

    onlineSkuChoiceByKey.set(key, {
      onlineSku: existingMapping?.onlineSku ?? existingChoice?.onlineSku ?? onlineSku,
      title,
      channel:
        existingMapping?.channel ??
        existingChoice?.channel ??
        input.channel ??
        "mercado_libre",
      marketplaceAccount,
      accountAlias,
      imageUrl,
      isMapped: Boolean(existingMapping),
      isLinkedToThisProduct: linkedMasterSkus.some(
        (linkedSku) => linkedSku.toLowerCase() === decodedSku.toLowerCase(),
      ),
      linkedMasterSkus,
    });
  };

  for (const sku of store.onlineSkus) {
    rememberOnlineSkuChoice({
      onlineSku: sku.onlineSku,
      title: sku.title,
      imageUrl: sku.imageUrl,
      channel: sku.channel,
      marketplaceAccount: sku.marketplaceAccount,
    });
  }
  for (const order of store.marketplaceOrders) {
    for (const item of order.items) {
      rememberOnlineSkuChoice({
        onlineSku: item.externalSku,
        title: item.title,
        imageUrl: item.imageUrl,
        channel: order.channel,
        marketplaceAccount: order.marketplaceAccountId,
      });
    }
  }
  for (const item of store.fullStockSync?.items ?? []) {
    rememberOnlineSkuChoice({
      onlineSku: item.externalSku,
      title: item.title,
      imageUrl: item.imageUrl,
      channel: "mercado_libre",
      marketplaceAccount: store.fullStockSync?.accountId,
    });
  }
  for (const item of store.fullStockSync?.auditItems ?? []) {
    rememberOnlineSkuChoice({
      onlineSku: item.externalSku,
      title: item.title,
      imageUrl: item.imageUrl,
      channel: "mercado_libre",
      marketplaceAccount: store.fullStockSync?.accountId,
    });
  }
  for (const item of store.fullStockSync?.unmappedItems ?? []) {
    rememberOnlineSkuChoice({
      onlineSku: item.externalSku,
      title: item.title,
      imageUrl: item.imageUrl,
      channel: "mercado_libre",
      marketplaceAccount: store.fullStockSync?.accountId,
    });
  }
  const onlineSkuChoices = [...onlineSkuChoiceByKey.values()].sort((a, b) => {
    const linkedSort = Number(b.isLinkedToThisProduct) - Number(a.isLinkedToThisProduct);
    const mappedSort = Number(a.isMapped) - Number(b.isMapped);
    return (
      linkedSort ||
      mappedSort ||
      a.onlineSku.localeCompare(b.onlineSku, "es")
    );
  });
  const orders = store.marketplaceOrders
    .filter((order) =>
      order.items.some(
        (item) => item.masterSku?.toLowerCase() === decodedSku.toLowerCase(),
      ),
    )
    .map((order) => {
      const relatedItems = order.items.filter(
        (item) => item.masterSku?.toLowerCase() === decodedSku.toLowerCase(),
      );
      const account = marketplaceAccountById.get(order.marketplaceAccountId);
      return {
        externalOrderId: order.externalOrderId,
        channel: order.channel,
        marketplaceAccountId: order.marketplaceAccountId,
        accountAlias: account?.alias ?? account?.nickname ?? order.marketplaceAccountId,
        status: order.status,
        orderedAt: order.orderedAt,
        grossAmount: order.grossAmount,
        netReceivedAmount: order.netReceivedAmount,
        items: relatedItems.map((item) => ({
          ...item,
          warehouseName: warehouseById.get(item.warehouseId)?.name ?? item.warehouseId,
        })),
      };
    })
    .sort((a, b) => new Date(b.orderedAt).getTime() - new Date(a.orderedAt).getTime());
  const movements = store.inventoryMovements
    .filter((movement) => movement.masterSku.toLowerCase() === decodedSku.toLowerCase())
    .map((movement) => ({
      ...movement,
      warehouseName:
        warehouseById.get(movement.warehouseId)?.name ?? movement.warehouseId,
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const fullLayers = store.fullInventoryLayers
    .filter((layer) => layer.masterSku.toLowerCase() === decodedSku.toLowerCase())
    .sort(
      (a, b) =>
        new Date(b.dateReceived).getTime() - new Date(a.dateReceived).getTime(),
    );
  const averageUnitCost = product?.averageUnitCost ?? 0;
  const physicalQuantity = balances.reduce(
    (sum, balance) => sum + balance.physicalQuantity,
    0,
  );
  const committedQuantity = balances.reduce(
    (sum, balance) => sum + balance.committedQuantity,
    0,
  );

  if (!product && balances.length === 0 && onlineSkus.length === 0) {
    return null;
  }

  return {
    organization: store.organization,
    warehouses: store.warehouses,
    product: {
      masterSku: product?.masterSku ?? decodedSku,
      name: product?.name ?? decodedSku,
      imageUrl:
        productImageByMasterSku.get(normalizeSkuKey(product?.masterSku ?? decodedSku)) ?? null,
      currentStock: product?.currentStock ?? physicalQuantity,
      totalIngresado: product?.totalIngresado ?? 0,
      totalVendido: product?.totalVendido ?? 0,
      averageUnitCost,
      inventoryValue: physicalQuantity * averageUnitCost,
    },
    balances,
    onlineSkus,
    onlineSkuChoices,
    orders,
    movements,
    fullLayers,
    totals: {
      physicalQuantity,
      committedQuantity,
      estimatedPhysicalQuantity: physicalQuantity + committedQuantity,
      sellableQuantity: balances.reduce((sum, balance) => sum + balance.availableQuantity, 0),
      soldUnits: orders.reduce(
        (sum, order) =>
          sum +
          order.items.reduce(
            (itemSum, item) => itemSum + (item.consumedQuantity ?? 0),
            0,
          ),
        0,
      ),
    },
  };
}

function getAdditionalCosts(charges: Array<{ amount: number; source: string }>) {
  return charges
    .filter((charge) => charge.source.startsWith("full_fifo:"))
    .reduce((sum, charge) => sum + charge.amount, 0);
}

function productHasHistoricalReferences(store: LocalStore, masterSku: string) {
  const normalizedMasterSku = normalizeSkuKey(masterSku);

  return (
    store.onlineSkus.some((sku) =>
      sku.components.some(
        (component) => normalizeSkuKey(component.masterSku) === normalizedMasterSku,
      ),
    ) ||
    store.sales.some(
      (sale) => normalizeSkuKey(sale.masterSku) === normalizedMasterSku,
    ) ||
    store.marketplaceOrders.some((order) =>
      order.items.some(
        (item) => normalizeSkuKey(item.masterSku ?? "") === normalizedMasterSku,
      ) ||
      (order.fullCostAllocations ?? []).some(
        (allocation) => normalizeSkuKey(allocation.masterSku) === normalizedMasterSku,
      ),
    ) ||
    store.fullInventoryLayers.some(
      (layer) => normalizeSkuKey(layer.masterSku) === normalizedMasterSku,
    )
  );
}
