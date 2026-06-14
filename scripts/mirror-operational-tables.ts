import {
  Channel,
  InventoryMovementType,
  SaleChargeType,
  WarehouseType,
  type Prisma,
} from "@prisma/client";
import { normalizeSkuKey } from "../src/lib/domain/sku-match";
import { listOrganizationStores } from "../src/lib/server/local-store";
import { prisma } from "../src/lib/server/prisma";
import { encryptSecret } from "../src/lib/server/secret-crypto";

const BATCH_SIZE = 500;

async function main() {
  const stores = await listOrganizationStores();
  const results = [];

  for (const { organizationId, store } of stores) {
    await prisma.$transaction(
      async (tx) => {
        await tx.saleCharge.deleteMany({ where: { organizationId } });
        await tx.saleItemComponent.deleteMany({ where: { organizationId } });
        await tx.saleOrderItem.deleteMany({ where: { organizationId } });
        await tx.saleOrder.deleteMany({ where: { organizationId } });
        await tx.inventoryMovement.deleteMany({ where: { organizationId } });
        await tx.inventoryBalance.deleteMany({ where: { organizationId } });
        await tx.skuComponent.deleteMany({ where: { organizationId } });
        await tx.onlineSku.deleteMany({ where: { organizationId } });
        await tx.productCostSnapshot.deleteMany({ where: { organizationId } });
        await tx.marketplaceAccount.deleteMany({ where: { organizationId } });
        await tx.warehouse.deleteMany({ where: { organizationId } });
        await tx.masterProduct.deleteMany({ where: { organizationId } });

        await createManyInChunks(
          tx.warehouse,
          store.warehouses.map((warehouse) => ({
            id: warehouse.id,
            organizationId,
            name: warehouse.name,
            type: mapWarehouseType(warehouse.type),
            channel: mapOptionalChannel(warehouse.channel),
            isSellable: warehouse.isSellable,
            isExclusive: warehouse.isExclusive,
            isActive: true,
          })),
        );

        await createManyInChunks(
          tx.masterProduct,
          store.products.map((product) => ({
            id: product.id,
            organizationId,
            masterSku: product.masterSku,
            name: product.name,
            targetInventoryDays: product.targetInventoryDays,
            isActive: product.isActive ?? true,
          })),
        );

        const productIdBySku = new Map(
          store.products.map((product) => [
            normalizeSkuKey(product.masterSku),
            product.id,
          ]),
        );

        await createManyInChunks(
          tx.productCostSnapshot,
          store.products
            .filter((product) => Number(product.averageUnitCost ?? 0) > 0)
            .map((product) => ({
              organizationId,
              masterProductId: product.id,
              averageCost: product.averageUnitCost ?? 0,
            })),
        );

        await createManyInChunks(
          tx.marketplaceAccount,
          store.marketplaceAccounts.map((account) => ({
            id: account.id,
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
          })),
        );

        await createManyInChunks(
          tx.onlineSku,
          store.onlineSkus.map((sku) => ({
            id: sku.id,
            organizationId,
            onlineSku: sku.onlineSku,
            title: sku.title,
            channel: mapChannel(sku.channel),
            marketplaceAccountId: store.marketplaceAccounts.some(
              (account) => account.id === sku.marketplaceAccount,
            )
              ? sku.marketplaceAccount
              : null,
            externalListingId: sku.externalListingId ?? null,
            safetyBufferUnits: sku.safetyBufferUnits,
            isActive: true,
          })),
        );

        await createManyInChunks(
          tx.skuComponent,
          store.onlineSkus.flatMap((sku) =>
            sku.components.flatMap((component) => {
              const masterProductId = productIdBySku.get(
                normalizeSkuKey(component.masterSku),
              );
              return masterProductId
                ? [
                    {
                      organizationId,
                      onlineSkuId: sku.id,
                      masterProductId,
                      quantityRequired: component.quantityRequired,
                    },
                  ]
                : [];
            }),
          ),
        );

        const warehouseIds = new Set(store.warehouses.map((warehouse) => warehouse.id));
        await createManyInChunks(
          tx.inventoryBalance,
          store.inventoryBalances.flatMap((balance) => {
            const masterProductId = productIdBySku.get(normalizeSkuKey(balance.masterSku));
            return masterProductId && warehouseIds.has(balance.warehouseId)
              ? [
                  {
                    organizationId,
                    masterProductId,
                    warehouseId: balance.warehouseId,
                    physicalQuantity: balance.physicalQuantity,
                    reservedQuantity: balance.reservedQuantity,
                    blockedQuantity: balance.blockedQuantity,
                  },
                ]
              : [];
          }),
        );

        await createManyInChunks(
          tx.inventoryMovement,
          store.inventoryMovements.flatMap((movement) => {
            const masterProductId = productIdBySku.get(normalizeSkuKey(movement.masterSku));
            return masterProductId && warehouseIds.has(movement.warehouseId)
              ? [
                  {
                    id: movement.id,
                    organizationId,
                    masterProductId,
                    warehouseId: movement.warehouseId,
                    movementType: mapInventoryMovementType(
                      movement.type,
                      movement.quantity,
                    ),
                    quantity: movement.quantity,
                    referenceType: movement.type,
                    referenceId: movement.reference,
                    reason: movement.note ?? null,
                    notes: movement.note ?? null,
                    createdAt: new Date(movement.date),
                  },
                ]
              : [];
          }),
        );

        const accountIds = new Set(store.marketplaceAccounts.map((account) => account.id));
        const onlineSkuIdByKey = new Map(
          store.onlineSkus.map((sku) => [
            `${mapChannel(sku.channel)}:${normalizeSkuKey(sku.onlineSku)}`,
            sku.id,
          ]),
        );

        await createManyInChunks(
          tx.saleOrder,
          store.marketplaceOrders.map((order) => ({
            id: order.id,
            organizationId,
            marketplaceAccountId: accountIds.has(order.marketplaceAccountId)
              ? order.marketplaceAccountId
              : null,
            channel: mapChannel(order.channel),
            externalOrderId: order.externalOrderId,
            orderedAt: new Date(order.orderedAt),
            status: order.status,
            buyerReference: null,
            grossAmount: order.grossAmount,
            netReceivedAmount: order.netReceivedAmount,
            currency: order.currency,
          })),
        );

        const saleItems: Prisma.SaleOrderItemCreateManyInput[] = [];
        const saleComponents: Prisma.SaleItemComponentCreateManyInput[] = [];
        const saleCharges: Prisma.SaleChargeCreateManyInput[] = [];

        for (const order of store.marketplaceOrders) {
          const channel = mapChannel(order.channel);
          order.items.forEach((item, index) => {
            const saleOrderItemId = `${order.id}_item_${index}`;
            saleItems.push({
              id: saleOrderItemId,
              organizationId,
              saleOrderId: order.id,
              onlineSkuId:
                onlineSkuIdByKey.get(`${channel}:${normalizeSkuKey(item.externalSku)}`) ??
                null,
              externalSku: item.externalSku || item.masterSku || order.externalOrderId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              grossAmount: item.quantity * item.unitPrice,
            });

            if (item.masterSku && item.consumedQuantity !== null) {
              const masterProductId = productIdBySku.get(normalizeSkuKey(item.masterSku));
              const product = store.products.find(
                (entry) =>
                  normalizeSkuKey(entry.masterSku) === normalizeSkuKey(item.masterSku),
              );
              if (masterProductId) {
                const unitCost = product?.averageUnitCost ?? 0;
                saleComponents.push({
                  organizationId,
                  saleOrderItemId,
                  masterProductId,
                  quantityConsumed: item.consumedQuantity,
                  unitCostAtSale: unitCost,
                  totalCost: item.consumedQuantity * unitCost,
                });
              }
            }
          });

          saleCharges.push(
            ...order.charges.map((charge) => ({
              organizationId,
              saleOrderId: order.id,
              chargeType: mapSaleChargeType(charge.type),
              amount: charge.amount,
              source: charge.source,
              notes: charge.type,
            })),
          );
        }

        await createManyInChunks(tx.saleOrderItem, saleItems);
        await createManyInChunks(tx.saleItemComponent, saleComponents);
        await createManyInChunks(tx.saleCharge, saleCharges);
      },
      { maxWait: 20_000, timeout: 180_000 },
    );

    results.push({
      organizationId,
      products: store.products.length,
      onlineSkus: store.onlineSkus.length,
      accounts: store.marketplaceAccounts.length,
      orders: store.marketplaceOrders.length,
      inventoryBalances: store.inventoryBalances.length,
      inventoryMovements: store.inventoryMovements.length,
    });
  }

  console.log(JSON.stringify({ ok: true, organizations: results }, null, 2));
}

