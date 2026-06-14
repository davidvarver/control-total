import fs from "node:fs/promises";
import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import {
  Channel,
  InventoryMovementType,
  SaleChargeType,
  WarehouseType,
  type Prisma,
} from "@prisma/client";
import {
  normalizeExpenseFrequency,
  type ExpenseFrequency,
} from "../domain/expenses";
import { normalizeSkuKey } from "../domain/sku-match";
import { isCancelledOrder, pruneMeliOrder } from "../meli/normalize";
import { getCurrentUser, getRegisteredOrganizationIds } from "./auth-store";
import { hasDatabaseUrl } from "./database-url";
import { createEmptyStore } from "./empty-store";
import { prisma } from "./prisma";
import { decryptSecret, encryptSecret } from "./secret-crypto";
import { buildStockCommitments } from "./stock-commitments";

export type LocalProduct = {
  id: string;
  masterSku: string;
  name: string;
  currentStock: number;
  totalIngresado: number;
  totalVendido: number;
  targetInventoryDays: number;
  averageUnitCost?: number;
  isActive?: boolean;
};

export type LocalStore = {
  version: number;
  importedAt: string;
  inventoryBaselineAt?: string;
  organization: {
    id: string;
    name: string;
  };
  warehouses: Array<{
    id: string;
    name: string;
    type: string;
    channel: string | null;
    isSellable: boolean;
    isExclusive: boolean;
  }>;
  products: LocalProduct[];
  onlineSkus: Array<{
    id: string;
    onlineSku: string;
    title: string;
    imageUrl?: string | null;
    channel: string;
    marketplaceAccount: string;
    externalListingId?: string | null;
    safetyBufferUnits: number;
    components: Array<{
      masterSku: string;
      quantityRequired: number;
    }>;
  }>;
  marketplaceAccounts: LocalMarketplaceAccount[];
  marketplaceOrders: LocalMarketplaceOrder[];
  integrationEvents: LocalIntegrationEvent[];
  sales: Array<{
    date: string | null;
    onlineSku: string;
    masterSku: string;
    quantity: number;
    consumedQuantity: number;
    platform: string;
  }>;
  inventoryBalances: Array<{
    masterSku: string;
    warehouseId: string;
    physicalQuantity: number;
    reservedQuantity: number;
    blockedQuantity: number;
  }>;
  inventoryMovements: LocalInventoryMovement[];
  fullInventoryLayers: LocalFullInventoryLayer[];
  fullBillingCharges: LocalFullBillingCharge[];
  fullStockSync?: {
    syncedAt: string;
    accountId: string;
    totalFulfillmentUnits: number;
    mappedUnits: number;
    items?: LocalFullStockSnapshotItem[];
    auditedAt?: string;
    auditItems?: LocalFullStockSnapshotItem[];
    unmappedItems: Array<{
      externalSku: string;
      title: string;
      imageUrl?: string | null;
      inventoryId: string;
      availableQuantity: number;
      total: number;
      notAvailableQuantity?: number;
      notAvailableDetail?: Array<{
        status: string;
        quantity: number;
      }>;
    }>;
  };
  costSkuMappings: Array<{
    costSku: string;
    masterSku?: string;
    masterSkus?: string[];
  }>;
  ignoredCostSkus: string[];
  dismissedRareChargeAlerts: Array<{
    id: string;
    dismissedAt: string;
    reason?: string;
  }>;
  archivedUnmappedSkus: Array<{
    id: string;
    channel: string;
    marketplaceAccountId: string;
    onlineSku: string;
    title: string;
    archivedAt: string;
  }>;
  dismissedFullAuditAlerts: Array<{
    id: string;
    dismissedAt: string;
    reason?: string;
  }>;
  pendingCostImports: Array<{
    costSku: string;
    averageUnitCost: number;
    suggestedMasterSkus: string[];
  }>;
  operatingExpenses: LocalOperatingExpense[];
};

type RelationalStoreSlices = Pick<LocalStore, "operatingExpenses" | "fullInventoryLayers">;

export type LocalOperatingExpense = {
  id: string;
  month: string;
  category: string;
  description: string;
  amount: number;
  paidAt?: string;
  isRecurring?: boolean;
  frequency?: ExpenseFrequency;
  periodStart?: string;
  activeUntil?: string;
};

export type LocalFullInventoryLayer = {
  id: string;
  dateReceived: string;
  masterSku: string;
  initialQuantity: number;
  remainingQuantity: number;
  unitVolumeM3: number;
  inboundFreightCostTotal: number;
  inboundFreightCostPerUnit: number;
  storageCostPerUnitPerDay: number;
  note?: string;
};

export type LocalFullStockSnapshotItem = {
  externalSku: string;
  title: string;
  imageUrl?: string | null;
  inventoryId: string;
  listingId: string;
  variationId: string | null;
  masterSku: string | null;
  availableQuantity: number;
  total: number;
  notAvailableQuantity: number;
  notAvailableDetail: Array<{
    status: string;
    quantity: number;
  }>;
  componentQuantityRequired: number | null;
  availableConsumedQuantity: number | null;
  totalConsumedQuantity: number | null;
  notAvailableConsumedQuantity: number | null;
  components?: Array<{
    masterSku: string;
    quantityRequired: number;
    availableConsumedQuantity: number;
    totalConsumedQuantity: number;
    notAvailableConsumedQuantity: number;
  }>;
};

export type LocalMarketplaceListingImage = {
  onlineSku: string;
  title: string;
  listingId: string;
  variationId: string | null;
  imageUrl?: string | null;
};

export type LocalFullBillingCharge = {
  id: string;
  accountId: string;
  period: string;
  syncedAt: string;
  productTitle: string;
  externalSku?: string | null;
  externalProductId?: string | null;
  inventoryId?: string | null;
  listingId?: string | null;
  size?: string | null;
  detailType?: string | null;
  chargeType?: string | null;
  ageBucket:
    | "up_to_2_months"
    | "2_to_4_months"
    | "4_to_6_months"
    | "6_to_12_months"
    | "over_12_months"
    | "other";
  amount: number;
  units: number;
  currency?: string | null;
  raw: unknown;
};

export type LocalInventoryMovement = {
  id: string;
  date: string;
  type: "adjustment" | "transfer" | "sale" | "return" | "sync" | "import";
  masterSku: string;
  warehouseId: string;
  quantity: number;
  reference: string;
  note?: string;
};

export type LocalMarketplaceAccount = {
  id: string;
  channel: "mercado_libre";
  alias: string;
  externalAccountId: string;
  nickname?: string;
  siteId?: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: string;
  lastSyncAt?: string;
  salesBackfill?: {
    from: string;
    to: string;
    offset: number;
    startedAt: string;
    completedAt?: string;
    lastRunAt?: string;
    lastTotal?: number;
  };
  salesAutomation?: {
    lastRecentRunAt?: string;
    lastRunAt?: string;
    lastMode?: "backfill" | "basic_import" | "recent" | "skip_recent";
    lastChecked?: number;
    lastImported?: number;
    lastTotal?: number;
    lastBacklogRemaining?: number;
    nextRecommendedMinutes?: number;
    lastError?: string;
  };
  status: "connected" | "error" | "disabled";
};

export type LocalMarketplaceOrder = {
  id: string;
  channel: "mercado_libre" | "manual" | "tiktok" | "whatsapp" | "external";
  marketplaceAccountId: string;
  externalOrderId: string;
  packId?: string | null;
  shippingId?: string | null;
  status: string;
  orderedAt: string;
  grossAmount: number;
  netReceivedAmount: number | null;
  billingStatus?: "confirmed" | "pending" | "error";
  billingLastTriedAt?: string;
  billingError?: string | null;
  currency: string;
  raw: unknown;
  items: Array<{
    externalSku: string;
    title: string;
    imageUrl?: string | null;
    quantity: number;
    unitPrice: number;
    masterSku: string | null;
    consumedQuantity: number | null;
    warehouseId: string;
    logisticType: string | null;
    components?: Array<{
      masterSku: string;
      quantityRequired: number;
      consumedQuantity: number;
    }>;
  }>;
  charges: Array<{
    type: string;
    amount: number;
    source: string;
  }>;
  fullCostAllocations?: Array<{
    layerId: string;
    masterSku: string;
    quantity: number;
    inboundFreightCost: number;
    storageCost: number;
    storageDays: number;
  }>;
  inventoryApplied?: boolean;
  inventoryApplications?: Array<{
    masterSku: string;
    warehouseId: string;
    quantity: number;
  }>;
};

export type ManualSaleLineInput = {
  masterSku: string;
  quantity: number;
  unitPrice: number;
};

export type LocalIntegrationEvent = {
  id: string;
  channel: "mercado_libre";
  topic: string;
  resource: string;
  userId?: string;
  receivedAt: string;
  processedAt?: string;
  status: "received" | "processed" | "ignored" | "error";
  error?: string;
};

const bundledStorePath = path.join(process.cwd(), "data", "local-store.json");
const defaultOrganizationId = "org_public";
const useDatabaseStore = hasDatabaseUrl();
const organizationContext = new AsyncLocalStorage<{
  id: string;
  name?: string;
}>();
const relationalIdPrefix = "ct";

export function toRelationalId(
  organizationId: string,
  kind: string,
  localId: string,
) {
  const normalizedLocalId = String(localId || kind).trim() || kind;
  return [
    relationalIdPrefix,
    kind,
    base64UrlEncode(organizationId),
    base64UrlEncode(normalizedLocalId),
  ].join("_");
}

export function fromRelationalId(organizationId: string, value: string) {
  const prefix = `${relationalIdPrefix}_`;
  if (!value.startsWith(prefix)) {
    return value;
  }

  const parts = value.split("_");
  if (parts.length !== 4) {
    return value;
  }

  try {
    const encodedOrganizationId = base64UrlEncode(organizationId);
    if (parts[2] !== encodedOrganizationId) {
      return value;
    }

    return base64UrlDecode(parts[3]) || value;
  } catch {
    return value;
  }
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  return Buffer.from(padded, "base64").toString("utf8");
}

