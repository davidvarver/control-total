import { prisma } from "./prisma";
import { readOrganizationStore, type LocalStore } from "./local-store";
import { updateMeliItemStock } from "../meli/client";
import { hasDatabaseUrl } from "./database-url";

const useDatabaseStore = hasDatabaseUrl();

type StockSyncOnlineSku = LocalStore["onlineSkus"][number];

/**
 * Calculates the sellable stock of a master product.
 * Returns the sum of physical stock across all warehouses marked as sellable,
 * excluding fulfillment warehouses (Full), as these are managed by Meli directly.
 */
export function getMasterProductSellableStock(store: LocalStore, masterSku: string): number {
  const sellableWarehouseIds = new Set(
    store.warehouses
      .filter((w) => w.isSellable && w.type !== "mercado_libre_full")
      .map((w) => w.id),
  );

  return store.inventoryBalances
    .filter((b) => b.masterSku === masterSku && sellableWarehouseIds.has(b.warehouseId))
    .reduce((sum, b) => sum + b.physicalQuantity, 0);
}

/**
 * Calculates the publishable stock for a given OnlineSku.
 * Takes safety buffers and bundle component requirements into account.
 */
export function calculatePublishableStock(
  store: LocalStore,
  onlineSku: StockSyncOnlineSku,
): number {
  if (!onlineSku.components || onlineSku.components.length === 0) {
    return 0;
  }

  let minComponentStock = Infinity;
  for (const component of onlineSku.components) {
    const sellableStock = getMasterProductSellableStock(store, component.masterSku);
    const possibleBundles = Math.floor(sellableStock / component.quantityRequired);
    if (possibleBundles < minComponentStock) {
      minComponentStock = possibleBundles;
    }
  }

  if (minComponentStock === Infinity) {
    return 0;
  }

  const safetyBuffer = onlineSku.safetyBufferUnits ?? 0;
  return Math.max(0, minComponentStock - safetyBuffer);
}

/**
 * Enqueues an OnlineSku for stock synchronization when one of its components undergoes a change.
 * Uses upsert with the unique pending constraint for automatic debouncing of rapid updates.
 */
export async function queueStockSync(store: LocalStore, masterSku: string) {
  // Find all OnlineSku entries that contain this masterSku as a component
  const affectedSkus = store.onlineSkus.filter((sku) =>
    sku.components.some((comp) => comp.masterSku === masterSku)
  );

  if (affectedSkus.length === 0) {
    return;
  }

  // Only sync for Mercado Libre channels
  const meliSkus = affectedSkus.filter((sku) => sku.channel === "mercado_libre");

  for (const sku of meliSkus) {
    const publishableStock = calculatePublishableStock(store, sku);

    if (useDatabaseStore) {
      try {
        await prisma.stockSyncQueue.upsert({
          where: {
            organizationId_onlineSku_channel: {
              organizationId: store.organization.id,
              onlineSku: sku.onlineSku,
              channel: "mercado_libre",
            }
          },
          create: {
            organizationId: store.organization.id,
            onlineSku: sku.onlineSku,
            channel: "mercado_libre",
            publishableStock,
            status: "pending"
          },
          update: {
            publishableStock,
            attempts: 0,
            lastAttemptAt: null,
            errorMessage: null,
            status: "pending",
          }
        });
      } catch (err) {
        console.error(`[Stock Sync Queue Error] Failed to queue ${sku.onlineSku}:`, err);
      }
    } else {
      console.log(`[Local Store Fallback] Queued OnlineSku ${sku.onlineSku} with publishable stock ${publishableStock}`);
    }
  }
}

/**
 * Processes a rate-limited batch of pending stock sync records from the database.
 * Matches listing credentials, makes Mercado Libre API updates, and manages retries and logs.
 */
export async function processStockSyncQueue(organizationId: string) {
  if (!useDatabaseStore) {
    return { processed: 0, msg: "Database store not enabled" };
  }

  // Fetch pending queue rows for this organization
  const pendingItems = await prisma.stockSyncQueue.findMany({
    where: {
      organizationId,
      status: "pending"
    },
    orderBy: { createdAt: "asc" },
    take: 10 // process in small batches to stay within rate limits and avoid timeout
  });

  if (pendingItems.length === 0) {
    return { processed: 0 };
  }

  // Load the current store to get access tokens and components mappings
  const store = await readOrganizationStore(organizationId);
  if (!store) {
    throw new Error(`Store not found for organization ${organizationId}`);
  }

  let processedCount = 0;

  for (const item of pendingItems) {
    // Find the OnlineSku configuration to find the matching marketplace account
    const skuConfig = store.onlineSkus.find((s) => s.onlineSku === item.onlineSku);
    const account = store.marketplaceAccounts.find(
      (acc) => acc.alias === skuConfig?.marketplaceAccount || acc.id === skuConfig?.marketplaceAccount
    );

    if (!account || !account.accessToken) {
      await prisma.stockSyncQueue.update({
        where: { id: item.id },
        data: {
          status: "failed",
          attempts: item.attempts + 1,
          lastAttemptAt: new Date(),
          errorMessage: "No connected marketplace account found for this SKU"
        }
      });
      continue;
    }

    // Determine the external listing ID (falls back to onlineSku if none exists)
    const externalItemId = skuConfig?.externalListingId || item.onlineSku;

    try {
      // Call remote Mercado Libre API
      await updateMeliItemStock(account.accessToken, externalItemId, item.publishableStock);

      // Mark as successfully synced
      await prisma.stockSyncQueue.update({
        where: { id: item.id },
        data: {
          status: "synced",
          attempts: item.attempts + 1,
          lastAttemptAt: new Date(),
          errorMessage: null
        }
      });
      processedCount++;
    } catch (err) {
      const isRateLimit =
        typeof err === "object" &&
        err !== null &&
        "status" in err &&
        err.status === 429;
      // Retries are allowed up to 3 times for ordinary errors, infinite retries for rate limit timeouts
      const nextStatus = item.attempts >= 3 && !isRateLimit ? "failed" : "pending";

      await prisma.stockSyncQueue.update({
        where: { id: item.id },
        data: {
          status: nextStatus,
          attempts: item.attempts + 1,
          lastAttemptAt: new Date(),
          errorMessage: err instanceof Error ? err.message : String(err)
        }
      });
    }
  }

  return { processed: processedCount };
}