async function createManyInChunks<T>(
  delegate: { createMany: (args: { data: T[]; skipDuplicates?: boolean }) => Promise<unknown> },
  rows: T[],
) {
  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    const chunk = rows.slice(index, index + BATCH_SIZE);
    if (chunk.length > 0) {
      await delegate.createMany({ data: chunk, skipDuplicates: true });
    }
  }
}

function mapChannel(channel: string | null | undefined): Channel {
  if (channel === "mercado_libre" || channel === "amazon" || channel === "tiktok") {
    return channel as Channel;
  }
  return Channel.manual;
}

function mapOptionalChannel(channel: string | null | undefined): Channel | null {
  return channel ? mapChannel(channel) : null;
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

function mapInventoryMovementType(type: string, quantity: number): InventoryMovementType {
  if (type === "sale" || type === "adjustment") {
    return type as InventoryMovementType;
  }
  if (type === "return") {
    return InventoryMovementType.return;
  }
  if (type === "transfer") {
    return quantity >= 0
      ? InventoryMovementType.transfer_in
      : InventoryMovementType.transfer_out;
  }
  return InventoryMovementType.adjustment;
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
  if (
    normalized.includes("ads") ||
    normalized.includes("advertising") ||
    normalized.includes("publicidad")
  ) {
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

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