function sanitizeOrganizationId(organizationId: string) {
  return organizationId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function runtimeStorePathFor(organizationId: string) {
  if (organizationId === defaultOrganizationId) {
    return process.env.VERCEL
      ? path.join("/tmp", "control-total-local-store.json")
      : bundledStorePath;
  }

  return process.env.VERCEL
    ? path.join("/tmp", `control-total-store-${sanitizeOrganizationId(organizationId)}.json`)
    : path.join(
        process.cwd(),
        "data",
        "organizations",
        `${sanitizeOrganizationId(organizationId)}.json`,
      );
}

async function resolveOrganization() {
  const forcedOrganization = organizationContext.getStore();
  if (forcedOrganization) {
    return {
      id: forcedOrganization.id,
      name: forcedOrganization.name ?? "Control Total",
    };
  }

  const user = await getCurrentUser();
  return {
    id: user?.organizationId ?? defaultOrganizationId,
    name: user?.organizationName ?? "Control Total",
  };
}

export async function runWithOrganization<T>(
  organization: { id: string; name?: string },
  callback: () => Promise<T>,
) {
  return organizationContext.run(organization, callback);
}

async function ensureRuntimeStore(organization: { id: string; name: string }) {
  const runtimeStorePath = runtimeStorePathFor(organization.id);
  try {
    await fs.access(runtimeStorePath);
  } catch {
    let bundled: string;
    try {
      bundled = await fs.readFile(bundledStorePath, "utf8");
    } catch {
      bundled = `${JSON.stringify(createEmptyStore(), null, 2)}\n`;
    }
    const store = JSON.parse(bundled) as LocalStore;
    store.organization = {
      id: organization.id,
      name: organization.name,
    };
    bundled = `${JSON.stringify(store, null, 2)}\n`;
    await fs.mkdir(path.dirname(runtimeStorePath), { recursive: true });
    await fs.writeFile(runtimeStorePath, bundled, "utf8");
  }
}

export async function readLocalStore(): Promise<LocalStore> {
  const organization = await resolveOrganization();

  if (useDatabaseStore && organization.id !== defaultOrganizationId) {
    try {
      const dataStore = await prisma.localDataStore.findUnique({
        where: { organizationId: organization.id },
      });

      const store = dataStore
        ? (dataStore.payload as LocalStore)
        : createEmptyStore();

      const normalized = normalizeStoreForOrganization(store, organization);

      // Dynamic relational fetch for OperatingExpense and FullInventoryLayer
      try {
        Object.assign(
          normalized,
          await readRelationalStoreSlices(organization.id),
        );
      } catch (err) {
        console.error("[Database Store Read Error] Failed to fetch relational tables:", err);
        throw err;
      }

      return normalized;
    } catch (dbErr) {
      console.error("[Database Store Read Error] Database query failed:", dbErr);
      throw dbErr;
    }
  }

  const runtimeStorePath = runtimeStorePathFor(organization.id);
  await ensureRuntimeStore(organization);
  const contents = await fs.readFile(runtimeStorePath, "utf8");
  const store = JSON.parse(contents) as LocalStore;
  return normalizeStoreForOrganization(store, organization);
}

export async function writeLocalStore(
  store: LocalStore,
  options?: { ordersToMirror?: LocalMarketplaceOrder[] },
) {
  const organization = await resolveOrganization();
  
  // Capture previous store state to compute stock changes for automatic sync queueing
  let previousStore: LocalStore | null = null;
  try {
    previousStore = await readOrganizationStore(organization.id);
  } catch {
    // Ignore on new database initializations
  }

  store = normalizeStoreForOrganization(store, organization);

  let dbWriteSuccess = false;

  if (useDatabaseStore && organization.id !== defaultOrganizationId) {
    try {
      const relationalSlices = await readRelationalStoreSlices(organization.id);
      const canReplaceExpenses =
        store.operatingExpenses.length > 0 ||
        relationalSlices.operatingExpenses.length === 0;
      const canReplaceLayers =
        store.fullInventoryLayers.length > 0 ||
        relationalSlices.fullInventoryLayers.length === 0;
      const expenses = canReplaceExpenses
        ? store.operatingExpenses
        : relationalSlices.operatingExpenses;
      const layers = canReplaceLayers
        ? store.fullInventoryLayers
        : relationalSlices.fullInventoryLayers;

      // Persist JSON payload WITHOUT operatingExpenses and fullInventoryLayers
      const persistedStore = compactStoreForPersistence({
        ...store,
        operatingExpenses: [],
        fullInventoryLayers: []
      });

      await prisma.localDataStore.upsert({
        where: { organizationId: organization.id },
        create: {
          organizationId: organization.id,
          payload: toJsonPayload(persistedStore),
        },
        update: {
          payload: toJsonPayload(persistedStore),
        },
      });

      await persistRelationalSlices(organization.id, expenses, layers);
      await syncOperationalTables(
        organization.id,
        store,
        options?.ordersToMirror ?? [],
      );

      dbWriteSuccess = true;
    } catch (dbErr) {
      console.error("[Database Store Write Error] Database write failed:", dbErr);
      throw dbErr;
    }
  }

  if (!dbWriteSuccess) {
    const persistedStore = compactStoreForPersistence(store);
    if (useDatabaseStore && organization.id !== defaultOrganizationId) {
      throw new Error("No se pudo guardar en la base de datos.");
    }

    const runtimeStorePath = runtimeStorePathFor(organization.id);
    await fs.mkdir(path.dirname(runtimeStorePath), { recursive: true });
    await fs.writeFile(runtimeStorePath, `${JSON.stringify(persistedStore, null, 2)}\n`, "utf8");
  }

  // Automatic Stock Sync Queueing comparison
  if (previousStore) {
    try {
      const { getMasterProductSellableStock, queueStockSync } = await import(
        "./stock-sync"
      );
      for (const prod of store.products) {
        const oldStock = getMasterProductSellableStock(previousStore, prod.masterSku);
        const newStock = getMasterProductSellableStock(store, prod.masterSku);

        if (oldStock !== newStock) {
          await queueStockSync(store, prod.masterSku);
        }
      }
    } catch (err) {
      console.error("[Stock Sync Auto-Queue Error] Failed to compare and queue stock changes:", err);
    }
  }
}

export async function readOrganizationStore(organizationId: string): Promise<LocalStore | null> {
  if (useDatabaseStore) {
    try {
      const dataStore = await prisma.localDataStore.findUnique({
        where: { organizationId },
        include: {
          organization: {
            select: { name: true },
          },
        },
      });

      if (!dataStore) {
        return null;
      }

      const store = normalizeStoreForOrganization(dataStore.payload as LocalStore, {
        id: organizationId,
        name: dataStore.organization.name,
      });

      // Dynamic relational fetch for OperatingExpense and FullInventoryLayer
      try {
        Object.assign(store, await readRelationalStoreSlices(organizationId));
      } catch (err) {
        console.error(`[readOrganizationStore Error] Failed to fetch relational tables for ${organizationId}:`, err);
        throw err;
      }

      return store;
    } catch (dbErr) {
      console.error(`[readOrganizationStore Error] Database query failed for ${organizationId}:`, dbErr);
      throw dbErr;
    }
  }

  const runtimeStorePath = runtimeStorePathFor(organizationId);

  try {
    const contents = await fs.readFile(runtimeStorePath, "utf8");
    const store = JSON.parse(contents) as LocalStore;
    store.marketplaceAccounts ??= [];
    store.marketplaceOrders ??= [];
    store.integrationEvents ??= [];
    return store;
  } catch {
    return null;
  }
}

export async function writeOrganizationStore(organizationId: string, store: LocalStore) {
  const persistedStore = compactStoreForPersistence(store);

  let dbWriteSuccess = false;

  if (useDatabaseStore) {
    try {
      await prisma.localDataStore.upsert({
        where: { organizationId },
        create: {
          organizationId,
          payload: toJsonPayload(persistedStore),
        },
        update: {
          payload: toJsonPayload(persistedStore),
        },
      });
      await syncOperationalTables(organizationId, store);
      dbWriteSuccess = true;
    } catch (dbErr) {
      console.error(`[writeOrganizationStore Error] Database upsert failed for ${organizationId}:`, dbErr);
      throw dbErr;
    }
  }

  if (!dbWriteSuccess) {
    if (useDatabaseStore) {
      throw new Error("No se pudo guardar en la base de datos.");
    }

    const runtimeStorePath = runtimeStorePathFor(organizationId);
    await fs.mkdir(path.dirname(runtimeStorePath), { recursive: true });
    await fs.writeFile(runtimeStorePath, `${JSON.stringify(persistedStore, null, 2)}\n`, "utf8");
  }
}

async function readRelationalStoreSlices(
  organizationId: string,
): Promise<RelationalStoreSlices> {
  const [dbExpenses, dbLayers] = await Promise.all([
    prisma.operatingExpense.findMany({
      where: { organizationId },
    }),
    prisma.fullInventoryLayer.findMany({
      where: { organizationId },
    }),
  ]);

  return {
    operatingExpenses: dbExpenses.map((exp) => ({
      id: exp.id,
      month: exp.month,
      category: exp.category,
      description: exp.description,
      amount: Number(exp.amount),
      paidAt: exp.paidAt?.toISOString(),
      isRecurring: exp.isRecurring,
      frequency: normalizeExpenseFrequency(exp.frequency),
      periodStart: exp.periodStart?.toISOString(),
      activeUntil: exp.activeUntil?.toISOString(),
    })),
    fullInventoryLayers: dbLayers.map((ly) => ({
      id: ly.id,
      dateReceived: ly.dateReceived.toISOString(),
      masterSku: ly.masterSku,
      initialQuantity: Number(ly.initialQuantity),
      remainingQuantity: Number(ly.remainingQuantity),
      unitVolumeM3: Number(ly.unitVolumeM3),
      inboundFreightCostTotal: Number(ly.inboundFreightCostTotal),
      inboundFreightCostPerUnit: Number(ly.inboundFreightCostPerUnit),
      storageCostPerUnitPerDay: Number(ly.storageCostPerUnitPerDay),
      note: ly.note ?? undefined,
    })),
  };
}

async function persistRelationalSlices(
  organizationId: string,
  expenses: LocalStore["operatingExpenses"],
  layers: LocalStore["fullInventoryLayers"],
) {
  await Promise.all([
    prisma.$transaction(async (tx) => {
      const expenseIds = expenses.map((expense) => expense.id);
      await tx.operatingExpense.deleteMany({
        where: {
          organizationId,
          id: { notIn: expenseIds },
        },
      });

      for (const expense of expenses) {
        await tx.operatingExpense.upsert({
          where: { id: expense.id },
          create: {
            id: expense.id,
            organizationId,
            month: expense.month,
            category: expense.category,
            description: expense.description,
            amount: expense.amount,
            paidAt: expense.paidAt ? new Date(expense.paidAt) : null,
            isRecurring: expense.isRecurring ?? false,
            frequency: expense.frequency ?? "monthly",
            periodStart: expense.periodStart ? new Date(expense.periodStart) : null,
            activeUntil: expense.activeUntil ? new Date(expense.activeUntil) : null,
          },
          update: {
            month: expense.month,
            category: expense.category,
            description: expense.description,
            amount: expense.amount,
            paidAt: expense.paidAt ? new Date(expense.paidAt) : null,
            isRecurring: expense.isRecurring ?? false,
            frequency: expense.frequency ?? "monthly",
            periodStart: expense.periodStart ? new Date(expense.periodStart) : null,
            activeUntil: expense.activeUntil ? new Date(expense.activeUntil) : null,
          },
        });
      }
    }),

    prisma.$transaction(async (tx) => {
      const layerIds = layers.map((layer) => layer.id);
      await tx.fullInventoryLayer.deleteMany({
        where: {
          organizationId,
          id: { notIn: layerIds },
        },
      });

      for (const layer of layers) {
        await tx.fullInventoryLayer.upsert({
          where: { id: layer.id },
          create: {
            id: layer.id,
            organizationId,
            dateReceived: new Date(layer.dateReceived),
            masterSku: layer.masterSku,
            initialQuantity: layer.initialQuantity,
            remainingQuantity: layer.remainingQuantity,
            unitVolumeM3: layer.unitVolumeM3,
            inboundFreightCostTotal: layer.inboundFreightCostTotal,
            inboundFreightCostPerUnit: layer.inboundFreightCostPerUnit,
            storageCostPerUnitPerDay: layer.storageCostPerUnitPerDay,
            note: layer.note || null,
          },
          update: {
            dateReceived: new Date(layer.dateReceived),
            masterSku: layer.masterSku,
            initialQuantity: layer.initialQuantity,
            remainingQuantity: layer.remainingQuantity,
            unitVolumeM3: layer.unitVolumeM3,
            inboundFreightCostTotal: layer.inboundFreightCostTotal,
            inboundFreightCostPerUnit: layer.inboundFreightCostPerUnit,
            storageCostPerUnitPerDay: layer.storageCostPerUnitPerDay,
            note: layer.note || null,
          },
        });
      }
    }),
  ]);
}

async function syncOperationalTables(
  organizationId: string,
  store: LocalStore,
  ordersToMirror: LocalMarketplaceOrder[] = [],
) {
  await prisma.$transaction(
    async (tx) => {
      await tx.inventoryBalance.deleteMany({ where: { organizationId } });

      const warehouseRows = store.warehouses.map((warehouse) => ({
        localId: warehouse.id,
        id: toRelationalId(organizationId, "warehouse", warehouse.id),
        organizationId,
        name: warehouse.name,
        type: mapWarehouseType(warehouse.type),
        channel: mapOptionalChannel(warehouse.channel),
        isSellable: warehouse.isSellable,
        isExclusive: warehouse.isExclusive,
        isActive: true,
      }));
      const warehouseDbIdByLocalId = new Map<string, string>();
      for (const warehouse of warehouseRows) {
        const saved = await tx.warehouse.upsert({
          where: {
            organizationId_name: {
              organizationId,
              name: warehouse.name,
            },
          },
          create: {
            id: warehouse.id,
            organizationId: warehouse.organizationId,
            name: warehouse.name,
            type: warehouse.type,
            channel: warehouse.channel,
            isSellable: warehouse.isSellable,
            isExclusive: warehouse.isExclusive,
            isActive: warehouse.isActive,
          },
          update: {
            type: warehouse.type,
            channel: warehouse.channel,
            isSellable: warehouse.isSellable,
            isExclusive: warehouse.isExclusive,
            isActive: warehouse.isActive,
          },
        });
        warehouseDbIdByLocalId.set(warehouse.localId, saved.id);
      }

      const productRowsBySku = new Map<
        string,
        {
          localId: string;
          id: string;
          organizationId: string;
          masterSku: string;
          name: string;
          targetInventoryDays: number;
          averageUnitCost: number;
          isActive: boolean;
        }
      >();
      for (const product of store.products) {
        const skuKey = normalizeSkuKey(product.masterSku);
        if (!skuKey) {
          continue;
        }

        const row = {
          localId: product.id,
          id: toRelationalId(organizationId, "product", product.id),
          organizationId,
          masterSku: product.masterSku,
          name: product.name,
          targetInventoryDays: product.targetInventoryDays,
          averageUnitCost: product.averageUnitCost ?? 0,
          isActive: product.isActive ?? true,
        };
        const previous = productRowsBySku.get(skuKey);
        if (!previous || previous.isActive === row.isActive || row.isActive) {
          productRowsBySku.set(skuKey, row);
        }
      }
      const productRows = [...productRowsBySku.values()];
      const productDbIdBySku = new Map<string, string>();
      const existingDbProducts = await tx.masterProduct.findMany({
        where: { organizationId },
        select: { id: true, masterSku: true },
      });
      const existingProductById = new Map(
        existingDbProducts.map((product) => [product.id, product]),
      );
      const existingProductBySku = new Map(
        existingDbProducts.map((product) => [
          normalizeSkuKey(product.masterSku),
          product,
        ]),
      );
      for (const product of productRows) {
        const existingById =
          existingProductById.get(product.id) ??
          existingProductById.get(product.localId);
        const existingBySku = existingProductBySku.get(
          normalizeSkuKey(product.masterSku),
        );
        const productData = {
          masterSku: product.masterSku,
          name: product.name,
          targetInventoryDays: product.targetInventoryDays,
          isActive: product.isActive,
        };
        const saved =
          existingById && (!existingBySku || existingBySku.id === existingById.id)
            ? await tx.masterProduct.update({
                where: { id: existingById.id },
                data: productData,
              })
            : existingBySku
              ? await tx.masterProduct.update({
                  where: { id: existingBySku.id },
                  data: productData,
                })
              : await tx.masterProduct.create({
                  data: {
                    id: product.id,
                    organizationId: product.organizationId,
                    ...productData,
                  },
                });
        const savedReference = { id: saved.id, masterSku: saved.masterSku };
        const productKey = normalizeSkuKey(product.masterSku);
        const savedKey = normalizeSkuKey(saved.masterSku);
        existingProductById.set(product.id, savedReference);
        existingProductById.set(product.localId, savedReference);
        existingProductById.set(saved.id, savedReference);
        existingProductBySku.set(productKey, savedReference);
        existingProductBySku.set(savedKey, savedReference);
        productDbIdBySku.set(productKey, saved.id);
      }
      const activeProductIds = [...productDbIdBySku.values()];
      await tx.masterProduct.updateMany({
        where: {
          organizationId,
          ...(activeProductIds.length > 0 ? { id: { notIn: activeProductIds } } : {}),
        },
        data: { isActive: false },
      });
      if (activeProductIds.length > 0) {
        const latestSnapshots = await tx.productCostSnapshot.findMany({
          where: {
            organizationId,
            masterProductId: { in: activeProductIds },
          },
          orderBy: { calculatedAt: "desc" },
          select: {
            masterProductId: true,
            averageCost: true,
          },
        });
        const latestCostByProductId = new Map<string, number>();
        for (const snapshot of latestSnapshots) {
          if (!latestCostByProductId.has(snapshot.masterProductId)) {
            latestCostByProductId.set(
              snapshot.masterProductId,
              Number(snapshot.averageCost),
            );
          }
        }

        const costRows = productRows
          .map((product) => {
            const masterProductId = productDbIdBySku.get(normalizeSkuKey(product.masterSku));
            const averageCost = Number(product.averageUnitCost ?? 0);
            if (!masterProductId || !Number.isFinite(averageCost) || averageCost < 0) {
              return null;
            }
            const latestCost = latestCostByProductId.get(masterProductId);
            if (latestCost !== undefined && Math.abs(latestCost - averageCost) < 0.0001) {
              return null;
            }
            return {
              organizationId,
              masterProductId,
              averageCost,
            };
          })
          .filter((row): row is NonNullable<typeof row> => row !== null);
        if (costRows.length > 0) {
          await tx.productCostSnapshot.createMany({ data: costRows });
        }
      }

      const accountRows = store.marketplaceAccounts.map((account) => ({
        localId: account.id,
        id: toRelationalId(organizationId, "account", account.id),
        organizationId,
        channel: mapChannel(account.channel),
        alias: account.alias,
        externalAccountId: account.externalAccountId,
        authStatus: account.status === "connected" ? "connected" : "disconnected",
        tokenEncrypted: encryptSecret(account.accessToken),
        refreshTokenEncrypted: encryptSecret(account.refreshToken),
        lastSyncAt: account.lastSyncAt ? new Date(account.lastSyncAt) : null,
        settings: toJsonValue({
          nickname: account.nickname,
          siteId: account.siteId,
          tokenExpiresAt: account.tokenExpiresAt,
          salesBackfill: account.salesBackfill,
          salesAutomation: account.salesAutomation,
        }),
        isActive: account.status !== "disabled",
      }));
      const accountDbIdByLocalId = new Map<string, string>();
      for (const account of accountRows) {
        const saved = await tx.marketplaceAccount.upsert({
          where: {
            organizationId_channel_alias: {
              organizationId,
              channel: account.channel,
              alias: account.alias,
            },
          },
          create: {
            id: account.id,
            organizationId: account.organizationId,
            channel: account.channel,
            alias: account.alias,
            externalAccountId: account.externalAccountId,
            authStatus: account.authStatus,
            tokenEncrypted: account.tokenEncrypted,
            refreshTokenEncrypted: account.refreshTokenEncrypted,
            lastSyncAt: account.lastSyncAt,
            settings: account.settings,
            isActive: account.isActive,
          },
          update: {
            externalAccountId: account.externalAccountId,
            authStatus: account.authStatus,
            tokenEncrypted: account.tokenEncrypted,
            refreshTokenEncrypted: account.refreshTokenEncrypted,
            lastSyncAt: account.lastSyncAt,
            settings: account.settings,
            isActive: account.isActive,
          },
        });
        accountDbIdByLocalId.set(account.localId, saved.id);
      }

      const onlineSkuRows = store.onlineSkus.map((sku) => ({
        localId: sku.id,
        id: toRelationalId(organizationId, "online_sku", sku.id),
        organizationId,
        onlineSku: sku.onlineSku,
        title: sku.title,
        channel: mapChannel(sku.channel),
        marketplaceAccountId: accountDbIdByLocalId.get(sku.marketplaceAccount) ?? null,
        externalListingId: sku.externalListingId ?? null,
        safetyBufferUnits: sku.safetyBufferUnits,
        isActive: true,
      }));
      const onlineSkuDbIdByLocalId = new Map<string, string>();
      for (const onlineSku of onlineSkuRows) {
        const saved = await tx.onlineSku.upsert({
          where: {
            organizationId_channel_onlineSku: {
              organizationId,
              channel: onlineSku.channel,
              onlineSku: onlineSku.onlineSku,
            },
          },
          create: {
            id: onlineSku.id,
            organizationId: onlineSku.organizationId,
            onlineSku: onlineSku.onlineSku,
            title: onlineSku.title,
            channel: onlineSku.channel,
            marketplaceAccountId: onlineSku.marketplaceAccountId,
            externalListingId: onlineSku.externalListingId,
            safetyBufferUnits: onlineSku.safetyBufferUnits,
            isActive: onlineSku.isActive,
          },
          update: {
            title: onlineSku.title,
            marketplaceAccountId: onlineSku.marketplaceAccountId,
            externalListingId: onlineSku.externalListingId,
            safetyBufferUnits: onlineSku.safetyBufferUnits,
            isActive: onlineSku.isActive,
          },
        });
        onlineSkuDbIdByLocalId.set(onlineSku.localId, saved.id);
      }

      const activeOnlineSkuIds = [...onlineSkuDbIdByLocalId.values()];
      await tx.onlineSku.updateMany({
        where: {
          organizationId,
          ...(activeOnlineSkuIds.length > 0
            ? { id: { notIn: activeOnlineSkuIds } }
            : {}),
        },
        data: { isActive: false },
      });

      if (store.onlineSkus.length > 0) {
        await tx.skuComponent.deleteMany({
          where: {
            organizationId,
            onlineSkuId: { in: [...onlineSkuDbIdByLocalId.values()] },
          },
        });
      }
      const componentRows = store.onlineSkus.flatMap((sku) =>
        sku.components
          .map((component) => {
            const masterProductId = productDbIdBySku.get(
              normalizeSkuKey(component.masterSku),
            );
            const onlineSkuId = onlineSkuDbIdByLocalId.get(sku.id);
            if (!masterProductId || !onlineSkuId) {
              return null;
            }
            return {
              organizationId,
              onlineSkuId,
              masterProductId,
              quantityRequired: component.quantityRequired,
            };
          })
          .filter((row): row is NonNullable<typeof row> => row !== null),
      );
      if (componentRows.length > 0) {
        await tx.skuComponent.createMany({ data: componentRows, skipDuplicates: true });
      }

      const inventoryRows = store.inventoryBalances
        .map((balance) => {
          const masterProductId = productDbIdBySku.get(normalizeSkuKey(balance.masterSku));
          const warehouseId = warehouseDbIdByLocalId.get(balance.warehouseId);
          if (!masterProductId || !warehouseId) {
            return null;
          }
          return {
            organizationId,
            masterProductId,
            warehouseId,
            physicalQuantity: balance.physicalQuantity,
            reservedQuantity: balance.reservedQuantity,
            blockedQuantity: balance.blockedQuantity,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);
      if (inventoryRows.length > 0) {
        await tx.inventoryBalance.createMany({ data: inventoryRows, skipDuplicates: true });
      }

      const movementRows = store.inventoryMovements
        .map((movement) => {
          const masterProductId = productDbIdBySku.get(normalizeSkuKey(movement.masterSku));
          const warehouseId = warehouseDbIdByLocalId.get(movement.warehouseId);
          if (!masterProductId || !warehouseId) {
            return null;
          }
          return {
            id: toRelationalId(organizationId, "movement", movement.id),
            organizationId,
            masterProductId,
            warehouseId,
            movementType: mapInventoryMovementType(movement.type, movement.quantity),
            quantity: movement.quantity,
            referenceType: movement.type,
            referenceId: movement.reference,
            reason: movement.note ?? null,
            notes: movement.note ?? null,
            createdAt: new Date(movement.date),
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);
      if (movementRows.length > 0) {
        await tx.inventoryMovement.createMany({ data: movementRows, skipDuplicates: true });
      }

      const onlineSkuIdByKey = new Map(
        store.onlineSkus.map((sku) => [
          `${mapChannel(sku.channel)}:${normalizeSkuKey(sku.onlineSku)}`,
          onlineSkuDbIdByLocalId.get(sku.id) ?? sku.id,
        ]),
      );

      for (const order of ordersToMirror) {
        const channel = mapChannel(order.channel);
        const accountId = accountDbIdByLocalId.get(order.marketplaceAccountId) ?? null;
        const saleOrderData = {
          id: toRelationalId(organizationId, "sale_order", order.id),
          organizationId,
          marketplaceAccountId: accountId,
          channel,
          externalOrderId: order.externalOrderId,
          orderedAt: new Date(order.orderedAt),
          status: order.status,
          buyerReference: null,
          grossAmount: order.grossAmount,
          netReceivedAmount: order.netReceivedAmount,
          currency: order.currency,
          payload: toPrismaJson(compactMarketplaceOrderForPersistence(order)),
        };
        const saleOrder = await tx.saleOrder.upsert({
          where: {
            organizationId_channel_externalOrderId: {
              organizationId,
              channel,
              externalOrderId: order.externalOrderId,
            },
          },
          create: saleOrderData,
          update: {
            marketplaceAccountId: saleOrderData.marketplaceAccountId,
            channel: saleOrderData.channel,
            externalOrderId: saleOrderData.externalOrderId,
            orderedAt: saleOrderData.orderedAt,
            status: saleOrderData.status,
            grossAmount: saleOrderData.grossAmount,
            netReceivedAmount: saleOrderData.netReceivedAmount,
            currency: saleOrderData.currency,
            payload: saleOrderData.payload,
          },
        });

        await tx.saleCharge.deleteMany({
          where: { organizationId, saleOrderId: saleOrder.id },
        });
        await tx.saleItemComponent.deleteMany({
          where: {
            organizationId,
            saleOrderItem: { saleOrderId: saleOrder.id },
          },
        });
        await tx.saleOrderItem.deleteMany({
          where: { organizationId, saleOrderId: saleOrder.id },
        });

        for (const item of order.items) {
          const onlineSkuId =
            onlineSkuIdByKey.get(`${channel}:${normalizeSkuKey(item.externalSku)}`) ??
            null;
          const saleItem = await tx.saleOrderItem.create({
            data: {
              organizationId,
              saleOrderId: saleOrder.id,
              onlineSkuId,
              externalSku: item.externalSku || item.masterSku || order.externalOrderId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              grossAmount: item.quantity * item.unitPrice,
            },
          });

          for (const component of getOrderItemInventoryComponents(item)) {
            const masterProductId = productDbIdBySku.get(normalizeSkuKey(component.masterSku));
            const product = store.products.find(
              (entry) => normalizeSkuKey(entry.masterSku) === normalizeSkuKey(component.masterSku),
            );
            if (masterProductId) {
              const unitCost = product?.averageUnitCost ?? 0;
              await tx.saleItemComponent.create({
                data: {
                  organizationId,
                  saleOrderItemId: saleItem.id,
                  masterProductId,
                  quantityConsumed: component.quantity,
                  unitCostAtSale: unitCost,
                  totalCost: component.quantity * unitCost,
                },
              });
            }
          }
        }

        if (order.charges.length > 0) {
          await tx.saleCharge.createMany({
            data: order.charges.map((charge) => ({
              organizationId,
              saleOrderId: saleOrder.id,
              chargeType: mapSaleChargeType(charge.type),
              amount: charge.amount,
              source: charge.source,
              notes: charge.type,
            })),
          });
        }
      }
    },
    {
      maxWait: 20_000,
      timeout: 120_000,
    },
  );
}

async function syncMarketplaceOrderTables(
  organizationId: string,
  store: LocalStore,
  ordersToMirror: LocalMarketplaceOrder[],
) {
  if (!useDatabaseStore || ordersToMirror.length === 0) {
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      const [products, onlineSkus, marketplaceAccounts] = await Promise.all([
        tx.masterProduct.findMany({
          where: { organizationId },
          select: { id: true, masterSku: true },
        }),
        tx.onlineSku.findMany({
          where: { organizationId, isActive: true },
          select: { id: true, channel: true, onlineSku: true },
        }),
        tx.marketplaceAccount.findMany({
          where: { organizationId },
          select: { id: true },
        }),
      ]);
      const productIdBySku = new Map(
        products.map((product) => [normalizeSkuKey(product.masterSku), product.id]),
      );
      const onlineSkuIdByKey = new Map(
        onlineSkus.map((sku) => [
          `${sku.channel}:${normalizeSkuKey(sku.onlineSku)}`,
          sku.id,
        ]),
      );
      const accountDbIdByLocalId = new Map(
        marketplaceAccounts.map((account) => [
          fromRelationalId(organizationId, account.id),
          account.id,
        ]),
      );

      for (const order of ordersToMirror) {
        const channel = mapChannel(order.channel);
        const accountId = accountDbIdByLocalId.get(order.marketplaceAccountId) ?? null;
        const saleOrderData = {
          id: toRelationalId(organizationId, "sale_order", order.id),
          organizationId,
          marketplaceAccountId: accountId,
          channel,
          externalOrderId: order.externalOrderId,
          orderedAt: new Date(order.orderedAt),
          status: order.status,
          buyerReference: null,
          grossAmount: order.grossAmount,
          netReceivedAmount: order.netReceivedAmount,
          currency: order.currency,
          payload: toPrismaJson(compactMarketplaceOrderForPersistence(order)),
        };
        const saleOrder = await tx.saleOrder.upsert({
          where: {
            organizationId_channel_externalOrderId: {
              organizationId,
              channel,
              externalOrderId: order.externalOrderId,
            },
          },
          create: saleOrderData,
          update: {
            marketplaceAccountId: saleOrderData.marketplaceAccountId,
            channel: saleOrderData.channel,
            externalOrderId: saleOrderData.externalOrderId,
            orderedAt: saleOrderData.orderedAt,
            status: saleOrderData.status,
            grossAmount: saleOrderData.grossAmount,
            netReceivedAmount: saleOrderData.netReceivedAmount,
            currency: saleOrderData.currency,
            payload: saleOrderData.payload,
          },
        });

        await tx.saleCharge.deleteMany({
          where: { organizationId, saleOrderId: saleOrder.id },
        });
        await tx.saleItemComponent.deleteMany({
          where: {
            organizationId,
            saleOrderItem: { saleOrderId: saleOrder.id },
          },
        });
        await tx.saleOrderItem.deleteMany({
          where: { organizationId, saleOrderId: saleOrder.id },
        });

        for (const item of order.items) {
          const onlineSkuId =
            onlineSkuIdByKey.get(`${channel}:${normalizeSkuKey(item.externalSku)}`) ??
            null;
          const saleItem = await tx.saleOrderItem.create({
            data: {
              organizationId,
              saleOrderId: saleOrder.id,
              onlineSkuId,
              externalSku: item.externalSku || item.masterSku || order.externalOrderId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              grossAmount: item.quantity * item.unitPrice,
            },
          });

          for (const component of getOrderItemInventoryComponents(item)) {
            const masterProductId = productIdBySku.get(normalizeSkuKey(component.masterSku));
            const product = store.products.find(
              (entry) => normalizeSkuKey(entry.masterSku) === normalizeSkuKey(component.masterSku),
            );
            if (masterProductId) {
              const unitCost = product?.averageUnitCost ?? 0;
              await tx.saleItemComponent.create({
                data: {
                  organizationId,
                  saleOrderItemId: saleItem.id,
                  masterProductId,
                  quantityConsumed: component.quantity,
                  unitCostAtSale: unitCost,
                  totalCost: component.quantity * unitCost,
                },
              });
            }
          }
        }

        if (order.charges.length > 0) {
          await tx.saleCharge.createMany({
            data: order.charges.map((charge) => ({
              organizationId,
              saleOrderId: saleOrder.id,
              chargeType: mapSaleChargeType(charge.type),
              amount: charge.amount,
              source: charge.source,
              notes: charge.type,
            })),
          });
        }
      }
    },
    {
      maxWait: 20_000,
      timeout: 120_000,
    },
  );
}

export async function mirrorOrganizationStoreToTables(organizationId: string) {
  const store = await readOrganizationStore(organizationId);
  if (!store) {
    throw new Error(`Organization store not found: ${organizationId}`);
  }

  const orders = store.marketplaceOrders ?? [];
  const batchSize = 25;

  await syncOperationalTables(organizationId, store);
  for (let index = 0; index < orders.length; index += batchSize) {
    await syncMarketplaceOrderTables(
      organizationId,
      store,
      orders.slice(index, index + batchSize),
    );
  }

  return {
    organizationId,
    products: store.products.length,
    onlineSkus: store.onlineSkus.length,
    accounts: store.marketplaceAccounts.length,
    orders: store.marketplaceOrders.length,
    inventoryBalances: store.inventoryBalances.length,
    inventoryMovements: store.inventoryMovements.length,
  };
}

function mapChannel(channel: string | null | undefined): Channel {
  if (channel === "mercado_libre" || channel === "amazon" || channel === "tiktok") {
    return channel as Channel;
  }
  return Channel.manual;
}

function mapOptionalChannel(channel: string | null | undefined): Channel | null {
  if (!channel) {
    return null;
  }
  return mapChannel(channel);
}

function mapWarehouseType(type: string): WarehouseType {
  switch (type) {
    case "mercado_libre_full":
    case "amazon_fba":
    case "tiktok_fulfillment":
    case "third_party":
    case "returns":
    case "damaged":
    case "transit":
      return type as WarehouseType;
    default:
      return WarehouseType.own;
  }
}

function mapInventoryMovementType(
  type: LocalInventoryMovement["type"],
  quantity: number,
): InventoryMovementType {
  switch (type) {
    case "sale":
    case "adjustment":
      return type as InventoryMovementType;
    case "return":
      return InventoryMovementType.return;
    case "transfer":
      return quantity >= 0
        ? InventoryMovementType.transfer_in
        : InventoryMovementType.transfer_out;
    case "sync":
    case "import":
    default:
      return InventoryMovementType.adjustment;
  }
}

function mapSaleChargeType(type: string): SaleChargeType {
  const normalized = type.toLowerCase();
  if (normalized.includes("commission") || normalized.includes("comision")) {
    return SaleChargeType.marketplace_commission;
  }
  if (normalized.includes("shipping") || normalized.includes("envio")) {
    return SaleChargeType.shipping;
  }
  if (normalized.includes("full") || normalized.includes("fulfillment")) {
    return SaleChargeType.fulfillment;
  }
  if (normalized.includes("ads") || normalized.includes("advertising") || normalized.includes("publicidad")) {
    return SaleChargeType.advertising;
  }
  if (normalized.includes("promo")) {
    return SaleChargeType.promotion;
  }
  if (normalized.includes("storage") || normalized.includes("almacen")) {
    return SaleChargeType.storage;
  }
  if (normalized.includes("return") || normalized.includes("devolucion")) {
    return SaleChargeType.return_cost;
  }
  return SaleChargeType.other;
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function compactStoreForPersistence(store: LocalStore): LocalStore {
  const compacted = JSON.parse(JSON.stringify(store)) as LocalStore;
  compacted.integrationEvents = (compacted.integrationEvents ?? []).slice(-100);
  compacted.marketplaceAccounts = (compacted.marketplaceAccounts ?? []).map((account) => ({
    ...account,
    accessToken: encryptSecret(account.accessToken),
    refreshToken: encryptSecret(account.refreshToken),
  }));
  compacted.marketplaceOrders = (compacted.marketplaceOrders ?? []).map((order) => ({
    ...compactMarketplaceOrderForPersistence(order),
  }));
  return compacted;
}

function compactMarketplaceOrderForPersistence(
  order: LocalMarketplaceOrder,
): LocalMarketplaceOrder {
  return {
    ...order,
    raw: order.raw ? pruneMeliOrder(order.raw) : order.raw,
  };
}

function toJsonPayload(store: LocalStore): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(store)) as Prisma.InputJsonValue;
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function listOrganizationStores() {
  if (useDatabaseStore) {
    try {
      const rows = await prisma.localDataStore.findMany({
        include: {
          organization: {
            select: { name: true },
          },
        },
      });

      return rows.map((row) => ({
        organizationId: row.organizationId,
        store: normalizeStoreForOrganization(row.payload as LocalStore, {
          id: row.organizationId,
          name: row.organization.name,
        }),
      }));
    } catch (dbErr) {
      console.error("[listOrganizationStores Error] Database query failed, listing from local file system:", dbErr);
    }
  }

  const organizationIds = await getRegisteredOrganizationIds();
  const stores = await Promise.all(
    organizationIds.map(async (organizationId) => ({
      organizationId,
      store: await readOrganizationStore(organizationId),
    })),
  );

  return stores.filter(
    (entry): entry is { organizationId: string; store: LocalStore } =>
      entry.store !== null,
  );
}

function normalizeStoreForOrganization(
  store: LocalStore,
  organization: { id: string; name: string },
) {
  store.organization = {
    id: organization.id,
    name: organization.name,
  };
  store.inventoryBaselineAt ??= new Date(0).toISOString();
  store.warehouses ??= createEmptyStore().warehouses;
  store.products ??= [];
  store.products = store.products.map((product) => ({
    ...product,
    isActive: product.isActive ?? true,
  }));
  store.onlineSkus ??= [];
  store.marketplaceAccounts ??= [];
  store.marketplaceAccounts = store.marketplaceAccounts.map((account) => ({
    ...account,
    accessToken: decryptSecret(account.accessToken),
    refreshToken: decryptSecret(account.refreshToken),
  }));
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

  applyPendingCostImportsToStore(store);

  return store;
}

export async function replaceFullInventory(input: {
  accountId: string;
  balances: Array<{
    masterSku: string;
    physicalQuantity: number;
  }>;
  totalFulfillmentUnits: number;
  mappedUnits: number;
  items?: LocalFullStockSnapshotItem[];
  listingImages?: LocalMarketplaceListingImage[];
  unmappedItems: NonNullable<LocalStore["fullStockSync"]>["unmappedItems"];
}) {
  const store = await readLocalStore();
  applyMarketplaceListingImages(store, input.accountId, input.listingImages ?? []);
  store.inventoryBalances = store.inventoryBalances.filter(
    (balance) => balance.warehouseId !== "wh_full",
  );

  for (const balance of input.balances) {
    store.inventoryBalances.push({
      masterSku: balance.masterSku,
      warehouseId: "wh_full",
      physicalQuantity: balance.physicalQuantity,
      reservedQuantity: 0,
      blockedQuantity: 0,
    });
  }

  store.fullStockSync = {
    syncedAt: new Date().toISOString(),
    accountId: input.accountId,
    totalFulfillmentUnits: input.totalFulfillmentUnits,
    mappedUnits: input.mappedUnits,
    items: input.items ?? [],
    auditedAt: store.fullStockSync?.auditedAt,
    auditItems: store.fullStockSync?.auditItems,
    unmappedItems: input.unmappedItems,
  };

  await writeLocalStore(store);
  return store.fullStockSync;
}

export async function saveFullStockAudit(input: {
  accountId: string;
  totalFulfillmentUnits: number;
  mappedUnits: number;
  items: LocalFullStockSnapshotItem[];
  listingImages?: LocalMarketplaceListingImage[];
  unmappedItems: NonNullable<LocalStore["fullStockSync"]>["unmappedItems"];
}) {
  const store = await readLocalStore();
  const previous = store.fullStockSync;
  applyMarketplaceListingImages(store, input.accountId, input.listingImages ?? []);

  store.fullStockSync = {
    syncedAt: previous?.syncedAt ?? new Date(0).toISOString(),
    accountId: input.accountId,
    totalFulfillmentUnits: previous?.totalFulfillmentUnits ?? input.totalFulfillmentUnits,
    mappedUnits: previous?.mappedUnits ?? input.mappedUnits,
    items: previous?.items ?? [],
    auditedAt: new Date().toISOString(),
    auditItems: input.items,
    unmappedItems: previous?.unmappedItems ?? input.unmappedItems,
  };

  await writeLocalStore(store);
  return store.fullStockSync;
}

function applyMarketplaceListingImages(
  store: LocalStore,
  accountId: string,
  listings: LocalMarketplaceListingImage[],
) {
  if (listings.length === 0 || store.onlineSkus.length === 0) {
    return;
  }

  const bySku = new Map<string, LocalMarketplaceListingImage>();
  const byListing = new Map<string, LocalMarketplaceListingImage>();

  for (const listing of listings) {
    const skuKey = normalizeSkuKey(listing.onlineSku);
    if (skuKey) {
      bySku.set(skuKey, listing);
    }

    if (listing.listingId) {
      byListing.set(listing.listingId, listing);
      if (listing.variationId) {
        byListing.set(`${listing.listingId}_${listing.variationId}`, listing);
      }
    }
  }

  store.onlineSkus = store.onlineSkus.map((sku) => {
    const listingKey = sku.externalListingId?.trim();
    const listing =
      bySku.get(normalizeSkuKey(sku.onlineSku)) ??
      (listingKey ? byListing.get(listingKey) : undefined);

    if (!listing) {
      return sku;
    }

    const isSameAccount = Boolean(
      sku.marketplaceAccount === accountId ||
      sku.marketplaceAccount === "manual_mapping" ||
      !sku.marketplaceAccount ||
      (listingKey && byListing.has(listingKey)),
    );

    if (sku.channel !== "mercado_libre" || !isSameAccount) {
      return sku;
    }

    const imageUrl = normalizeStoredImageUrl(listing.imageUrl);
    const title = listing.title.trim();
    const shouldImproveTitle =
      title && (!sku.title || normalizeSkuKey(sku.title) === normalizeSkuKey(sku.onlineSku));

    return {
      ...sku,
      title: shouldImproveTitle ? title : sku.title,
      marketplaceAccount:
        sku.marketplaceAccount === "manual_mapping" || !sku.marketplaceAccount
          ? accountId
          : sku.marketplaceAccount,
      externalListingId: sku.externalListingId ?? listing.listingId ?? null,
      imageUrl: imageUrl ?? sku.imageUrl ?? null,
    };
  });
}

function normalizeStoredImageUrl(value: unknown) {
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

export async function saveFullBillingCharges(input: {
  accountId: string;
  period: string;
  charges: LocalFullBillingCharge[];
}) {
  const store = await readLocalStore();
  store.fullBillingCharges = (store.fullBillingCharges ?? []).filter(
    (charge) =>
      charge.accountId !== input.accountId || charge.period !== input.period,
  );
  store.fullBillingCharges.push(...input.charges);
  await writeLocalStore(store);

  return {
    accountId: input.accountId,
    period: input.period,
    charges: input.charges,
    totalAmount: input.charges.reduce((sum, charge) => sum + charge.amount, 0),
    totalUnits: input.charges.reduce((sum, charge) => sum + charge.units, 0),
  };
}

export async function resetLocalStore(newStore: LocalStore = createEmptyStore()) {
  let oldStore: LocalStore | null = null;
  try {
    oldStore = await readLocalStore();
  } catch {
    // Ignore if store is uninitialized
  }

  if (oldStore) {
    // Safely preserve accounts, orders, expenses, and mappings
    newStore.marketplaceAccounts = oldStore.marketplaceAccounts ?? [];
    newStore.marketplaceOrders = oldStore.marketplaceOrders ?? [];
    newStore.integrationEvents = oldStore.integrationEvents ?? [];
    newStore.operatingExpenses = oldStore.operatingExpenses ?? [];
    newStore.fullInventoryLayers = oldStore.fullInventoryLayers ?? [];
    newStore.fullBillingCharges = oldStore.fullBillingCharges ?? [];
    newStore.fullStockSync = oldStore.fullStockSync;
    newStore.costSkuMappings = oldStore.costSkuMappings ?? [];
    newStore.ignoredCostSkus = oldStore.ignoredCostSkus ?? [];
    newStore.dismissedRareChargeAlerts = oldStore.dismissedRareChargeAlerts ?? [];
    newStore.dismissedFullAuditAlerts = oldStore.dismissedFullAuditAlerts ?? [];
    newStore.pendingCostImports = oldStore.pendingCostImports ?? [];
    newStore.inventoryBaselineAt =
      newStore.inventoryBaselineAt ?? oldStore.inventoryBaselineAt;

    // Safely preserve previously entered product average costs
    const previousCostBySku = new Map(
      (oldStore.products ?? []).map((product) => [
        normalizeSkuKey(product.masterSku),
        product.averageUnitCost ?? 0,
      ]),
    );

    newStore.products = (newStore.products ?? []).map((product) => ({
      ...product,
      averageUnitCost:
        product.averageUnitCost && product.averageUnitCost > 0
          ? product.averageUnitCost
          : previousCostBySku.get(normalizeSkuKey(product.masterSku)) ?? 0,
    }));
  }

  await writeLocalStore(newStore);
  return newStore;
}

export async function replaceInventoryQuantities(input: {
  products: LocalStore["products"];
  sales: LocalStore["sales"];
  inventoryBalances: LocalStore["inventoryBalances"];
}) {
  const store = await readLocalStore();
  const importedAt = new Date().toISOString();
  const previousProducts = store.products;
  const previousCostBySku = new Map(
    store.products.map((product) => [normalizeSkuKey(product.masterSku), product.averageUnitCost ?? 0]),
  );
  store.products = input.products.map((product) => ({
    ...product,
    averageUnitCost:
      product.averageUnitCost && product.averageUnitCost > 0
        ? product.averageUnitCost
        :
      previousCostBySku.get(normalizeSkuKey(product.masterSku)) ??
      0,
  }));
  const importedProductKeys = new Set(
    store.products.map((product) => normalizeSkuKey(product.masterSku)),
  );
  const retainedProducts = store.products;
  for (const existingProduct of previousProducts) {
    const key = normalizeSkuKey(existingProduct.masterSku);
    if (importedProductKeys.has(key)) {
      continue;
    }

    retainedProducts.push({
      ...existingProduct,
      currentStock: existingProduct.currentStock ?? 0,
      totalIngresado: existingProduct.totalIngresado ?? 0,
      totalVendido: existingProduct.totalVendido ?? 0,
      averageUnitCost: existingProduct.averageUnitCost ?? 0,
      isActive: existingProduct.isActive ?? true,
    });
  }
  store.products = retainedProducts;
  store.sales = input.sales;
  store.inventoryBalances = [
    ...store.inventoryBalances.filter((balance) => balance.warehouseId !== "wh_main"),
    ...input.inventoryBalances,
  ];
  store.importedAt = importedAt;
  store.inventoryBaselineAt = importedAt;
  applyMarketplaceOrderInventoryFromCurrentBalances(store);
  syncAllProductTotalsFromBalances(store);
  await writeLocalStore(store);
  return store;
}

export async function bulkUpdateProductCosts(
  costs: Array<{ masterSku: string; averageUnitCost: number }>,
) {
  const store = await readLocalStore();
  const productBySku = new Map(
    store.products.map((product) => [
      normalizeSkuKey(product.masterSku),
      product,
    ]),
  );
  const mappedCostSkuByKey = new Map(
    store.costSkuMappings.map((mapping) => [
      normalizeSkuKey(mapping.costSku),
      mapping.masterSkus?.length ? mapping.masterSkus : mapping.masterSku ? [mapping.masterSku] : [],
    ]),
  );
  const ignoredCostKeys = new Set(store.ignoredCostSkus.map(normalizeSkuKey));
  const updated: LocalStore["products"] = [];
  const ignored: Array<{ masterSku: string; averageUnitCost: number }> = [];
  const pendingByKey = new Map(
    store.pendingCostImports.map((item) => [
      normalizeSkuKey(item.costSku),
      { ...item },
    ]),
  );

  for (const cost of costs) {
    const costSku = cost.masterSku.trim();
    const costSkuKey = normalizeSkuKey(costSku);

    if (ignoredCostKeys.has(costSkuKey)) {
      pendingByKey.delete(costSkuKey);
      continue;
    }

    const products = resolveCostImportProducts({
      costSku,
      store,
      productBySku,
      mappedCostSkuByKey,
    });

    if (products.length === 0) {
      const product = ensureProductExists(store, costSku);
      productBySku.set(costSkuKey, product);
      products.push(product);
    }

    for (const product of products) {
      product.averageUnitCost = Number.isFinite(cost.averageUnitCost)
        ? Math.max(0, cost.averageUnitCost)
        : 0;
      updated.push(product);
    }
    pendingByKey.delete(costSkuKey);
  }

  store.pendingCostImports = [...pendingByKey.values()].sort((a, b) =>
    a.costSku.localeCompare(b.costSku),
  );
  store.importedAt = new Date().toISOString();
  await writeLocalStore(store);

  return { updated, ignored };
}

function applyPendingCostImportsToStore(store: LocalStore) {
  const productBySku = new Map(
    store.products.map((product) => [
      normalizeSkuKey(product.masterSku),
      product,
    ]),
  );
  const mappedCostSkuByKey = new Map(
    store.costSkuMappings.map((mapping) => [
      normalizeSkuKey(mapping.costSku),
      mapping.masterSkus?.length
        ? mapping.masterSkus
        : mapping.masterSku
          ? [mapping.masterSku]
          : [],
    ]),
  );
  const remainingPending = [];

  for (const pending of store.pendingCostImports) {
    if (!pending.averageUnitCost || pending.averageUnitCost <= 0) {
      remainingPending.push(pending);
      continue;
    }

    const products = resolveCostImportProducts({
      costSku: pending.costSku,
      store,
      productBySku,
      mappedCostSkuByKey,
      onlyProductsWithoutCost: true,
    });

    if (products.length === 0) {
      remainingPending.push(pending);
      continue;
    }

    for (const product of products) {
      product.averageUnitCost = pending.averageUnitCost;
    }
  }

  store.pendingCostImports = remainingPending.sort((a, b) =>
    a.costSku.localeCompare(b.costSku),
  );
}

function resolveCostImportProducts(input: {
  costSku: string;
  store: LocalStore;
  productBySku: Map<string, LocalProduct>;
  mappedCostSkuByKey: Map<string, string[]>;
  onlyProductsWithoutCost?: boolean;
}) {
  const costSkuKey = normalizeSkuKey(input.costSku);
  const mappedMasterSkus = input.mappedCostSkuByKey.get(costSkuKey);
  const directProduct = input.productBySku.get(costSkuKey);
  const targetMasterSkus = mappedMasterSkus?.length
    ? mappedMasterSkus
    : directProduct
      ? [directProduct.masterSku]
      : resolveAutoCostMatch(input.costSku, input.store.products);

  return targetMasterSkus
    .map((masterSku) => input.productBySku.get(normalizeSkuKey(masterSku)))
    .filter((product): product is LocalProduct => {
      if (!product) {
        return false;
      }

      return input.onlyProductsWithoutCost
        ? !product.averageUnitCost || product.averageUnitCost <= 0
        : true;
    });
}

export async function mapCostSkuToProducts(input: {
  costSku: string;
  masterSkus: string[];
  averageUnitCost: number;
}) {
  const store = await readLocalStore();
  const costSku = input.costSku.trim();
  const requestedSkus = input.masterSkus
    .map((masterSku) => masterSku.trim())
    .filter(Boolean);
  const products = requestedSkus.map((masterSku) => {
    const product = store.products.find(
      (entry) => normalizeSkuKey(entry.masterSku) === normalizeSkuKey(masterSku),
    );

    if (!product) {
      throw new Error(`SKU maestro no existe: ${masterSku}`);
    }

    return product;
  });

  if (products.length === 0) {
    throw new Error("Agrega al menos un SKU maestro");
  }

  for (const product of products) {
    product.averageUnitCost = Number.isFinite(input.averageUnitCost)
      ? Math.max(0, input.averageUnitCost)
      : 0;
  }

  const existingMapping = store.costSkuMappings.find(
    (mapping) => normalizeSkuKey(mapping.costSku) === normalizeSkuKey(costSku),
  );
  const masterSkus = [...new Set(products.map((product) => product.masterSku))];

  if (existingMapping) {
    existingMapping.masterSkus = masterSkus;
    delete existingMapping.masterSku;
  } else {
    store.costSkuMappings.push({ costSku, masterSkus });
  }

  store.ignoredCostSkus = store.ignoredCostSkus.filter(
    (ignoredSku) => normalizeSkuKey(ignoredSku) !== normalizeSkuKey(costSku),
  );
  store.pendingCostImports = store.pendingCostImports.filter(
    (item) => normalizeSkuKey(item.costSku) !== normalizeSkuKey(costSku),
  );
  store.importedAt = new Date().toISOString();
  await writeLocalStore(store);

  return products;
}

export async function ignoreCostSku(costSkuInput: string) {
  const store = await readLocalStore();
  const costSku = costSkuInput.trim();
  if (!costSku) {
    throw new Error("SKU de costo requerido");
  }

  const alreadyIgnored = store.ignoredCostSkus.some(
    (ignoredSku) => normalizeSkuKey(ignoredSku) === normalizeSkuKey(costSku),
  );
  if (!alreadyIgnored) {
    store.ignoredCostSkus.push(costSku);
  }

  store.pendingCostImports = store.pendingCostImports.filter(
    (item) => normalizeSkuKey(item.costSku) !== normalizeSkuKey(costSku),
  );
  store.importedAt = new Date().toISOString();
  await writeLocalStore(store);

  return costSku;
}

export async function dismissRareChargeAlert(alertId: string) {
  const store = await readLocalStore();
  const id = alertId.trim();

  if (!id) {
    throw new Error("Alert id is required");
  }

  store.dismissedRareChargeAlerts ??= [];
  const alreadyDismissed = store.dismissedRareChargeAlerts.some(
    (alert) => alert.id === id,
  );

  if (!alreadyDismissed) {
    store.dismissedRareChargeAlerts.push({
      id,
      dismissedAt: new Date().toISOString(),
    });
  }

  await writeLocalStore(store);
  return id;
}

export async function dismissFullAuditAlert(alertId: string) {
  const id = alertId.trim();
  if (!id) {
    throw new Error("Alerta Full invalida");
  }

  const store = await readLocalStore();
  store.dismissedFullAuditAlerts ??= [];
  const alreadyDismissed = store.dismissedFullAuditAlerts.some(
    (alert) => alert.id === id,
  );

  if (!alreadyDismissed) {
    store.dismissedFullAuditAlerts.push({
      id,
      dismissedAt: new Date().toISOString(),
    });
  }

  await writeLocalStore(store);
  return id;
}

function resolveAutoCostMatch(inputSku: string, products: LocalProduct[]) {
  const scored = scoreMasterSkuMatches(inputSku, products);
  const [best, second] = scored;

  if (!best || best.score < 5) {
    return [];
  }

  if (second && second.score >= best.score) {
    return [];
  }

  return [best.masterSku];
}

function scoreMasterSkuMatches(inputSku: string, products: LocalProduct[]) {
  const inputTokens = tokenizeSku(inputSku);
  if (inputTokens.length === 0) {
    return [];
  }

  return products
    .map((product) => {
      const productTokens = tokenizeSku(`${product.masterSku} ${product.name}`);
      const overlap = inputTokens.filter((token) =>
        productTokens.includes(token),
      ).length;
      const contains =
        normalizeSkuKey(`${product.masterSku} ${product.name}`).includes(
          normalizeSkuKey(inputSku),
        ) ||
        normalizeSkuKey(inputSku).includes(normalizeSkuKey(product.masterSku));

      return {
        masterSku: product.masterSku,
        score: overlap * 2 + (contains ? 3 : 0),
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.masterSku.localeCompare(b.masterSku));
}

function tokenizeSku(value: string) {
  const stopWords = new Set([
    "de",
    "del",
    "la",
    "el",
    "los",
    "las",
    "para",
    "con",
    "sin",
    "color",
    "pieza",
    "piezas",
    "pz",
  ]);

  return normalizeSkuKey(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !stopWords.has(token));
}

function getChangedOnlineSkuKeys(
  previous: LocalStore["onlineSkus"],
  next: LocalStore["onlineSkus"],
) {
  const previousByKey = new Map(
    previous.map((sku) => [normalizeSkuKey(sku.onlineSku), mappingSignature(sku)]),
  );
  const nextByKey = new Map(
    next.map((sku) => [normalizeSkuKey(sku.onlineSku), mappingSignature(sku)]),
  );
  const keys = new Set([...previousByKey.keys(), ...nextByKey.keys()]);

  return new Set(
    [...keys].filter((key) => previousByKey.get(key) !== nextByKey.get(key)),
  );
}

function mappingSignature(sku: LocalStore["onlineSkus"][number]) {
  return JSON.stringify({
    onlineSku: normalizeSkuKey(sku.onlineSku),
    title: sku.title,
    channel: sku.channel,
    marketplaceAccount: sku.marketplaceAccount,
    externalListingId: sku.externalListingId ?? null,
    safetyBufferUnits: sku.safetyBufferUnits ?? 0,
    components: sku.components.map((component) => ({
      masterSku: normalizeSkuKey(component.masterSku),
      quantityRequired: component.quantityRequired,
    })),
  });
}

export async function replaceSkuMappings(onlineSkus: LocalStore["onlineSkus"]) {
  if (onlineSkus.length === 0) {
    throw new Error("Cannot replace SKU mappings with an empty import");
  }

  const store = await readLocalStore();
  const changedOnlineSkuKeys = getChangedOnlineSkuKeys(store.onlineSkus, onlineSkus);
  const previousOrders = store.marketplaceOrders.map((order) => ({
    ...order,
    items: order.items.map((item) => ({ ...item })),
    inventoryApplications: order.inventoryApplications?.map((application) => ({
      ...application,
    })),
  }));

  for (const order of previousOrders) {
    restoreOrderInventoryEffects(store, order);
  }

  store.onlineSkus = onlineSkus;
  for (const sku of onlineSkus) {
    for (const component of sku.components) {
      ensureProductExists(store, component.masterSku);
    }
  }
  applyPendingCostImportsToStore(store);
  store.marketplaceOrders = store.marketplaceOrders.map((order) =>
    remapMarketplaceOrder(order, onlineSkus),
  );
  remapFullStockSync(store, onlineSkus);

  for (const order of store.marketplaceOrders) {
    applyOrderInventoryEffects(store, order);
  }

  store.importedAt = new Date().toISOString();
  const ordersToMirror = store.marketplaceOrders.filter((order) =>
    order.items.some((item) =>
      changedOnlineSkuKeys.has(normalizeSkuKey(item.externalSku)),
    ),
  );
  await writeLocalStore(store, { ordersToMirror });
  return store;
}

export async function listProducts() {
  const store = await readLocalStore();
  return store.products.filter((product) => product.isActive !== false);
}

export async function createProduct(input: {
  masterSku: string;
  name: string;
  initialStock?: number;
  averageUnitCost?: number;
  warehouseId?: string;
}) {
  const store = await readLocalStore();
  const masterSku = input.masterSku.trim();
  const warehouseId = input.warehouseId?.trim() || "wh_main";
  const initialStock = Number(input.initialStock ?? 0);
  const averageUnitCost = Number(input.averageUnitCost ?? 0);

  if (!masterSku) {
    throw new Error("masterSku is required");
  }

  const existingProduct = store.products.find(
    (product) => normalizeSkuKey(product.masterSku) === normalizeSkuKey(masterSku),
  );

  if (existingProduct?.isActive !== false) {
    throw new Error("masterSku already exists");
  }

  if (
    !Number.isFinite(initialStock) ||
    initialStock < 0 ||
    !Number.isFinite(averageUnitCost) ||
    averageUnitCost < 0
  ) {
    throw new Error("stock y costo deben ser numeros validos");
  }

  if (!store.warehouses.some((warehouse) => warehouse.id === warehouseId)) {
    throw new Error("warehouse does not exist");
  }

  if (existingProduct) {
    existingProduct.name = input.name.trim() || masterSku;
    existingProduct.currentStock = initialStock;
    existingProduct.totalIngresado = Math.max(existingProduct.totalIngresado ?? 0, initialStock);
    existingProduct.averageUnitCost = averageUnitCost;
    existingProduct.isActive = true;
    const balance = getOrCreateBalance(store, existingProduct.masterSku, warehouseId);
    balance.physicalQuantity = initialStock;
    syncProductTotalsFromBalances(store, existingProduct.masterSku);
    store.importedAt = new Date().toISOString();
    await writeLocalStore(store);
    return existingProduct;
  }

  const product: LocalProduct = {
    id: buildUniqueProductId(store, masterSku),
    masterSku,
    name: input.name.trim() || masterSku,
    currentStock: initialStock,
    totalIngresado: initialStock,
    totalVendido: 0,
    targetInventoryDays: 90,
    averageUnitCost,
    isActive: true,
  };

  store.products.push(product);
  store.inventoryBalances.push({
    masterSku,
    warehouseId,
    physicalQuantity: product.currentStock,
    reservedQuantity: 0,
    blockedQuantity: 0,
  });

  await writeLocalStore(store);
  return product;
}

export async function updateProduct(input: {
  currentMasterSku: string;
  masterSku: string;
  name: string;
  averageUnitCost?: number;
}) {
  const store = await readLocalStore();
  const currentMasterSku = input.currentMasterSku.trim();
  const nextMasterSku = input.masterSku.trim();
  const name = input.name.trim();
  const averageUnitCost = Number(input.averageUnitCost ?? 0);
  const product = store.products.find(
    (entry) =>
      entry.masterSku.toLowerCase() === currentMasterSku.toLowerCase() &&
      entry.isActive !== false,
  );

  if (!product) {
    throw new Error("SKU maestro no encontrado");
  }

  if (!nextMasterSku) {
    throw new Error("SKU maestro es requerido");
  }

  const skuChanged =
    product.masterSku.toLowerCase() !== nextMasterSku.toLowerCase();
  if (
    skuChanged &&
    store.products.some(
      (entry) =>
        entry.masterSku.toLowerCase() === nextMasterSku.toLowerCase() &&
        entry.isActive !== false,
    )
  ) {
    throw new Error("Ya existe otro producto con ese SKU maestro");
  }

  const previousMasterSku = product.masterSku;
  const previousKey = normalizeSkuKey(previousMasterSku);
  product.masterSku = nextMasterSku;
  product.name = name || nextMasterSku;
  if (Number.isFinite(averageUnitCost)) {
    product.averageUnitCost = Math.max(0, averageUnitCost);
  }
  product.isActive = true;

  const ordersToMirror = skuChanged
    ? store.marketplaceOrders.filter((order) =>
        order.items.some((item) => normalizeSkuKey(item.masterSku ?? "") === previousKey),
      )
    : [];

  if (skuChanged) {
    replaceMasterSkuReferences(store, previousMasterSku, nextMasterSku);
  }

  store.importedAt = new Date().toISOString();
  await writeLocalStore(store, { ordersToMirror });
  return product;
}

export async function deleteProduct(input: { masterSku: string }) {
  const store = await readLocalStore();
  const masterSku = input.masterSku.trim();
  const product = store.products.find(
    (entry) =>
      entry.masterSku.toLowerCase() === masterSku.toLowerCase() &&
      entry.isActive !== false,
  );

  if (!product) {
    throw new Error("SKU maestro no encontrado");
  }

  const hasHistoricalReferences = productHasHistoricalReferences(
    store,
    product.masterSku,
  );

  if (hasHistoricalReferences) {
    product.isActive = false;
    store.importedAt = new Date().toISOString();
    await writeLocalStore(store);
    return { product, mode: "archived" as const };
  }

  store.products = store.products.filter((entry) => entry.id !== product.id);
  store.inventoryBalances = store.inventoryBalances.filter(
    (balance) => balance.masterSku.toLowerCase() !== masterSku.toLowerCase(),
  );
  store.inventoryMovements = store.inventoryMovements.filter(
    (movement) => movement.masterSku.toLowerCase() !== masterSku.toLowerCase(),
  );
  store.sales = store.sales.filter(
    (sale) => sale.masterSku.toLowerCase() !== masterSku.toLowerCase(),
  );
  store.fullInventoryLayers = store.fullInventoryLayers.filter(
    (layer) => layer.masterSku.toLowerCase() !== masterSku.toLowerCase(),
  );
  store.costSkuMappings = store.costSkuMappings
    .map((mapping) => ({
      ...mapping,
      masterSku:
        mapping.masterSku?.toLowerCase() === masterSku.toLowerCase()
          ? undefined
          : mapping.masterSku,
      masterSkus: mapping.masterSkus?.filter(
        (entry) => entry.toLowerCase() !== masterSku.toLowerCase(),
      ),
    }))
    .filter(
      (mapping) =>
        Boolean(mapping.masterSku) || Boolean(mapping.masterSkus?.length),
    );
  store.pendingCostImports = store.pendingCostImports.filter(
    (item) => normalizeSkuKey(item.costSku) !== normalizeSkuKey(masterSku),
  ).map((item) => ({
    ...item,
    suggestedMasterSkus: item.suggestedMasterSkus.filter(
      (entry) => entry.toLowerCase() !== masterSku.toLowerCase(),
    ),
  }));
  for (const order of store.marketplaceOrders) {
    order.fullCostAllocations = order.fullCostAllocations?.filter(
      (allocation) => allocation.masterSku.toLowerCase() !== masterSku.toLowerCase(),
    );
  }
  for (const item of [
    ...(store.fullStockSync?.items ?? []),
    ...(store.fullStockSync?.auditItems ?? []),
  ]) {
    if (item.masterSku?.toLowerCase() === masterSku.toLowerCase()) {
      item.masterSku = null;
      item.componentQuantityRequired = null;
    }
  }
  if (store.fullStockSync) {
    const fullItemsForCount = store.fullStockSync.items?.length
      ? store.fullStockSync.items
      : (store.fullStockSync.auditItems ?? []);
    store.fullStockSync.mappedUnits = fullItemsForCount.reduce(
      (sum, item) =>
        sum + (item.masterSku ? item.availableQuantity : 0),
      0,
    );
  }
  store.importedAt = new Date().toISOString();
  await writeLocalStore(store);
  return { product, mode: "deleted" as const };
}

export async function restoreProduct(input: { masterSku: string }) {
  const store = await readLocalStore();
  const masterSku = input.masterSku.trim();
  const product = store.products.find(
    (entry) =>
      entry.masterSku.toLowerCase() === masterSku.toLowerCase() &&
      entry.isActive === false,
  );

  if (!product) {
    throw new Error("SKU maestro archivado no encontrado");
  }

  const activeDuplicate = store.products.some(
    (entry) =>
      entry.id !== product.id &&
      entry.masterSku.toLowerCase() === product.masterSku.toLowerCase() &&
      entry.isActive !== false,
  );
  if (activeDuplicate) {
    throw new Error("Ya existe otro SKU maestro activo con ese nombre");
  }

  product.isActive = true;
  store.importedAt = new Date().toISOString();
  await writeLocalStore(store);
  return product;
}

export async function addInventoryAdjustment(input: {
  masterSku: string;
  warehouseId: string;
  quantity: number;
  note?: string;
}) {
  const store = await readLocalStore();
  const masterSku = input.masterSku.trim();
  const warehouseId = input.warehouseId.trim();
  const quantity = Number(input.quantity);

  if (!masterSku || !warehouseId || !Number.isFinite(quantity) || quantity === 0) {
    throw new Error("Invalid inventory adjustment");
  }

  ensureProductExists(store, masterSku);
  const balance = getOrCreateBalance(store, masterSku, warehouseId);
  balance.physicalQuantity += quantity;
  syncProductTotalsFromBalances(store, masterSku);
  store.inventoryMovements.push({
    id: `mov_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    date: new Date().toISOString(),
    type: "adjustment",
    masterSku,
    warehouseId,
    quantity,
    reference: "manual_adjustment",
    note: input.note?.trim() || undefined,
  });

  await writeLocalStore(store);
  return balance;
}

export async function resetInventoryCount(input: {
  masterSku: string;
  warehouseId: string;
  countedPhysicalQuantity: number;
  note?: string;
}) {
  const store = await readLocalStore();
  const masterSku = input.masterSku.trim();
  const warehouseId = input.warehouseId.trim();
  const countedPhysicalQuantity = Number(input.countedPhysicalQuantity);

  if (
    !masterSku ||
    !warehouseId ||
    !Number.isFinite(countedPhysicalQuantity) ||
    countedPhysicalQuantity < 0
  ) {
    throw new Error("Invalid inventory count reset");
  }

  ensureProductExists(store, masterSku);
  const balance = getOrCreateBalance(store, masterSku, warehouseId);
  const committedQuantity = buildStockCommitments(store.marketplaceOrders)
    .filter(
      (commitment) =>
        commitment.masterSku.toLowerCase() === masterSku.toLowerCase() &&
        commitment.warehouseId === warehouseId,
    )
    .reduce((sum, commitment) => sum + commitment.quantity, 0);
  const previousQuantity = balance.physicalQuantity;
  const nextQuantity = countedPhysicalQuantity - committedQuantity;
  const adjustmentQuantity = nextQuantity - previousQuantity;

  balance.physicalQuantity = nextQuantity;
  syncProductTotalsFromBalances(store, masterSku);
  store.inventoryMovements.push({
    id: `mov_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    date: new Date().toISOString(),
    type: "adjustment",
    masterSku,
    warehouseId,
    quantity: adjustmentQuantity,
    reference: "sku_count_reset",
    note:
      input.note?.trim() ||
      `Conteo SKU: fisico ${countedPhysicalQuantity}, apartado ${committedQuantity}, disponible ${nextQuantity}`,
  });

  await writeLocalStore(store);
  return {
    balance,
    countedPhysicalQuantity,
    committedQuantity,
    previousQuantity,
    nextQuantity,
    adjustmentQuantity,
  };
}

export async function transferInventory(input: {
  masterSku: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  quantity: number;
  note?: string;
}) {
  const store = await readLocalStore();
  const masterSku = input.masterSku.trim();
  const fromWarehouseId = input.fromWarehouseId.trim();
  const toWarehouseId = input.toWarehouseId.trim();
  const quantity = Number(input.quantity);

  if (
    !masterSku ||
    !fromWarehouseId ||
    !toWarehouseId ||
    fromWarehouseId === toWarehouseId ||
    !Number.isFinite(quantity) ||
    quantity <= 0
  ) {
    throw new Error("Invalid inventory transfer");
  }

  ensureProductExists(store, masterSku);
  const fromBalance = getOrCreateBalance(store, masterSku, fromWarehouseId);
  const toBalance = getOrCreateBalance(store, masterSku, toWarehouseId);
  fromBalance.physicalQuantity -= quantity;
  toBalance.physicalQuantity += quantity;
  syncProductTotalsFromBalances(store, masterSku);

  const movementId = `mov_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  store.inventoryMovements.push(
    {
      id: `${movementId}_out`,
      date: new Date().toISOString(),
      type: "transfer",
      masterSku,
      warehouseId: fromWarehouseId,
      quantity: -quantity,
      reference: `transfer:${fromWarehouseId}->${toWarehouseId}`,
      note: input.note?.trim() || undefined,
    },
    {
      id: `${movementId}_in`,
      date: new Date().toISOString(),
      type: "transfer",
      masterSku,
      warehouseId: toWarehouseId,
      quantity,
      reference: `transfer:${fromWarehouseId}->${toWarehouseId}`,
      note: input.note?.trim() || undefined,
    },
  );

  await writeLocalStore(store);
  return { fromBalance, toBalance };
}

export async function addFullInventoryLayer(input: {
  masterSku: string;
  quantity: number;
  unitVolumeM3: number;
  inboundFreightCostTotal: number;
  storageCostPerUnitPerDay: number;
  dateReceived?: string;
  note?: string;
}) {
  const store = await readLocalStore();
  const layer = addFullInventoryLayerToStore(store, input);
  recalculateMarketplaceOrderInventory(store);
  await writeLocalStore(store);
  return layer;
}

export async function addFullShipment(input: {
  rows: Array<{
    masterSku: string;
    quantity: number;
    totalVolumeM3: number;
  }>;
  shipmentFreightCostTotal: number;
  storageCostPerUnitPerDay: number;
  dateReceived?: string;
  note?: string;
}) {
  const store = await readLocalStore();
  const validRows = input.rows
    .map((row) => ({
      masterSku: row.masterSku.trim(),
      quantity: Number(row.quantity),
      totalVolumeM3: Math.max(0, Number(row.totalVolumeM3) || 0),
    }))
    .filter(
      (row) =>
        row.masterSku &&
        Number.isFinite(row.quantity) &&
        row.quantity > 0,
    );

  if (validRows.length === 0) {
    throw new Error("Agrega al menos un SKU con piezas para el envio Full");
  }

  const shipmentFreightCostTotal = Math.max(
    0,
    Number(input.shipmentFreightCostTotal) || 0,
  );
  const totalVolumeM3 = validRows.reduce(
    (sum, row) => sum + row.totalVolumeM3,
    0,
  );
  const totalPieces = validRows.reduce((sum, row) => sum + row.quantity, 0);
  const allocatedFreightCosts = allocateShipmentFreightCosts({
    rows: validRows,
    totalVolumeM3,
    totalPieces,
    shipmentFreightCostTotal,
  });

  const layers = validRows.map((row, index) => {
    return addFullInventoryLayerToStore(store, {
      masterSku: row.masterSku,
      quantity: row.quantity,
      unitVolumeM3: row.totalVolumeM3 > 0 ? row.totalVolumeM3 / row.quantity : 0,
      inboundFreightCostTotal: allocatedFreightCosts[index] ?? 0,
      storageCostPerUnitPerDay: input.storageCostPerUnitPerDay,
      dateReceived: input.dateReceived,
      note: input.note,
    });
  });

  recalculateMarketplaceOrderInventory(store);
  await writeLocalStore(store);
  return layers;
}

function allocateShipmentFreightCosts(input: {
  rows: Array<{ quantity: number; totalVolumeM3: number }>;
  totalVolumeM3: number;
  totalPieces: number;
  shipmentFreightCostTotal: number;
}) {
  const totalCents = Math.round(input.shipmentFreightCostTotal * 100);
  if (totalCents <= 0) {
    return input.rows.map(() => 0);
  }

  const weighted = input.rows.map((row, index) => {
    const share =
      input.totalVolumeM3 > 0
        ? row.totalVolumeM3 / input.totalVolumeM3
        : row.quantity / input.totalPieces;
    const exactCents = totalCents * share;

    return {
      index,
      cents: Math.floor(exactCents),
      remainder: exactCents - Math.floor(exactCents),
    };
  });
  let remainderCents =
    totalCents - weighted.reduce((sum, item) => sum + item.cents, 0);

  for (const item of [...weighted].sort((a, b) => b.remainder - a.remainder)) {
    if (remainderCents <= 0) {
      break;
    }

    item.cents += 1;
    remainderCents -= 1;
  }

  return weighted
    .sort((a, b) => a.index - b.index)
    .map((item) => item.cents / 100);
}

function addFullInventoryLayerToStore(
  store: LocalStore,
  input: {
    masterSku: string;
    quantity: number;
    unitVolumeM3: number;
    inboundFreightCostTotal: number;
    storageCostPerUnitPerDay: number;
    dateReceived?: string;
    note?: string;
  },
) {
  const masterSku = input.masterSku.trim();
  const quantity = Number(input.quantity);
  const unitVolumeM3 = Math.max(0, Number(input.unitVolumeM3) || 0);
  const inboundFreightCostTotal = Math.max(
    0,
    Number(input.inboundFreightCostTotal) || 0,
  );
  const storageCostPerUnitPerDay = Math.max(
    0,
    Number(input.storageCostPerUnitPerDay) || 0,
  );
  const dateReceived = input.dateReceived
    ? new Date(input.dateReceived).toISOString()
    : new Date().toISOString();

  if (!masterSku || !Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Invalid Full layer");
  }

  ensureProductExists(store, masterSku);
  const layer: LocalFullInventoryLayer = {
    id: `full_layer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    dateReceived,
    masterSku,
    initialQuantity: quantity,
    remainingQuantity: quantity,
    unitVolumeM3,
    inboundFreightCostTotal,
    inboundFreightCostPerUnit: inboundFreightCostTotal / quantity,
    storageCostPerUnitPerDay,
    note: input.note?.trim() || undefined,
  };

  store.fullInventoryLayers.push(layer);

  const mainBalance = getOrCreateBalance(store, masterSku, "wh_main");
  const fullBalance = getOrCreateBalance(store, masterSku, "wh_full");
  mainBalance.physicalQuantity -= quantity;
  fullBalance.physicalQuantity += quantity;
  syncProductTotalsFromBalances(store, masterSku);

  const movementId = `mov_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  store.inventoryMovements.push(
    {
      id: `${movementId}_out`,
      date: dateReceived,
      type: "transfer",
      masterSku,
      warehouseId: "wh_main",
      quantity: -quantity,
      reference: `full_layer:${layer.id}`,
      note: input.note?.trim() || "Envio a Full",
    },
    {
      id: `${movementId}_in`,
      date: dateReceived,
      type: "transfer",
      masterSku,
      warehouseId: "wh_full",
      quantity,
      reference: `full_layer:${layer.id}`,
      note: input.note?.trim() || "Recepcion Full",
    },
  );

  return layer;
}

export async function updateFullInventoryLayer(input: {
  layerId: string;
  quantity: number;
  unitVolumeM3: number;
  inboundFreightCostTotal: number;
  storageCostPerUnitPerDay: number;
  dateReceived?: string;
  note?: string;
}) {
  const store = await readLocalStore();
  const layer = store.fullInventoryLayers.find((entry) => entry.id === input.layerId);

  if (!layer) {
    throw new Error("Full layer not found");
  }

  const quantity = Number(input.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Invalid Full layer quantity");
  }

  restoreMarketplaceOrderInventory(store);

  const oldQuantity = layer.initialQuantity;
  const quantityDelta = quantity - oldQuantity;
  const inboundFreightCostTotal = Math.max(
    0,
    Number(input.inboundFreightCostTotal) || 0,
  );
  const mainBalance = getOrCreateBalance(store, layer.masterSku, "wh_main");
  const fullBalance = getOrCreateBalance(store, layer.masterSku, "wh_full");

  mainBalance.physicalQuantity -= quantityDelta;
  fullBalance.physicalQuantity += quantityDelta;

  layer.initialQuantity = quantity;
  layer.remainingQuantity = quantity;
  layer.unitVolumeM3 = Math.max(0, Number(input.unitVolumeM3) || 0);
  layer.inboundFreightCostTotal = inboundFreightCostTotal;
  layer.inboundFreightCostPerUnit = inboundFreightCostTotal / quantity;
  layer.storageCostPerUnitPerDay = Math.max(
    0,
    Number(input.storageCostPerUnitPerDay) || 0,
  );
  layer.dateReceived = input.dateReceived
    ? new Date(input.dateReceived).toISOString()
    : layer.dateReceived;
  layer.note = input.note?.trim() || undefined;

  store.inventoryMovements
    .filter((movement) => movement.reference === `full_layer:${layer.id}`)
    .forEach((movement) => {
      movement.date = layer.dateReceived;
      movement.note = layer.note || movement.note;
      movement.quantity =
        movement.warehouseId === "wh_full" ? quantity : -quantity;
    });

  applyMarketplaceOrderInventory(store);
  syncProductTotalsFromBalances(store, layer.masterSku);
  await writeLocalStore(store);
  return layer;
}

export async function deleteFullInventoryLayer(layerId: string) {
  const store = await readLocalStore();
  const layer = store.fullInventoryLayers.find((entry) => entry.id === layerId);

  if (!layer) {
    throw new Error("Full layer not found");
  }

  restoreMarketplaceOrderInventory(store);

  const mainBalance = getOrCreateBalance(store, layer.masterSku, "wh_main");
  const fullBalance = getOrCreateBalance(store, layer.masterSku, "wh_full");
  mainBalance.physicalQuantity += layer.initialQuantity;
  fullBalance.physicalQuantity -= layer.initialQuantity;
  store.fullInventoryLayers = store.fullInventoryLayers.filter(
    (entry) => entry.id !== layerId,
  );
  store.inventoryMovements = store.inventoryMovements.filter(
    (movement) => movement.reference !== `full_layer:${layer.id}`,
  );

  applyMarketplaceOrderInventory(store);
  syncProductTotalsFromBalances(store, layer.masterSku);
  await writeLocalStore(store);
  return layer;
}

export async function recalculateMarketplaceOrders() {
  const store = await readLocalStore();
  
  // Retroactively prune raw payloads for existing orders to compress storage footprint
  store.marketplaceOrders = store.marketplaceOrders.map((order) => ({
    ...order,
    raw: order.raw ? pruneMeliOrder(order.raw) : order.raw,
  }));

  recalculateMarketplaceOrderInventory(store);
  await writeLocalStore(store);
  return store;
}

export async function updateProductCost(input: {
  masterSku: string;
  averageUnitCost: number;
}) {
  const store = await readLocalStore();
  const masterSku = input.masterSku.trim();
  const averageUnitCost = Number.isFinite(input.averageUnitCost)
    ? Math.max(0, input.averageUnitCost)
    : 0;
  let product = store.products.find(
    (entry) => entry.masterSku.toLowerCase() === masterSku.toLowerCase(),
  );

  if (!masterSku) {
    throw new Error("SKU maestro es requerido");
  }

  if (!product) {
    product = {
      id: `prod_${masterSku.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
      masterSku,
      name: masterSku,
      currentStock: 0,
      totalIngresado: 0,
      totalVendido: 0,
      targetInventoryDays: 90,
      isActive: true,
    };
    store.products.push(product);
  }

  product.averageUnitCost = averageUnitCost;
  await writeLocalStore(store);
  return product;
}

export async function addMarketplaceOrderCharge(input: {
  externalOrderId: string;
  type: string;
  amount: number;
  source?: string;
}) {
  const store = await readLocalStore();
  const order = store.marketplaceOrders.find(
    (entry) => entry.externalOrderId === input.externalOrderId,
  );

  if (!order) {
    throw new Error("Order not found");
  }

  order.charges.push({
    type: input.type.trim() || "other",
    amount: Math.max(0, input.amount),
    source: input.source ?? "manual",
  });

  await writeLocalStore(store);
  const organization = await resolveOrganization();
  await syncMarketplaceOrderTables(organization.id, store, [order]);
  return order;
}

export async function updateMarketplaceOrderReceived(input: {
  externalOrderId: string;
  netReceivedAmount: number;
}) {
  const store = await readLocalStore();
  const order = store.marketplaceOrders.find(
    (entry) => entry.externalOrderId === input.externalOrderId,
  );

  if (!order) {
    throw new Error("Order not found");
  }

  order.netReceivedAmount = Math.max(0, input.netReceivedAmount);
  order.billingStatus = "confirmed";
  order.billingError = null;
  order.billingLastTriedAt = new Date().toISOString();
  await writeLocalStore(store);
  return order;
}

export async function addOperatingExpense(input: {
  month: string;
  category: string;
  description?: string;
  amount: number;
  paidAt?: string;
  isRecurring?: boolean;
  frequency?: string;
  periodStart?: string;
  activeUntil?: string;
}) {
  const store = await readLocalStore();
  const frequency = normalizeExpenseFrequency(input.frequency);
  const month = normalizeExpenseMonth(
    input.month || input.periodStart || input.paidAt,
  );
  const periodStart = normalizeExpensePeriodStart(
    input.periodStart || input.paidAt || month,
  );
  const amount = Math.max(0, Number(input.amount) || 0);
  const expense: LocalOperatingExpense = {
    id: `opex_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    month,
    category: input.category.trim() || "Otro",
    description: input.description?.trim() || input.category.trim() || "Gasto",
    amount,
    paidAt: input.paidAt ? normalizeExpensePeriodStart(input.paidAt) : periodStart,
    isRecurring: frequency === "one_time" ? false : input.isRecurring !== false,
    frequency,
    periodStart,
    activeUntil: input.activeUntil
      ? normalizeExpensePeriodStart(input.activeUntil)
      : undefined,
  };

  if (amount <= 0) {
    throw new Error("El gasto debe ser mayor a 0");
  }

  store.operatingExpenses.push(expense);
  store.importedAt = new Date().toISOString();
  await writeLocalStore(store);
  return expense;
}

export async function deleteOperatingExpense(expenseId: string) {
  const store = await readLocalStore();
  const expense = store.operatingExpenses.find((entry) => entry.id === expenseId);

  if (!expense) {
    throw new Error("Gasto no encontrado");
  }

  store.operatingExpenses = store.operatingExpenses.filter(
    (entry) => entry.id !== expenseId,
  );
  store.importedAt = new Date().toISOString();
  await writeLocalStore(store);
  return expense;
}

export async function updateOperatingExpense(
  expenseId: string,
  input: {
    scope: "this_month" | "from_now";
    month: string;
    category: string;
    description?: string;
    amount: number;
    isRecurring?: boolean;
    frequency?: string;
    periodStart?: string;
    activeUntil?: string;
  },
) {
  const store = await readLocalStore();
  const expense = store.operatingExpenses.find((entry) => entry.id === expenseId);

  if (!expense) {
    throw new Error("Gasto no encontrado");
  }

  const month = normalizeExpenseMonth(input.month || input.periodStart);
  const amount = Math.max(0, Number(input.amount) || 0);
  if (amount <= 0) {
    throw new Error("El gasto debe ser mayor a 0");
  }

  const frequency = normalizeExpenseFrequency(input.frequency);
  const editedExpense: LocalOperatingExpense = {
    ...expense,
    month,
    category: input.category.trim() || "Otro",
    description: input.description?.trim() || input.category.trim() || "Gasto",
    amount,
    frequency,
    isRecurring: frequency === "one_time" ? false : input.isRecurring !== false,
    periodStart: normalizeExpensePeriodStart(input.periodStart || `${month}-01`),
    paidAt: normalizeExpensePeriodStart(input.periodStart || `${month}-01`),
    activeUntil: input.activeUntil
      ? normalizeExpensePeriodStart(input.activeUntil)
      : undefined,
  };

  const originalIndex = store.operatingExpenses.findIndex(
    (entry) => entry.id === expenseId,
  );
  const originalFrequency = normalizeExpenseFrequency(expense.frequency);
  const isOriginalRecurring =
    originalFrequency !== "one_time" && expense.isRecurring !== false;
  const originalStartMonth = normalizeExpenseMonth(
    expense.periodStart || expense.paidAt || expense.month,
  );
  const shouldReplaceOriginal =
    !isOriginalRecurring ||
    (input.scope === "from_now" && month <= originalStartMonth);

  if (shouldReplaceOriginal) {
    store.operatingExpenses[originalIndex] = editedExpense;
  } else if (input.scope === "from_now") {
    if (isOriginalRecurring) {
      const previous = previousMonthEnd(month);
      store.operatingExpenses[originalIndex] = {
        ...expense,
        activeUntil: previous,
      };
      store.operatingExpenses.push({
        ...editedExpense,
        id: `opex_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      });
    }
  } else {
    const nextMonth = addExpenseMonths(month, 1);
    store.operatingExpenses[originalIndex] = {
      ...expense,
      activeUntil: previousMonthEnd(month),
    };
    store.operatingExpenses.push({
      ...editedExpense,
      id: `opex_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      frequency: "one_time",
      isRecurring: false,
      activeUntil: undefined,
    });
    store.operatingExpenses.push({
      ...expense,
      id: `opex_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_next`,
      month: nextMonth,
      periodStart: normalizeExpensePeriodStart(`${nextMonth}-01`),
      paidAt: normalizeExpensePeriodStart(`${nextMonth}-01`),
      activeUntil: expense.activeUntil,
    });
  }

  store.importedAt = new Date().toISOString();
  await writeLocalStore(store);
  return {
    before: expense,
    after: editedExpense,
  };
}

const expenseBusinessTimeZone = "America/Mexico_City";

function normalizeExpenseMonth(value?: string) {
  if (!value) {
    return getExpenseBusinessDatePart(new Date(), "month");
  }

  if (/^\d{4}-\d{2}$/.test(value)) {
    return value;
  }

  const date = new Date(value);
  if (Number.isFinite(date.getTime())) {
    return getExpenseBusinessDatePart(date, "month");
  }

  throw new Error("Mes invalido");
}

function normalizeExpensePeriodStart(value?: string) {
  if (!value) {
    return `${getExpenseBusinessDatePart(new Date(), "date")}T00:00:00.000Z`;
  }

  if (/^\d{4}-\d{2}$/.test(value)) {
    return `${value}-01T00:00:00.000Z`;
  }

  const date = new Date(value);
  if (Number.isFinite(date.getTime())) {
    return date.toISOString();
  }

  throw new Error("Fecha invalida");
}

function previousMonthEnd(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 1, 0)).toISOString();
}

function addExpenseMonths(month: string, months: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + months, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getExpenseBusinessDatePart(date: Date, part: "date" | "month") {
  const fields = new Intl.DateTimeFormat("en-CA", {
    timeZone: expenseBusinessTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, field) => {
      if (field.type !== "literal") {
        acc[field.type] = field.value;
      }
      return acc;
    }, {});

  const month = `${fields.year}-${fields.month}`;
  return part === "month" ? month : `${month}-${fields.day}`;
}

export async function upsertMarketplaceAccount(
  account: LocalMarketplaceAccount,
) {
  const store = await readLocalStore();
  const index = store.marketplaceAccounts.findIndex(
    (entry) =>
      entry.channel === account.channel &&
      entry.externalAccountId === account.externalAccountId,
  );

  if (index >= 0) {
    store.marketplaceAccounts[index] = {
      ...store.marketplaceAccounts[index],
      ...account,
    };
  } else {
    store.marketplaceAccounts.push(account);
  }

  await writeLocalStore(store);
  return account;
}

export async function listMarketplaceAccounts() {
  const store = await readLocalStore();
  return store.marketplaceAccounts;
}

export async function getMarketplaceAccount(accountId: string) {
  const store = await readLocalStore();
  return (
    store.marketplaceAccounts.find((account) => account.id === accountId) ??
    null
  );
}

export async function createManualSaleOrder(input: {
  channel: LocalMarketplaceOrder["channel"];
  externalOrderId?: string;
  orderedAt: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerNote?: string;
  warehouseId: string;
  netReceivedAmount?: number;
  chargeAmount?: number;
  chargeType?: string;
  note?: string;
  lines: ManualSaleLineInput[];
}) {
  if (input.channel === "mercado_libre") {
    throw new Error("Usa sincronizacion Meli para ventas de Mercado Libre");
  }

  const store = await readLocalStore();
  const channel = input.channel || "manual";
  const warehouseId = input.warehouseId.trim() || "wh_main";
  const warehouse = store.warehouses.find((entry) => entry.id === warehouseId);

  if (!warehouse) {
    throw new Error("Bodega invalida");
  }

  const cleanLines = input.lines
    .map((line) => ({
      masterSku: line.masterSku.trim(),
      quantity: Number(line.quantity),
      unitPrice: Number(line.unitPrice),
    }))
    .filter((line) => line.masterSku && line.quantity > 0 && line.unitPrice >= 0);

  if (cleanLines.length === 0) {
    throw new Error("Agrega al menos una linea de venta");
  }

  const orderedAt = normalizeSaleDateTime(input.orderedAt);
  const externalOrderId =
    input.externalOrderId?.trim() ||
    `${channel.toUpperCase()}-${new Date(orderedAt).getTime().toString(36)}`;
  const duplicate = store.marketplaceOrders.some(
    (order) => order.externalOrderId === externalOrderId,
  );

  if (duplicate) {
    throw new Error(`Ya existe una venta con referencia ${externalOrderId}`);
  }

  const items = cleanLines.map((line) => {
    const product = store.products.find(
      (entry) => normalizeSkuKey(entry.masterSku) === normalizeSkuKey(line.masterSku),
    );

    if (!product || product.isActive === false) {
      throw new Error(`SKU maestro no existe o esta inactivo: ${line.masterSku}`);
    }

    return {
      externalSku: product.masterSku,
      title: product.name,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      masterSku: product.masterSku,
      consumedQuantity: line.quantity,
      warehouseId,
      logisticType: channel,
    };
  });
  const grossAmount = roundMoney(
    items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
  );
  const chargeAmount = Number(input.chargeAmount ?? 0);
  const charges =
    Number.isFinite(chargeAmount) && chargeAmount > 0
      ? [
          {
            type: input.chargeType?.trim() || "other",
            amount: roundMoney(chargeAmount),
            source: `${channel}:manual_charge`,
          },
        ]
      : [];
  const totalCharges = charges.reduce((sum, charge) => sum + charge.amount, 0);
  const netReceivedAmount = Number.isFinite(input.netReceivedAmount)
    ? roundMoney(Number(input.netReceivedAmount))
    : roundMoney(grossAmount - totalCharges);
  const labelParts = [
    humanChannelName(channel),
    input.customerName?.trim() ? `Cliente: ${input.customerName.trim()}` : "",
    input.note?.trim() ?? "",
  ].filter(Boolean);
  const order: LocalMarketplaceOrder = {
    id: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    channel,
    marketplaceAccountId: `manual:${channel}`,
    externalOrderId,
    status: "completed",
    orderedAt,
    grossAmount,
    netReceivedAmount,
    billingStatus: "confirmed",
    billingLastTriedAt: new Date().toISOString(),
    billingError: null,
    currency: "MXN",
    raw: {
      source: "manual_sale",
      channel,
      customerName: input.customerName?.trim() || null,
      customerPhone: input.customerPhone?.trim() || null,
      customerEmail: input.customerEmail?.trim() || null,
      customerNote: input.customerNote?.trim() || null,
      note: input.note?.trim() || null,
      warehouseId,
    },
    items,
    charges,
  };

  store.marketplaceOrders.push(order);
  applyOrderInventoryEffects(store, order);
  store.inventoryMovements.push(
    ...items.map((item) => ({
      id: `mov_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      date: orderedAt,
      type: "sale" as const,
      masterSku: item.masterSku ?? item.externalSku,
      warehouseId,
      quantity: -(item.consumedQuantity ?? 0),
      reference: externalOrderId,
      note: labelParts.join(" | "),
    })),
  );

  await writeLocalStore(store);
  return order;
}

export async function saveMarketplaceOrders(
  accountId: string,
  orders: LocalMarketplaceOrder[],
) {
  const store = await readLocalStore();
  const existingByKey = new Map(
    store.marketplaceOrders.map((order, index) => [
      `${order.channel}:${order.externalOrderId}`,
      index,
    ]),
  );

  for (const order of orders) {
    const key = `${order.channel}:${order.externalOrderId}`;
    const existingIndex = existingByKey.get(key);

    if (existingIndex === undefined) {
      store.marketplaceOrders.push(order);
      applyOrderInventoryEffects(store, order);
    } else {
      restoreOrderInventoryEffects(store, store.marketplaceOrders[existingIndex]);
      store.marketplaceOrders[existingIndex] = order;
      applyOrderInventoryEffects(store, order);
    }
  }

  const account = store.marketplaceAccounts.find((entry) => entry.id === accountId);
  if (account) {
    account.lastSyncAt = new Date().toISOString();
  }

  await writeLocalStore(store);
  const organization = await resolveOrganization();
  await syncMarketplaceOrderTables(organization.id, store, orders);
  return orders;
}

function recalculateMarketplaceOrderInventory(store: LocalStore) {
  restoreMarketplaceOrderInventory(store);
  applyMarketplaceOrderInventory(store);
}

function restoreMarketplaceOrderInventory(store: LocalStore) {
  for (const order of store.marketplaceOrders) {
    restoreOrderInventoryEffects(store, order);
  }
}

function applyMarketplaceOrderInventory(store: LocalStore) {
  for (const order of store.marketplaceOrders) {
    applyOrderInventoryEffects(store, order);
  }
}

function applyMarketplaceOrderInventoryFromCurrentBalances(store: LocalStore) {
  for (const order of store.marketplaceOrders) {
    clearOrderInventoryEffects(order);
    applyOrderInventoryEffects(store, order);
  }
}

function getOrderItemInventoryComponents(item: LocalMarketplaceOrder["items"][number]) {
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

function restoreOrderInventoryEffects(
  store: LocalStore,
  order: LocalMarketplaceOrder,
) {
  const applications = order.inventoryApplications;

  if (applications) {
    for (const application of applications) {
      const balance = getOrCreateBalance(
        store,
        application.masterSku,
        application.warehouseId,
      );
      balance.physicalQuantity += application.quantity;
      syncProductTotalsFromBalances(store, application.masterSku);
    }
    restoreFullCostAllocations(store, order);
    clearOrderInventoryEffects(order);
    return;
  }

  if (order.inventoryApplied === false || isCancelledOrder(order.status)) {
    clearOrderInventoryEffects(order);
    return;
  }

  for (const item of order.items) {
    for (const component of getOrderItemInventoryComponents(item)) {
      const balance = getOrCreateBalance(store, component.masterSku, item.warehouseId);
      balance.physicalQuantity += component.quantity;
      syncProductTotalsFromBalances(store, component.masterSku);
    }
  }

  restoreFullCostAllocations(store, order);
  clearOrderInventoryEffects(order);
}

function applyOrderInventoryEffects(
  store: LocalStore,
  order: LocalMarketplaceOrder,
) {
  clearOrderInventoryEffects(order);

  if (isCancelledOrder(order.status) || !shouldApplyOrderToInventory(store, order)) {
    order.inventoryApplied = false;
    order.inventoryApplications = [];
    return;
  }

  const applications: NonNullable<LocalMarketplaceOrder["inventoryApplications"]> = [];

  for (const item of order.items) {
    for (const component of getOrderItemInventoryComponents(item)) {
      const balance = getOrCreateBalance(store, component.masterSku, item.warehouseId);
      balance.physicalQuantity -= component.quantity;
      syncProductTotalsFromBalances(store, component.masterSku);
      applications.push({
        masterSku: component.masterSku,
        warehouseId: item.warehouseId,
        quantity: component.quantity,
      });

      if (item.warehouseId === "wh_full") {
        allocateFullCostsForComponent(store, order, component);
      }
    }
  }

  order.inventoryApplications = applications;
  order.inventoryApplied = applications.length > 0;
}

function clearOrderInventoryEffects(order: LocalMarketplaceOrder) {
  order.inventoryApplications = [];
  order.inventoryApplied = false;
  order.fullCostAllocations = [];
  removeFullFifoCharges(order);
}

function shouldApplyOrderToInventory(
  store: LocalStore,
  order: LocalMarketplaceOrder,
) {
  if (order.channel !== "mercado_libre") {
    return true;
  }

  const baselineTime = getInventoryBaselineTime(store);
  if (baselineTime <= 0) {
    return true;
  }

  const orderedAt = new Date(order.orderedAt).getTime();
  if (!Number.isFinite(orderedAt)) {
    return true;
  }

  return orderedAt >= baselineTime;
}

function getInventoryBaselineTime(store: LocalStore) {
  const baseline = store.inventoryBaselineAt;
  if (!baseline) {
    return 0;
  }

  const time = new Date(baseline).getTime();
  return Number.isFinite(time) ? time : 0;
}

function allocateFullCostsForComponent(
  store: LocalStore,
  order: LocalMarketplaceOrder,
  component: { masterSku: string; quantity: number },
) {
  if (!component.masterSku || component.quantity <= 0) {
    return;
  }

  let inboundTotal = 0;
  let storageTotal = 0;
  let remaining = component.quantity;
  const orderedAt = new Date(order.orderedAt);
  const layers = store.fullInventoryLayers
    .filter(
      (layer) =>
        layer.masterSku === component.masterSku &&
        layer.remainingQuantity > 0 &&
        new Date(layer.dateReceived).getTime() <= orderedAt.getTime(),
    )
    .sort(
      (a, b) =>
        new Date(a.dateReceived).getTime() - new Date(b.dateReceived).getTime(),
    );

  for (const layer of layers) {
    if (remaining <= 0) {
      break;
    }

    const quantity = Math.min(remaining, layer.remainingQuantity);
    const storageDays = Math.max(
      0,
      Math.ceil(
        (orderedAt.getTime() - new Date(layer.dateReceived).getTime()) /
          (24 * 60 * 60 * 1000),
      ),
    );
    const inboundFreightCost = roundMoney(
      quantity * layer.inboundFreightCostPerUnit,
    );
    const storageCost = roundMoney(
      quantity * storageDays * layer.storageCostPerUnitPerDay,
    );

    layer.remainingQuantity -= quantity;
    remaining -= quantity;
    inboundTotal += inboundFreightCost;
    storageTotal += storageCost;
    order.fullCostAllocations ??= [];
    order.fullCostAllocations.push({
      layerId: layer.id,
      masterSku: component.masterSku,
      quantity,
      inboundFreightCost,
      storageCost,
      storageDays,
    });
  }

  if (inboundTotal > 0) {
    order.charges.push({
      type: "fulfillment",
      amount: roundMoney(inboundTotal),
      source: "full_fifo:inbound_freight",
    });
  }

  if (storageTotal > 0) {
    order.charges.push({
      type: "storage",
      amount: roundMoney(storageTotal),
      source: "full_fifo:storage",
    });
  }
}

function restoreFullCostAllocations(
  store: LocalStore,
  order: LocalMarketplaceOrder,
) {
  for (const allocation of order.fullCostAllocations ?? []) {
    const layer = store.fullInventoryLayers.find(
      (entry) => entry.id === allocation.layerId,
    );

    if (layer) {
      layer.remainingQuantity += allocation.quantity;
    }
  }

  order.fullCostAllocations = [];
}

function removeFullFifoCharges(order: LocalMarketplaceOrder) {
  order.charges = order.charges.filter(
    (charge) => !charge.source.startsWith("full_fifo:"),
  );
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function normalizeSaleDateTime(value: string) {
  if (!value) {
    return new Date().toISOString();
  }

  const normalized = value.includes("T") ? value : `${value}T00:00`;
  const date = new Date(normalized);

  if (!Number.isFinite(date.getTime())) {
    throw new Error("Fecha de venta invalida");
  }

  return date.toISOString();
}

function humanChannelName(channel: LocalMarketplaceOrder["channel"]) {
  const labels: Record<LocalMarketplaceOrder["channel"], string> = {
    mercado_libre: "Mercado Libre",
    manual: "Mostrador",
    tiktok: "TikTok",
    whatsapp: "WhatsApp",
    external: "Canal externo",
  };

  return labels[channel] ?? channel;
}

function remapMarketplaceOrder(
  order: LocalMarketplaceOrder,
  onlineSkus: LocalStore["onlineSkus"],
): LocalMarketplaceOrder {
  const mappings = new Map(
    onlineSkus.map((sku) => [normalizeSkuKey(sku.onlineSku), sku]),
  );

  return {
    ...order,
    items: order.items.map((item) => {
      const mapping = mappings.get(normalizeSkuKey(item.externalSku));
      const firstComponent = mapping?.components[0] ?? null;

      return {
        ...item,
        masterSku: firstComponent?.masterSku ?? null,
        consumedQuantity: firstComponent
          ? item.quantity * firstComponent.quantityRequired
          : null,
      };
    }),
  };
}

function remapFullStockSync(
  store: LocalStore,
  onlineSkus: LocalStore["onlineSkus"],
) {
  if (!store.fullStockSync?.unmappedItems.length) {
    return;
  }

  const mappings = new Map(
    onlineSkus.map((sku) => [normalizeSkuKey(sku.onlineSku), sku]),
  );
  const remainingUnmapped: NonNullable<
    LocalStore["fullStockSync"]
  >["unmappedItems"] = [];
  let newlyMappedUnits = 0;

  for (const item of store.fullStockSync.unmappedItems) {
    const mapping = mappings.get(normalizeSkuKey(item.externalSku));
    const firstComponent = mapping?.components[0] ?? null;

    if (!firstComponent || firstComponent.quantityRequired <= 0) {
      remainingUnmapped.push(item);
      continue;
    }

    const consumedQuantity = item.availableQuantity * firstComponent.quantityRequired;
    const balance = getOrCreateBalance(store, firstComponent.masterSku, "wh_full");
    balance.physicalQuantity += consumedQuantity;
    newlyMappedUnits += consumedQuantity;
    syncProductTotalsFromBalances(store, firstComponent.masterSku);
  }

  store.fullStockSync.unmappedItems = remainingUnmapped;
  store.fullStockSync.mappedUnits += newlyMappedUnits;
}

function getOrCreateBalance(
  store: LocalStore,
  masterSku: string,
  warehouseId: string,
) {
  let balance = store.inventoryBalances.find(
    (entry) => entry.masterSku === masterSku && entry.warehouseId === warehouseId,
  );

  if (!balance) {
    balance = {
      masterSku,
      warehouseId,
      physicalQuantity: 0,
      reservedQuantity: 0,
      blockedQuantity: 0,
    };
    store.inventoryBalances.push(balance);
  }

  return balance;
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

function ensureProductExists(store: LocalStore, masterSku: string) {
  let product = store.products.find(
    (entry) => entry.masterSku.toLowerCase() === masterSku.toLowerCase(),
  );

  if (!product) {
    product = {
      id: buildUniqueProductId(store, masterSku),
      masterSku,
      name: masterSku,
      currentStock: 0,
      totalIngresado: 0,
      totalVendido: 0,
      targetInventoryDays: 90,
      averageUnitCost: 0,
      isActive: true,
    };
    store.products.push(product);
  }
  product.isActive = true;

  return product;
}

function syncProductTotalsFromBalances(store: LocalStore, masterSku: string) {
  const product = ensureProductExists(store, masterSku);
  product.currentStock = store.inventoryBalances
    .filter((balance) => balance.masterSku === masterSku)
    .reduce((sum, balance) => sum + balance.physicalQuantity, 0);
  product.totalIngresado = Math.max(product.totalIngresado, product.currentStock);
}

function syncAllProductTotalsFromBalances(store: LocalStore) {
  const masterSkus = new Set<string>();
  for (const product of store.products) {
    masterSkus.add(product.masterSku);
  }
  for (const balance of store.inventoryBalances) {
    masterSkus.add(balance.masterSku);
  }

  for (const masterSku of masterSkus) {
    syncProductTotalsFromBalances(store, masterSku);
  }
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

function replaceMasterSkuReferences(
  store: LocalStore,
  previousMasterSku: string,
  nextMasterSku: string,
) {
  const previousKey = previousMasterSku.toLowerCase();

  for (const balance of store.inventoryBalances) {
    if (balance.masterSku.toLowerCase() === previousKey) {
      balance.masterSku = nextMasterSku;
    }
  }

  for (const movement of store.inventoryMovements) {
    if (movement.masterSku.toLowerCase() === previousKey) {
      movement.masterSku = nextMasterSku;
    }
  }

  for (const sale of store.sales) {
    if (sale.masterSku.toLowerCase() === previousKey) {
      sale.masterSku = nextMasterSku;
    }
  }

  for (const sku of store.onlineSkus) {
    for (const component of sku.components) {
      if (component.masterSku.toLowerCase() === previousKey) {
        component.masterSku = nextMasterSku;
      }
    }
  }

  for (const order of store.marketplaceOrders) {
    for (const item of order.items) {
      if (item.masterSku?.toLowerCase() === previousKey) {
        item.masterSku = nextMasterSku;
      }
    }

    for (const allocation of order.fullCostAllocations ?? []) {
      if (allocation.masterSku.toLowerCase() === previousKey) {
        allocation.masterSku = nextMasterSku;
      }
    }
  }

  for (const layer of store.fullInventoryLayers) {
    if (layer.masterSku.toLowerCase() === previousKey) {
      layer.masterSku = nextMasterSku;
    }
  }

  for (const mapping of store.costSkuMappings) {
    if (mapping.masterSku?.toLowerCase() === previousKey) {
      mapping.masterSku = nextMasterSku;
    }

    if (mapping.masterSkus?.length) {
      mapping.masterSkus = mapping.masterSkus.map((masterSku) =>
        masterSku.toLowerCase() === previousKey ? nextMasterSku : masterSku,
      );
    }
  }
}

export async function addIntegrationEvent(
  event: Omit<LocalIntegrationEvent, "id" | "receivedAt" | "status"> &
    Partial<Pick<LocalIntegrationEvent, "status">>,
) {
  const store = await readLocalStore();
  const storedEvent: LocalIntegrationEvent = {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    receivedAt: new Date().toISOString(),
    status: event.status ?? "received",
    ...event,
  };

  store.integrationEvents.push(storedEvent);
  
  if (store.integrationEvents.length > 100) {
    store.integrationEvents = store.integrationEvents.slice(-100);
  }

  await writeLocalStore(store);
  return storedEvent;
}
