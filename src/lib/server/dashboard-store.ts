import { cache } from "react";
import { type LocalStore } from "./local-store";
import { isCancelledOrder, needsCancelledBillingReview } from "./order-status";
import { buildProfitReport, readReportStore } from "./reports";
import { buildStockCommitments } from "./stock-commitments";
import { buildFinancialSnapshot } from "./financial-snapshot";
import { buildMvpStatus } from "./mvp-status";
import { hasDatabaseUrl } from "./database-url";
import { prisma } from "./prisma";

type ProfitReport = Awaited<ReturnType<typeof buildProfitReport>>;

type DashboardPageUser = {
  organizationId: string;
  organizationName: string;
};

type FastDashboardCoreRow = {
  importedAt: string | null;
  products: number | string | bigint | null;
  productsWithoutCost: number | string | bigint | null;
  negativeStock: number | string | bigint | null;
  lowStock: number | string | bigint | null;
  totalStock: number | string | null;
  inventoryValue: number | string | null;
  onlineSkus: number | string | bigint | null;
  incompleteSkuEquivalences: number | string | bigint | null;
  marketplaceAccounts: number | string | bigint | null;
  meliOrders: number | string | bigint | null;
  unmappedSkus: number | string | bigint | null;
  rareCharges: number | string | bigint | null;
  pendingCostImports: number | string | bigint | null;
  fullUnmappedItems: number | string | bigint | null;
  fullStock: number | string | null;
  dayOrders: number | string | bigint | null;
  dayGrossAmount: number | string | null;
  dayEstimatedReceived: number | string | null;
  dayProductCost: number | string | null;
  dayAdditionalCosts: number | string | null;
  dayPendingBilling: number | string | bigint | null;
  dayLossOrders: number | string | bigint | null;
  monthOrders: number | string | bigint | null;
  monthGrossAmount: number | string | null;
  monthEstimatedReceived: number | string | null;
  monthProductCost: number | string | null;
  monthAdditionalCosts: number | string | null;
  monthPendingBilling: number | string | bigint | null;
  monthLossOrders: number | string | bigint | null;
};

type FastTopProductRow = {
  masterSku: string | null;
  title: string | null;
  soldUnits: number | string | null;
  grossAmount: number | string | null;
};

type FastDashboardMetaRow = {
  importedAt: string | null;
  pendingCostImports: number | string | null;
  fullUnmappedItems: number | string | null;
  fullStock: number | string | null;
};

type FastUnmappedSkuRow = {
  externalSku: string | null;
  title: string | null;
};

type FastCountRow = {
  count: number | string | bigint | null;
};

export const buildDashboardPageData = cache(async function buildDashboardPageData(
  user: DashboardPageUser,
) {
  if (
    hasDatabaseUrl() &&
    user.organizationId &&
    user.organizationId !== "org_public" &&
    user.organizationId !== "platform"
  ) {
    try {
      return await buildRelationalDashboardPageData(user);
    } catch (error) {
      console.error("[Dashboard] Fast dashboard failed, using report fallback:", error);
    }
  }

  const dashboardReportOrderLimit = getDashboardFallbackOrderLimit();
  const store = await readReportStore(dashboardReportOrderLimit);
  const profitReport = await buildProfitReport({
    includeProductSummary: false,
    includeProductMonthlySummary: false,
    includeProductOptions: false,
    orderLimit: dashboardReportOrderLimit,
  });
  const [dashboard, status] = await Promise.all([
    buildStoreDashboard({ store, profitReport }),
    buildMvpStatus({ store }),
  ]);

  return { dashboard, status };
});

export const buildStoreDashboard = cache(async function buildStoreDashboard(input?: {
  store?: LocalStore;
  profitReport?: ProfitReport;
}) {
  const store = input?.store ?? await readReportStore();
  const profitReport = input?.profitReport ?? await buildProfitReport({
    includeProductSummary: false,
    includeProductMonthlySummary: false,
    includeProductOptions: false,
  });
  const currentDay = getCurrentBusinessDay();
  const currentMonth = getCurrentBusinessMonth();
  const currentMonthSummary =
    profitReport.monthlySummary.find((month) => month.month === currentMonth) ??
    {
      month: currentMonth,
      orders: 0,
      grossAmount: 0,
      estimatedReceived: 0,
      productCost: 0,
      additionalCosts: 0,
      fullBillingCharges: 0,
      contributionProfit: 0,
      operatingExpenses: 0,
      finalNetProfit: 0,
      contributionMargin: 0,
      finalMargin: 0,
    };
  const financialSnapshot = await buildFinancialSnapshot(store.organization.id);
  const products = store.products.filter((product) => product.isActive !== false);
  const productBySku = new Map(
    products.map((product) => [product.masterSku, product]),
  );
  const activeProductSkus = new Set(
    products.map((product) => product.masterSku.toLowerCase()),
  );
  const onlineSkus = store.onlineSkus;
  const warehouses = store.warehouses;
  const orders = store.marketplaceOrders;
  const meliOrders = orders.filter((order) => order.channel === "mercado_libre");
  const activeMeliOrders = meliOrders.filter(
    (order) => !isCancelledOrder(order.status),
  );
  const archivedUnmappedIds = new Set(
    (store.archivedUnmappedSkus ?? []).map((item) => item.id),
  );
  const cancelledOrdersForReview = meliOrders.filter(needsCancelledBillingReview);
  const totalStock = products.reduce(
    (sum, product) => sum + product.currentStock,
    0,
  );
  const committedStock = buildStockCommitments(activeMeliOrders).reduce(
    (sum, commitment) => sum + commitment.quantity,
    0,
  );
  const inventoryValue = store.inventoryBalances.reduce((sum, balance) => {
    if (!activeProductSkus.has(balance.masterSku.toLowerCase())) {
      return sum;
    }
    const product = productBySku.get(balance.masterSku);
    return sum + balance.physicalQuantity * (product?.averageUnitCost ?? 0);
  }, 0);
  const negativeStock = products.filter((product) => product.currentStock < 0);
  const lowStock = products
    .filter((product) => product.currentStock >= 0 && product.currentStock <= 10)
    .slice(0, 20);
  const grossMeliSales =
    financialSnapshot?.currentMonth.grossAmount ?? profitReport.totals.grossAmount;
  const receivedConfirmed =
    financialSnapshot?.currentMonth.estimatedReceived ??
    profitReport.totals.estimatedReceived;
  const physicalQuantityByWarehouseId = new Map<string, number>();
  for (const balance of store.inventoryBalances) {
    if (!activeProductSkus.has(balance.masterSku.toLowerCase())) {
      continue;
    }

    physicalQuantityByWarehouseId.set(
      balance.warehouseId,
      (physicalQuantityByWarehouseId.get(balance.warehouseId) ?? 0) +
        balance.physicalQuantity,
    );
  }
  const stockByWarehouse = warehouses.map((warehouse) => ({
    ...warehouse,
    physicalQuantity: physicalQuantityByWarehouseId.get(warehouse.id) ?? 0,
  }));
  const meliCharges =
    financialSnapshot?.currentMonth.additionalCosts ??
    profitReport.totals.additionalCosts;
  const unmappedItems = activeMeliOrders.flatMap((order) =>
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
        orderId: order.externalOrderId,
        externalSku: item.externalSku,
        title: item.title,
      })),
  );
  const productsWithoutCost = products.filter(
    (product) => !product.averageUnitCost || product.averageUnitCost <= 0,
  );
  const incompleteOrders = activeMeliOrders.filter(
    (order) =>
      order.netReceivedAmount === null ||
      order.items.some((item) => !item.masterSku) ||
      order.items.some((item) => {
        if (!item.masterSku) {
          return false;
        }
        const product = productBySku.get(item.masterSku);
        return !product?.averageUnitCost || product.averageUnitCost <= 0;
      }),
  );
  const lossOrders = profitReport.settledOrders
    .filter(
      (order) =>
        !order.isCancelled &&
        !order.needsCancelledBillingReview &&
        order.netProfit < -0.004,
    )
    .sort((a, b) => a.netProfit - b.netProfit);
  const currentMonthLossOrders = lossOrders.filter(
    (order) => getBusinessMonth(order.orderedAt) === currentMonth,
  );
  const currentDaySettledOrders = profitReport.settledOrders.filter(
    (order) =>
      !order.isCancelled &&
      !order.needsCancelledBillingReview &&
      getBusinessDay(order.orderedAt) === currentDay,
  );
  const currentDayGrossMeliSales =
    financialSnapshot?.currentDay.grossAmount ??
    currentDaySettledOrders.reduce((sum, order) => sum + order.grossAmount, 0);
  const currentDayReceivedConfirmed =
    financialSnapshot?.currentDay.estimatedReceived ??
    currentDaySettledOrders.reduce((sum, order) => sum + order.estimatedReceived, 0);
  const currentDayProductCost =
    financialSnapshot?.currentDay.productCost ??
    currentDaySettledOrders.reduce((sum, order) => sum + order.productCost, 0);
  const currentDayNetProfit =
    financialSnapshot?.currentDay.netProfit ??
    currentDaySettledOrders.reduce((sum, order) => sum + order.netProfit, 0);
  const currentDayLossOrders = currentDaySettledOrders
    .filter((order) => order.netProfit < -0.004)
    .sort((a, b) => a.netProfit - b.netProfit);
  const dismissedRareCharges = new Set(
    (store.dismissedRareChargeAlerts ?? []).map((alert) => alert.id),
  );
  const dismissedFullAuditAlerts = new Set(
    (store.dismissedFullAuditAlerts ?? []).map((alert) => alert.id),
  );
  const rareChargeAlerts = profitReport.settledOrders
    .flatMap((order) =>
      order.charges
        .filter((charge) => charge.type === "fulfillment" && charge.amount > 0.01)
        .map((charge) => {
          const id = buildRareChargeAlertId(order.externalOrderId, charge);
          const firstItem = order.items[0];

          return {
            id,
            externalOrderId: order.externalOrderId,
            orderedAt: order.orderedAt,
            title: firstItem?.title ?? "Venta Meli",
            externalSku: firstItem?.externalSku ?? "",
            grossAmount: order.grossAmount,
            netReceivedAmount: order.netReceivedAmount,
            netProfit: order.netProfit,
            amount: charge.amount,
            source: charge.source,
          };
        }),
    )
    .filter((alert) => !dismissedRareCharges.has(alert.id))
    .sort((a, b) => b.amount - a.amount);
  const fullAuditAlerts = buildFullAuditAlerts(store)
    .filter((alert) => !dismissedFullAuditAlerts.has(alert.id))
    .sort((a, b) => {
      const priority = Number(b.missingUnits > 0 || b.notAvailableUnits > 0) -
        Number(a.missingUnits > 0 || a.notAvailableUnits > 0);
      return priority || b.impactUnits - a.impactUnits;
    });
  const netProfit =
    financialSnapshot?.currentMonth.netProfit ?? profitReport.totals.finalNetProfit;
  const topProducts = buildTopProducts(activeMeliOrders);
  const topProductsByMasterSku = new Map(
    topProducts.map((entry) => [entry.masterSku, entry]),
  );
  const todayTopProducts = buildTopProducts(
    activeMeliOrders.filter((order) => getBusinessDay(order.orderedAt) === currentDay),
  );
  const stuckProducts = products
    .map((product) => {
      const soldUnits = topProductsByMasterSku.get(product.masterSku)?.soldUnits ?? 0;
      return {
        masterSku: product.masterSku,
        name: product.name,
        currentStock: product.currentStock,
        soldUnits,
        inventoryValue: product.currentStock * (product.averageUnitCost ?? 0),
      };
    })
    .filter((product) => product.currentStock > 0 && product.soldUnits === 0)
    .sort((a, b) => b.inventoryValue - a.inventoryValue)
    .slice(0, 10);

  return {
    organization: store.organization,
    importedAt: store.importedAt,
    currentDay: {
      day: currentDay,
      label: formatReportDayLabel(currentDay),
      orders: currentDaySettledOrders.length,
      grossMeliSales: currentDayGrossMeliSales,
      receivedConfirmed: currentDayReceivedConfirmed,
      productCost: currentDayProductCost,
      netProfit: currentDayNetProfit,
      marginPercent: calculateMarginPercent(
        currentDayNetProfit,
        currentDayGrossMeliSales,
      ),
      roiPercent: calculateMarginPercent(
        currentDayNetProfit,
        currentDayProductCost,
      ),
      lossOrders:
        financialSnapshot?.currentDay.lossOrders ?? currentDayLossOrders.length,
      pendingBilling:
        financialSnapshot?.currentDay.pendingBilling ??
        profitReport.pendingBillingOrders.filter(
          (order) => getBusinessDay(order.orderedAt) === currentDay,
        ).length,
    },
    currentMonth: {
      month: currentMonth,
      label: formatReportMonthLabel(currentMonth),
      grossMeliSales:
        financialSnapshot?.currentMonth.grossAmount ??
        currentMonthSummary.grossAmount,
      receivedConfirmed:
        financialSnapshot?.currentMonth.estimatedReceived ??
        currentMonthSummary.estimatedReceived,
      netProfit:
        financialSnapshot?.currentMonth.netProfit ??
        currentMonthSummary.finalNetProfit,
      marginPercent:
        financialSnapshot?.currentMonth.grossAmount
          ? calculateMarginPercent(
              financialSnapshot.currentMonth.netProfit,
              financialSnapshot.currentMonth.grossAmount,
            )
          : currentMonthSummary.finalMargin,
      lossOrders:
        financialSnapshot?.currentMonth.lossOrders ?? currentMonthLossOrders.length,
      pendingBilling:
        financialSnapshot?.currentMonth.pendingBilling ??
        profitReport.pendingBillingOrders.filter(
          (order) => getBusinessMonth(order.orderedAt) === currentMonth,
        ).length,
    },
    kpis: {
      products: products.length,
      onlineSkus: onlineSkus.length,
      warehouses: warehouses.length,
      totalStock,
      committedStock,
      estimatedPhysicalStock: totalStock + committedStock,
      inventoryValue,
      negativeStock: negativeStock.length,
      lowStock: lowStock.length,
      meliAccounts: store.marketplaceAccounts.length,
      meliOrders: meliOrders.length,
      grossMeliSales,
      receivedConfirmed,
      meliCharges,
      netProfit,
      marginPercent: grossMeliSales > 0 ? (netProfit / grossMeliSales) * 100 : 0,
      pendingBilling:
        financialSnapshot?.currentMonth.pendingBilling ??
        profitReport.totals.pendingBillingOrders,
      cancelledOrdersForReview: cancelledOrdersForReview.length,
      lossOrders: financialSnapshot?.currentMonth.lossOrders ?? lossOrders.length,
      rareCharges: rareChargeAlerts.length,
      fullAuditAlerts: fullAuditAlerts.length,
      unmappedItems: unmappedItems.length,
      productsWithoutCost: productsWithoutCost.length,
      pendingCostImports: store.pendingCostImports.length,
      incompleteOrders: incompleteOrders.length,
      fullUnmappedItems: store.fullStockSync?.unmappedItems.length ?? 0,
      fullStock: store.fullStockSync?.mappedUnits ?? 0,
    },
    products: products
      .slice()
      .sort((a, b) => a.masterSku.localeCompare(b.masterSku))
      .slice(0, 25),
    onlineSkus: onlineSkus.slice(0, 20),
    warehouses: stockByWarehouse,
    negativeStock,
    lowStock,
    unmappedItems: unmappedItems.slice(0, 20),
    topProducts: topProducts.slice(0, 10),
    todayTopProducts: todayTopProducts.slice(0, 10),
    stuckProducts,
    lossOrders: lossOrders.slice(0, 10),
    rareChargeAlerts: rareChargeAlerts.slice(0, 20),
    fullAuditAlerts: fullAuditAlerts.slice(0, 20),
    currentDayLossOrders: currentDayLossOrders.slice(0, 10),
    currentMonthLossOrders: currentMonthLossOrders.slice(0, 10),
    fullAuditAccountId: store.fullStockSync?.accountId ?? store.marketplaceAccounts[0]?.id ?? "",
    fullAuditedAt: store.fullStockSync?.auditedAt,
    cancelledOrdersForReview: cancelledOrdersForReview
      .slice()
      .sort(
        (a, b) =>
          new Date(b.orderedAt).getTime() - new Date(a.orderedAt).getTime(),
      )
      .slice(0, 10),
    recentOrders: meliOrders
      .slice()
      .sort(
        (a, b) =>
          new Date(b.orderedAt).getTime() - new Date(a.orderedAt).getTime(),
      )
      .slice(0, 10),
  };
});

async function buildRelationalDashboardPageData(user: DashboardPageUser) {
  try {
    return await buildCompactRelationalDashboardPageData(user);
  } catch (error) {
    console.error("[Dashboard] Compact dashboard failed, using expanded fallback:", error);
    return buildExpandedRelationalDashboardPageData(user);
  }
}

async function buildCompactRelationalDashboardPageData(user: DashboardPageUser) {
  const currentDay = getCurrentBusinessDay();
  const currentMonth = getCurrentBusinessMonth();
  const dayRange = getBusinessDayRange(currentDay);
  const monthRange = getBusinessMonthRange(currentMonth);
  const [coreRows, topProductRows] = await Promise.all([
    prisma.$queryRaw<FastDashboardCoreRow[]>`
      WITH product_costs AS (
        SELECT
          mp.id,
          COALESCE(
            (
              SELECT pcs."averageCost"
              FROM "ProductCostSnapshot" pcs
              WHERE pcs."masterProductId" = mp.id
              ORDER BY pcs."calculatedAt" DESC
              LIMIT 1
            ),
            0
          ) AS average_cost,
          COALESCE(
            (
              SELECT SUM(ib."physicalQuantity")
              FROM "InventoryBalance" ib
              WHERE ib."masterProductId" = mp.id
            ),
            0
          ) AS current_stock
        FROM "MasterProduct" mp
        WHERE mp."organizationId" = ${user.organizationId}
          AND mp."isActive" = true
      ),
      product_metrics AS (
        SELECT
          COUNT(*)::bigint AS products,
          COUNT(*) FILTER (WHERE average_cost <= 0)::bigint AS products_without_cost,
          COUNT(*) FILTER (WHERE current_stock < 0)::bigint AS negative_stock,
          COUNT(*) FILTER (WHERE current_stock >= 0 AND current_stock <= 10)::bigint AS low_stock,
          COALESCE(SUM(current_stock), 0)::numeric AS total_stock,
          COALESCE(SUM(current_stock * average_cost), 0)::numeric AS inventory_value
        FROM product_costs
      ),
      online_component_counts AS (
        SELECT
          os.id,
          COUNT(sc.id)::bigint AS component_count,
          COUNT(*) FILTER (
            WHERE sc.id IS NULL OR sc."masterProductId" IS NULL OR sc."quantityRequired" <= 0
          )::bigint AS bad_component_count
        FROM "OnlineSku" os
        LEFT JOIN "SkuComponent" sc ON sc."onlineSkuId" = os.id
        WHERE os."organizationId" = ${user.organizationId}
          AND os."isActive" = true
        GROUP BY os.id
      ),
      online_metrics AS (
        SELECT
          COUNT(*)::bigint AS online_skus,
          COUNT(*) FILTER (
            WHERE component_count = 0 OR bad_component_count > 0
          )::bigint AS incomplete_sku_equivalences
        FROM online_component_counts
      ),
      account_metrics AS (
        SELECT COUNT(*)::bigint AS marketplace_accounts
        FROM "MarketplaceAccount"
        WHERE "organizationId" = ${user.organizationId}
          AND "isActive" = true
      ),
      order_metrics AS (
        SELECT COUNT(*)::bigint AS meli_orders
        FROM "SaleOrder"
        WHERE "organizationId" = ${user.organizationId}
          AND channel = 'mercado_libre'
      ),
      recent_active_orders AS (
        SELECT id
        FROM "SaleOrder"
        WHERE "organizationId" = ${user.organizationId}
          AND channel = 'mercado_libre'
          AND LOWER(status) NOT LIKE '%cancel%'
        ORDER BY "orderedAt" DESC
        LIMIT 1500
      ),
      unmapped_metrics AS (
        SELECT COUNT(DISTINCT LOWER(soi."externalSku"))::bigint AS unmapped_skus
        FROM "SaleOrderItem" soi
        JOIN recent_active_orders ro ON ro.id = soi."saleOrderId"
        LEFT JOIN "SaleItemComponent" sic ON sic."saleOrderItemId" = soi.id
        LEFT JOIN "SkuComponent" mapped_component ON mapped_component."onlineSkuId" = soi."onlineSkuId"
        WHERE sic.id IS NULL
          AND mapped_component.id IS NULL
      ),
      rare_metrics AS (
        SELECT COUNT(DISTINCT sc."saleOrderId")::bigint AS rare_charges
        FROM "SaleCharge" sc
        JOIN "SaleOrder" so ON so.id = sc."saleOrderId"
        WHERE sc."organizationId" = ${user.organizationId}
          AND sc."chargeType" = 'fulfillment'
          AND sc.amount > 0.01
          AND LOWER(so.status) NOT LIKE '%cancel%'
      ),
      month_orders AS (
        SELECT
          o.id,
          o."orderedAt",
          o."grossAmount",
          o."netReceivedAmount"
        FROM "SaleOrder" o
        WHERE o."organizationId" = ${user.organizationId}
          AND o.channel = 'mercado_libre'
          AND o."orderedAt" >= ${monthRange.from}
          AND o."orderedAt" < ${monthRange.to}
          AND LOWER(o.status) NOT LIKE '%cancel%'
      ),
      item_costs AS (
        SELECT
          soi."saleOrderId",
          SUM(sic."totalCost") AS product_cost
        FROM "SaleOrderItem" soi
        JOIN "SaleItemComponent" sic ON sic."saleOrderItemId" = soi.id
        JOIN month_orders mo ON mo.id = soi."saleOrderId"
        WHERE soi."organizationId" = ${user.organizationId}
        GROUP BY soi."saleOrderId"
      ),
      fifo_costs AS (
        SELECT
          sc."saleOrderId",
          SUM(sc.amount) AS additional_costs
        FROM "SaleCharge" sc
        JOIN month_orders mo ON mo.id = sc."saleOrderId"
        WHERE sc."organizationId" = ${user.organizationId}
          AND sc.source LIKE 'full_fifo:%'
        GROUP BY sc."saleOrderId"
      ),
      order_costs AS (
        SELECT
          mo.*,
          COALESCE(item_costs.product_cost, 0) AS product_cost,
          COALESCE(fifo_costs.additional_costs, 0) AS additional_costs
        FROM month_orders mo
        LEFT JOIN item_costs ON item_costs."saleOrderId" = mo.id
        LEFT JOIN fifo_costs ON fifo_costs."saleOrderId" = mo.id
      ),
      financial_metrics AS (
        SELECT
          COUNT(*) FILTER (
            WHERE "orderedAt" >= ${dayRange.from} AND "orderedAt" < ${dayRange.to}
          )::bigint AS day_orders,
          COALESCE(SUM("grossAmount") FILTER (
            WHERE "orderedAt" >= ${dayRange.from} AND "orderedAt" < ${dayRange.to}
          ), 0)::numeric AS day_gross_amount,
          COALESCE(SUM(COALESCE("netReceivedAmount", 0)) FILTER (
            WHERE "orderedAt" >= ${dayRange.from} AND "orderedAt" < ${dayRange.to}
          ), 0)::numeric AS day_estimated_received,
          COALESCE(SUM(product_cost) FILTER (
            WHERE "orderedAt" >= ${dayRange.from} AND "orderedAt" < ${dayRange.to}
          ), 0)::numeric AS day_product_cost,
          COALESCE(SUM(additional_costs) FILTER (
            WHERE "orderedAt" >= ${dayRange.from} AND "orderedAt" < ${dayRange.to}
          ), 0)::numeric AS day_additional_costs,
          COUNT(*) FILTER (
            WHERE "orderedAt" >= ${dayRange.from}
              AND "orderedAt" < ${dayRange.to}
              AND "netReceivedAmount" IS NULL
          )::bigint AS day_pending_billing,
          COUNT(*) FILTER (
            WHERE "orderedAt" >= ${dayRange.from}
              AND "orderedAt" < ${dayRange.to}
              AND "netReceivedAmount" IS NOT NULL
              AND COALESCE("netReceivedAmount", 0) - product_cost - additional_costs < 0
          )::bigint AS day_loss_orders,
          COUNT(*)::bigint AS month_orders,
          COALESCE(SUM("grossAmount"), 0)::numeric AS month_gross_amount,
          COALESCE(SUM(COALESCE("netReceivedAmount", 0)), 0)::numeric AS month_estimated_received,
          COALESCE(SUM(product_cost), 0)::numeric AS month_product_cost,
          COALESCE(SUM(additional_costs), 0)::numeric AS month_additional_costs,
          COUNT(*) FILTER (WHERE "netReceivedAmount" IS NULL)::bigint AS month_pending_billing,
          COUNT(*) FILTER (
            WHERE "netReceivedAmount" IS NOT NULL
              AND COALESCE("netReceivedAmount", 0) - product_cost - additional_costs < 0
          )::bigint AS month_loss_orders
        FROM order_costs
      ),
      local_metrics AS (
        SELECT
          payload ->> 'importedAt' AS imported_at,
          COALESCE(jsonb_array_length(payload -> 'pendingCostImports'), 0)::int AS pending_cost_imports,
          COALESCE(jsonb_array_length(payload #> '{fullStockSync,unmappedItems}'), 0)::int AS full_unmapped_items,
          COALESCE(NULLIF(payload #>> '{fullStockSync,mappedUnits}', '')::numeric, 0)::numeric AS full_stock
        FROM "LocalDataStore"
        WHERE "organizationId" = ${user.organizationId}
        LIMIT 1
      )
      SELECT
        local_metrics.imported_at AS "importedAt",
        product_metrics.products AS "products",
        product_metrics.products_without_cost AS "productsWithoutCost",
        product_metrics.negative_stock AS "negativeStock",
        product_metrics.low_stock AS "lowStock",
        product_metrics.total_stock AS "totalStock",
        product_metrics.inventory_value AS "inventoryValue",
        online_metrics.online_skus AS "onlineSkus",
        online_metrics.incomplete_sku_equivalences AS "incompleteSkuEquivalences",
        account_metrics.marketplace_accounts AS "marketplaceAccounts",
        order_metrics.meli_orders AS "meliOrders",
        unmapped_metrics.unmapped_skus AS "unmappedSkus",
        rare_metrics.rare_charges AS "rareCharges",
        local_metrics.pending_cost_imports AS "pendingCostImports",
        local_metrics.full_unmapped_items AS "fullUnmappedItems",
        local_metrics.full_stock AS "fullStock",
        financial_metrics.day_orders AS "dayOrders",
        financial_metrics.day_gross_amount AS "dayGrossAmount",
        financial_metrics.day_estimated_received AS "dayEstimatedReceived",
        financial_metrics.day_product_cost AS "dayProductCost",
        financial_metrics.day_additional_costs AS "dayAdditionalCosts",
        financial_metrics.day_pending_billing AS "dayPendingBilling",
        financial_metrics.day_loss_orders AS "dayLossOrders",
        financial_metrics.month_orders AS "monthOrders",
        financial_metrics.month_gross_amount AS "monthGrossAmount",
        financial_metrics.month_estimated_received AS "monthEstimatedReceived",
        financial_metrics.month_product_cost AS "monthProductCost",
        financial_metrics.month_additional_costs AS "monthAdditionalCosts",
        financial_metrics.month_pending_billing AS "monthPendingBilling",
        financial_metrics.month_loss_orders AS "monthLossOrders"
      FROM product_metrics
      CROSS JOIN online_metrics
      CROSS JOIN account_metrics
      CROSS JOIN order_metrics
      CROSS JOIN unmapped_metrics
      CROSS JOIN rare_metrics
      CROSS JOIN financial_metrics
      LEFT JOIN local_metrics ON true
    `,
    prisma.$queryRaw<FastTopProductRow[]>`
      WITH component_rows AS (
        SELECT
          sic."saleOrderItemId",
          MIN(mp."masterSku") AS "masterSku",
          MIN(mp.name) AS title,
          SUM(sic."quantityConsumed") AS "quantityConsumed"
        FROM "SaleItemComponent" sic
        JOIN "MasterProduct" mp ON mp.id = sic."masterProductId"
        WHERE sic."organizationId" = ${user.organizationId}
        GROUP BY sic."saleOrderItemId"
      )
      SELECT
        COALESCE(component_rows."masterSku", soi."externalSku", 'SIN_MAPEAR') AS "masterSku",
        COALESCE(component_rows.title, os.title, os."onlineSku", soi."externalSku", 'SIN_MAPEAR') AS title,
        SUM(COALESCE(component_rows."quantityConsumed", soi.quantity))::numeric AS "soldUnits",
        SUM(soi."grossAmount")::numeric AS "grossAmount"
      FROM "SaleOrderItem" soi
      JOIN "SaleOrder" so ON so.id = soi."saleOrderId"
      LEFT JOIN component_rows ON component_rows."saleOrderItemId" = soi.id
      LEFT JOIN "OnlineSku" os ON os.id = soi."onlineSkuId"
      WHERE so."organizationId" = ${user.organizationId}
        AND so.channel = 'mercado_libre'
        AND so."orderedAt" >= ${dayRange.from}
        AND so."orderedAt" < ${dayRange.to}
        AND LOWER(so.status) NOT LIKE '%cancel%'
      GROUP BY
        COALESCE(component_rows."masterSku", soi."externalSku", 'SIN_MAPEAR'),
        COALESCE(component_rows.title, os.title, os."onlineSku", soi."externalSku", 'SIN_MAPEAR')
      ORDER BY SUM(soi."grossAmount") DESC
      LIMIT 10
    `,
  ]);

  const core = coreRows[0];
  const dayEstimatedReceived = toDashboardNumber(core?.dayEstimatedReceived);
  const dayProductCost = toDashboardNumber(core?.dayProductCost);
  const dayAdditionalCosts = toDashboardNumber(core?.dayAdditionalCosts);
  const dayNetProfit = roundDashboardMoney(
    dayEstimatedReceived - dayProductCost - dayAdditionalCosts,
  );
  const monthEstimatedReceived = toDashboardNumber(core?.monthEstimatedReceived);
  const monthProductCost = toDashboardNumber(core?.monthProductCost);
  const monthAdditionalCosts = toDashboardNumber(core?.monthAdditionalCosts);
  const monthNetProfit = roundDashboardMoney(
    monthEstimatedReceived - monthProductCost - monthAdditionalCosts,
  );
  const products = toDashboardNumber(core?.products);
  const productsWithoutCost = toDashboardNumber(core?.productsWithoutCost);
  const onlineSkus = toDashboardNumber(core?.onlineSkus);
  const incompleteSkuEquivalences = toDashboardNumber(core?.incompleteSkuEquivalences);
  const unmappedSkus = toDashboardNumber(core?.unmappedSkus);
  const marketplaceAccounts = toDashboardNumber(core?.marketplaceAccounts);
  const meliOrders = toDashboardNumber(core?.meliOrders);
  const pendingCostImports = toDashboardNumber(core?.pendingCostImports);
  const fullUnmappedItems = toDashboardNumber(core?.fullUnmappedItems);
  const fullStock = toDashboardNumber(core?.fullStock);
  const hasMappingInputs =
    onlineSkus > 0 || unmappedSkus > 0 || incompleteSkuEquivalences > 0;
  const todayTopProducts = topProductRows.map((row) => ({
    masterSku: row.masterSku ?? "SIN_MAPEAR",
    title: row.title ?? row.masterSku ?? "Producto",
    soldUnits: toDashboardNumber(row.soldUnits),
    grossAmount: toDashboardNumber(row.grossAmount),
  }));
  const organization = {
    id: user.organizationId,
    name: user.organizationName,
  };

  const dashboard = {
    organization,
    importedAt: core?.importedAt ?? new Date().toISOString(),
    currentDay: {
      day: currentDay,
      label: formatReportDayLabel(currentDay),
      orders: toDashboardNumber(core?.dayOrders),
      grossMeliSales: toDashboardNumber(core?.dayGrossAmount),
      receivedConfirmed: dayEstimatedReceived,
      productCost: dayProductCost,
      netProfit: dayNetProfit,
      marginPercent: calculateMarginPercent(dayNetProfit, toDashboardNumber(core?.dayGrossAmount)),
      roiPercent: calculateMarginPercent(dayNetProfit, dayProductCost),
      lossOrders: toDashboardNumber(core?.dayLossOrders),
      pendingBilling: toDashboardNumber(core?.dayPendingBilling),
    },
    currentMonth: {
      month: currentMonth,
      label: formatReportMonthLabel(currentMonth),
      grossMeliSales: toDashboardNumber(core?.monthGrossAmount),
      receivedConfirmed: monthEstimatedReceived,
      netProfit: monthNetProfit,
      marginPercent: calculateMarginPercent(monthNetProfit, toDashboardNumber(core?.monthGrossAmount)),
      lossOrders: toDashboardNumber(core?.monthLossOrders),
      pendingBilling: toDashboardNumber(core?.monthPendingBilling),
    },
    kpis: {
      products,
      onlineSkus,
      warehouses: 0,
      totalStock: toDashboardNumber(core?.totalStock),
      committedStock: 0,
      estimatedPhysicalStock: toDashboardNumber(core?.totalStock),
      inventoryValue: roundDashboardMoney(toDashboardNumber(core?.inventoryValue)),
      negativeStock: toDashboardNumber(core?.negativeStock),
      lowStock: toDashboardNumber(core?.lowStock),
      meliAccounts: marketplaceAccounts,
      meliOrders,
      grossMeliSales: toDashboardNumber(core?.monthGrossAmount),
      receivedConfirmed: monthEstimatedReceived,
      meliCharges: monthAdditionalCosts,
      netProfit: monthNetProfit,
      marginPercent: calculateMarginPercent(monthNetProfit, toDashboardNumber(core?.monthGrossAmount)),
      pendingBilling: toDashboardNumber(core?.monthPendingBilling),
      cancelledOrdersForReview: 0,
      lossOrders: toDashboardNumber(core?.monthLossOrders),
      rareCharges: toDashboardNumber(core?.rareCharges),
      fullAuditAlerts: 0,
      unmappedItems: unmappedSkus,
      productsWithoutCost,
      pendingCostImports,
      incompleteOrders:
        toDashboardNumber(core?.monthPendingBilling) + unmappedSkus + productsWithoutCost,
      fullUnmappedItems,
      fullStock,
    },
    products: [],
    onlineSkus: [],
    warehouses: [],
    negativeStock: [],
    lowStock: [],
    unmappedItems: [],
    topProducts: todayTopProducts,
    todayTopProducts,
    stuckProducts: [],
    lossOrders: [],
    rareChargeAlerts: [],
    fullAuditAlerts: [],
    currentDayLossOrders: [],
    currentMonthLossOrders: [],
    fullAuditAccountId: "",
    fullAuditedAt: undefined,
    cancelledOrdersForReview: [],
    recentOrders: [],
  };

  const status = {
    organization,
    counts: {
      products,
      onlineSkus,
      meliAccounts: marketplaceAccounts,
      meliOrders,
      productsWithoutCost,
      skuEquivalences: onlineSkus,
      skuEquivalenceIssues: unmappedSkus + incompleteSkuEquivalences,
      incompleteSkuEquivalences,
      unmappedOrderItems: unmappedSkus,
      unmappedSkus,
      incompleteOrders: dashboard.kpis.incompleteOrders,
      pendingBillingOrders: toDashboardNumber(core?.monthPendingBilling),
      staleBillingOrders: 0,
      fullOrders: 0,
      fullOrdersWithoutFifo: 0,
      fullBillingCharges: 0,
      fullBillingAmount: 0,
      fullLayers: 0,
      fullLayersRemaining: 0,
      fullUnmapped: fullUnmappedItems,
      negativeBalances: toDashboardNumber(core?.negativeStock),
      lowStock: toDashboardNumber(core?.lowStock),
      pendingCostImports,
      staleSyncAccounts: 0,
      baselineProtectedOrders: 0,
    },
    readiness: {
      hasMappings:
        hasMappingInputs &&
        onlineSkus > 0 &&
        unmappedSkus + incompleteSkuEquivalences === 0,
      hasInventory: products > 0,
      hasCosts: products > 0 && productsWithoutCost === 0,
      hasMeliAccount: marketplaceAccounts > 0,
      hasMeliOrders: meliOrders > 0,
      hasFullSync: fullStock > 0 || fullUnmappedItems > 0,
      hasFullFifo: true,
      hasFullBilling: true,
      hasInventoryBaseline: true,
      hasCleanMappings:
        hasMappingInputs && unmappedSkus === 0 && incompleteSkuEquivalences === 0,
      hasCleanProfit:
        meliOrders > 0 &&
        toDashboardNumber(core?.monthPendingBilling) + unmappedSkus + productsWithoutCost === 0,
      hasCleanBilling:
        meliOrders > 0 && toDashboardNumber(core?.monthPendingBilling) === 0,
      hasFreshMeliSync: true,
    },
    dates: {
      importedAt: dashboard.importedAt,
      lastMeliSync: undefined,
      latestMeliSyncRun: undefined,
      fullSyncedAt: undefined,
      inventoryBaselineAt: undefined,
      latestFullBillingPeriod: undefined,
      latestFullBillingSyncedAt: undefined,
    },
    accounts: [],
    productsWithoutCost: [],
    skuEquivalences: [],
    incompleteSkuEquivalences: [],
    pendingCostImports: [],
    unmappedOrderItems: [],
    unmappedSkus: [],
    pendingBillingOrders: [],
    fullOrdersWithoutFifo: [],
    fullInventoryLayers: [],
    fullUnmapped: [],
    negativeBalances: [],
    masterSkus: [],
  };

  return { dashboard, status };
}

async function buildExpandedRelationalDashboardPageData(user: DashboardPageUser) {
  const currentDay = getCurrentBusinessDay();
  const currentMonth = getCurrentBusinessMonth();
  const dayRange = getBusinessDayRange(currentDay);
  const [
    financialSnapshot,
    metaRows,
    products,
    warehouses,
    onlineSkus,
    marketplaceAccounts,
    meliOrders,
    unmappedSkuRows,
    topProductRows,
    rareChargeRows,
  ] = await Promise.all([
    buildFinancialSnapshot(user.organizationId),
    prisma.$queryRaw<FastDashboardMetaRow[]>`
      SELECT
        payload ->> 'importedAt' AS "importedAt",
        COALESCE(jsonb_array_length(payload -> 'pendingCostImports'), 0)::int AS "pendingCostImports",
        COALESCE(jsonb_array_length(payload #> '{fullStockSync,unmappedItems}'), 0)::int AS "fullUnmappedItems",
        COALESCE(NULLIF(payload #>> '{fullStockSync,mappedUnits}', '')::numeric, 0)::numeric AS "fullStock"
      FROM "LocalDataStore"
      WHERE "organizationId" = ${user.organizationId}
      LIMIT 1
    `,
    prisma.masterProduct.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      select: {
        id: true,
        masterSku: true,
        name: true,
        targetInventoryDays: true,
        costSnapshots: {
          orderBy: { calculatedAt: "desc" },
          select: { averageCost: true },
          take: 1,
        },
        inventoryBalances: {
          select: {
            warehouseId: true,
            physicalQuantity: true,
            reservedQuantity: true,
          },
        },
      },
      orderBy: { masterSku: "asc" },
    }),
    prisma.warehouse.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      select: {
        id: true,
        name: true,
        type: true,
        channel: true,
        isSellable: true,
        isExclusive: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.onlineSku.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      select: {
        id: true,
        onlineSku: true,
        title: true,
        channel: true,
        marketplaceAccountId: true,
        externalListingId: true,
        safetyBufferUnits: true,
        components: {
          select: {
            quantityRequired: true,
            masterProductId: true,
          },
        },
      },
      orderBy: { onlineSku: "asc" },
    }),
    prisma.marketplaceAccount.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      select: {
        id: true,
        alias: true,
        externalAccountId: true,
        lastSyncAt: true,
        authStatus: true,
      },
    }),
    prisma.saleOrder.count({
      where: { organizationId: user.organizationId, channel: "mercado_libre" },
    }),
    prisma.$queryRaw<FastUnmappedSkuRow[]>`
      SELECT DISTINCT
        soi."externalSku" AS "externalSku",
        COALESCE(os.title, os."onlineSku", soi."externalSku") AS title
      FROM "SaleOrderItem" soi
      JOIN "SaleOrder" so ON so.id = soi."saleOrderId"
      LEFT JOIN "OnlineSku" os ON os.id = soi."onlineSkuId"
      LEFT JOIN "SaleItemComponent" sic ON sic."saleOrderItemId" = soi.id
      WHERE so."organizationId" = ${user.organizationId}
        AND so.channel = 'mercado_libre'
        AND LOWER(so.status) NOT LIKE '%cancel%'
        AND sic.id IS NULL
    `,
    prisma.$queryRaw<FastTopProductRow[]>`
      WITH component_rows AS (
        SELECT
          sic."saleOrderItemId",
          MIN(mp."masterSku") AS "masterSku",
          MIN(mp.name) AS title,
          SUM(sic."quantityConsumed") AS "quantityConsumed"
        FROM "SaleItemComponent" sic
        JOIN "MasterProduct" mp ON mp.id = sic."masterProductId"
        WHERE sic."organizationId" = ${user.organizationId}
        GROUP BY sic."saleOrderItemId"
      )
      SELECT
        COALESCE(component_rows."masterSku", soi."externalSku", 'SIN_MAPEAR') AS "masterSku",
        COALESCE(component_rows.title, os.title, os."onlineSku", soi."externalSku", 'SIN_MAPEAR') AS title,
        SUM(COALESCE(component_rows."quantityConsumed", soi.quantity))::numeric AS "soldUnits",
        SUM(soi."grossAmount")::numeric AS "grossAmount"
      FROM "SaleOrderItem" soi
      JOIN "SaleOrder" so ON so.id = soi."saleOrderId"
      LEFT JOIN component_rows ON component_rows."saleOrderItemId" = soi.id
      LEFT JOIN "OnlineSku" os ON os.id = soi."onlineSkuId"
      WHERE so."organizationId" = ${user.organizationId}
        AND so.channel = 'mercado_libre'
        AND so."orderedAt" >= ${dayRange.from}
        AND so."orderedAt" < ${dayRange.to}
        AND LOWER(so.status) NOT LIKE '%cancel%'
      GROUP BY
        COALESCE(component_rows."masterSku", soi."externalSku", 'SIN_MAPEAR'),
        COALESCE(component_rows.title, os.title, os."onlineSku", soi."externalSku", 'SIN_MAPEAR')
      ORDER BY SUM(soi."grossAmount") DESC
      LIMIT 10
    `,
    prisma.$queryRaw<FastCountRow[]>`
      SELECT COUNT(DISTINCT sc."saleOrderId")::bigint AS count
      FROM "SaleCharge" sc
      JOIN "SaleOrder" so ON so.id = sc."saleOrderId"
      WHERE sc."organizationId" = ${user.organizationId}
        AND sc."chargeType" = 'fulfillment'
        AND sc.amount > 0.01
        AND LOWER(so.status) NOT LIKE '%cancel%'
    `,
  ]);

  const financialDay = financialSnapshot?.currentDay ?? emptyFinancialPeriod();
  const financialMonth = financialSnapshot?.currentMonth ?? emptyFinancialPeriod();
  const meta = metaRows[0];
  const productRows = products.map((product) => {
    const averageUnitCost = toDashboardNumber(product.costSnapshots[0]?.averageCost);
    const currentStock = product.inventoryBalances.reduce(
      (sum, balance) => sum + toDashboardNumber(balance.physicalQuantity),
      0,
    );

    return {
      id: product.id,
      masterSku: product.masterSku,
      name: product.name,
      currentStock,
      totalIngresado: 0,
      totalVendido: 0,
      targetInventoryDays: product.targetInventoryDays,
      averageUnitCost,
      isActive: true,
    };
  });
  const totalStock = productRows.reduce((sum, product) => sum + product.currentStock, 0);
  const inventoryValue = productRows.reduce(
    (sum, product) => sum + product.currentStock * product.averageUnitCost,
    0,
  );
  const productsWithoutCost = productRows.filter(
    (product) => product.averageUnitCost <= 0,
  );
  const negativeStock = productRows.filter((product) => product.currentStock < 0);
  const lowStock = productRows.filter(
    (product) => product.currentStock >= 0 && product.currentStock <= 10,
  );
  const physicalQuantityByWarehouse = new Map<string, number>();
  for (const product of products) {
    for (const balance of product.inventoryBalances) {
      physicalQuantityByWarehouse.set(
        balance.warehouseId,
        (physicalQuantityByWarehouse.get(balance.warehouseId) ?? 0) +
          toDashboardNumber(balance.physicalQuantity),
      );
    }
  }
  const incompleteSkuEquivalences = onlineSkus.filter(
    (sku) =>
      sku.components.length === 0 ||
      sku.components.some(
        (component) =>
          !component.masterProductId ||
          toDashboardNumber(component.quantityRequired) <= 0,
      ),
  );
  const unmappedSkus = unmappedSkuRows.map((row) => ({
    orderId: "",
    externalSku: row.externalSku ?? "SIN_SKU",
    title: row.title ?? row.externalSku ?? "SKU sin mapear",
  }));
  const hasMappingInputs =
    onlineSkus.length > 0 ||
    unmappedSkus.length > 0 ||
    incompleteSkuEquivalences.length > 0;
  const pendingCostImports = toDashboardNumber(meta?.pendingCostImports);
  const fullUnmappedItems = toDashboardNumber(meta?.fullUnmappedItems);
  const fullStock = toDashboardNumber(meta?.fullStock);
  const rareCharges = toDashboardNumber(rareChargeRows[0]?.count);
  const grossMeliSales = financialMonth.grossAmount;
  const receivedConfirmed = financialMonth.estimatedReceived;
  const meliCharges = financialMonth.additionalCosts;
  const netProfit = financialMonth.netProfit;
  const todayTopProducts = topProductRows.map((row) => ({
    masterSku: row.masterSku ?? "SIN_MAPEAR",
    title: row.title ?? row.masterSku ?? "Producto",
    soldUnits: toDashboardNumber(row.soldUnits),
    grossAmount: toDashboardNumber(row.grossAmount),
  }));

  const dashboard = {
    organization: {
      id: user.organizationId,
      name: user.organizationName,
    },
    importedAt: meta?.importedAt ?? new Date().toISOString(),
    currentDay: {
      day: currentDay,
      label: formatReportDayLabel(currentDay),
      orders: financialDay.orders,
      grossMeliSales: financialDay.grossAmount,
      receivedConfirmed: financialDay.estimatedReceived,
      productCost: financialDay.productCost,
      netProfit: financialDay.netProfit,
      marginPercent: calculateMarginPercent(financialDay.netProfit, financialDay.grossAmount),
      roiPercent: calculateMarginPercent(financialDay.netProfit, financialDay.productCost),
      lossOrders: financialDay.lossOrders,
      pendingBilling: financialDay.pendingBilling,
    },
    currentMonth: {
      month: currentMonth,
      label: formatReportMonthLabel(currentMonth),
      grossMeliSales: financialMonth.grossAmount,
      receivedConfirmed: financialMonth.estimatedReceived,
      netProfit: financialMonth.netProfit,
      marginPercent: calculateMarginPercent(financialMonth.netProfit, financialMonth.grossAmount),
      lossOrders: financialMonth.lossOrders,
      pendingBilling: financialMonth.pendingBilling,
    },
    kpis: {
      products: productRows.length,
      onlineSkus: onlineSkus.length,
      warehouses: warehouses.length,
      totalStock,
      committedStock: 0,
      estimatedPhysicalStock: totalStock,
      inventoryValue: roundDashboardMoney(inventoryValue),
      negativeStock: negativeStock.length,
      lowStock: lowStock.length,
      meliAccounts: marketplaceAccounts.length,
      meliOrders,
      grossMeliSales,
      receivedConfirmed,
      meliCharges,
      netProfit,
      marginPercent: grossMeliSales > 0 ? (netProfit / grossMeliSales) * 100 : 0,
      pendingBilling: financialMonth.pendingBilling,
      cancelledOrdersForReview: 0,
      lossOrders: financialMonth.lossOrders,
      rareCharges,
      fullAuditAlerts: 0,
      unmappedItems: unmappedSkus.length,
      productsWithoutCost: productsWithoutCost.length,
      pendingCostImports,
      incompleteOrders: financialMonth.pendingBilling + unmappedSkus.length + productsWithoutCost.length,
      fullUnmappedItems,
      fullStock,
    },
    products: productRows.slice(0, 25),
    onlineSkus: onlineSkus.slice(0, 20).map((sku) => ({
      id: sku.id,
      onlineSku: sku.onlineSku,
      title: sku.title ?? sku.onlineSku,
      channel: sku.channel,
      marketplaceAccount: sku.marketplaceAccountId ?? "",
      externalListingId: sku.externalListingId,
      safetyBufferUnits: sku.safetyBufferUnits,
      components: sku.components.map((component) => ({
        masterSku: component.masterProductId,
        quantityRequired: toDashboardNumber(component.quantityRequired),
      })),
    })),
    warehouses: warehouses.map((warehouse) => ({
      id: warehouse.id,
      name: warehouse.name,
      type: warehouse.type,
      channel: warehouse.channel,
      isSellable: warehouse.isSellable,
      isExclusive: warehouse.isExclusive,
      physicalQuantity: physicalQuantityByWarehouse.get(warehouse.id) ?? 0,
    })),
    negativeStock,
    lowStock,
    unmappedItems: unmappedSkus.slice(0, 20),
    topProducts: todayTopProducts,
    todayTopProducts,
    stuckProducts: [],
    lossOrders: [],
    rareChargeAlerts: [],
    fullAuditAlerts: [],
    currentDayLossOrders: [],
    currentMonthLossOrders: [],
    fullAuditAccountId: marketplaceAccounts[0]?.id ?? "",
    fullAuditedAt: undefined,
    cancelledOrdersForReview: [],
    recentOrders: [],
  };

  const status = {
    organization: dashboard.organization,
    counts: {
      products: productRows.length,
      onlineSkus: onlineSkus.length,
      meliAccounts: marketplaceAccounts.length,
      meliOrders,
      productsWithoutCost: productsWithoutCost.length,
      skuEquivalences: onlineSkus.length,
      skuEquivalenceIssues: unmappedSkus.length + incompleteSkuEquivalences.length,
      incompleteSkuEquivalences: incompleteSkuEquivalences.length,
      unmappedOrderItems: unmappedSkus.length,
      unmappedSkus: unmappedSkus.length,
      incompleteOrders: dashboard.kpis.incompleteOrders,
      pendingBillingOrders: financialMonth.pendingBilling,
      staleBillingOrders: 0,
      fullOrders: 0,
      fullOrdersWithoutFifo: 0,
      fullBillingCharges: 0,
      fullBillingAmount: 0,
      fullLayers: 0,
      fullLayersRemaining: 0,
      fullUnmapped: fullUnmappedItems,
      negativeBalances: negativeStock.length,
      lowStock: lowStock.length,
      pendingCostImports,
      staleSyncAccounts: 0,
      baselineProtectedOrders: 0,
    },
    readiness: {
      hasMappings:
        hasMappingInputs &&
        onlineSkus.length > 0 &&
        unmappedSkus.length + incompleteSkuEquivalences.length === 0,
      hasInventory: productRows.length > 0,
      hasCosts: productRows.length > 0 && productsWithoutCost.length === 0,
      hasMeliAccount: marketplaceAccounts.length > 0,
      hasMeliOrders: meliOrders > 0,
      hasFullSync: fullStock > 0 || fullUnmappedItems > 0,
      hasFullFifo: true,
      hasFullBilling: true,
      hasInventoryBaseline: true,
      hasCleanMappings:
        hasMappingInputs &&
        unmappedSkus.length === 0 &&
        incompleteSkuEquivalences.length === 0,
      hasCleanProfit:
        meliOrders > 0 &&
        financialMonth.pendingBilling + unmappedSkus.length + productsWithoutCost.length === 0,
      hasCleanBilling: meliOrders > 0 && financialMonth.pendingBilling === 0,
      hasFreshMeliSync: true,
    },
    dates: {
      importedAt: dashboard.importedAt,
      lastMeliSync: marketplaceAccounts
        .map((account) => account.lastSyncAt?.toISOString())
        .filter(Boolean)
        .sort()
        .at(-1),
      latestMeliSyncRun: undefined,
      fullSyncedAt: undefined,
      inventoryBaselineAt: undefined,
      latestFullBillingPeriod: undefined,
      latestFullBillingSyncedAt: undefined,
    },
    accounts: marketplaceAccounts.map((account) => ({
      id: account.id,
      channel: "mercado_libre" as const,
      alias: account.alias,
      externalAccountId: account.externalAccountId ?? account.alias,
      nickname: account.alias,
      siteId: undefined,
      tokenExpiresAt: new Date(0).toISOString(),
      lastSyncAt: account.lastSyncAt?.toISOString(),
      status: account.authStatus === "connected" ? "connected" as const : "error" as const,
    })),
    productsWithoutCost: productsWithoutCost.slice(0, 25),
    skuEquivalences: [],
    incompleteSkuEquivalences: [],
    pendingCostImports: [],
    unmappedOrderItems: unmappedSkus.slice(0, 25),
    unmappedSkus: unmappedSkus.slice(0, 100),
    pendingBillingOrders: [],
    fullOrdersWithoutFifo: [],
    fullInventoryLayers: [],
    fullUnmapped: [],
    negativeBalances: negativeStock.slice(0, 25),
    masterSkus: productRows.map((product) => ({
      masterSku: product.masterSku,
      name: product.name,
    })),
  };

  return { dashboard, status };
}

function getCurrentBusinessMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}`;
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

function getCurrentBusinessDay(): string {
  return getBusinessDay(new Date().toISOString());
}

function getBusinessDay(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return formatBusinessDay(new Date());
  }

  return formatBusinessDay(date);
}

function getBusinessDayRange(day: string) {
  const from = new Date(`${day}T00:00:00-06:00`);
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + 1);
  return { from, to };
}

function getBusinessMonthRange(month: string) {
  const from = new Date(`${month}-01T00:00:00-06:00`);
  const to = new Date(from);
  to.setUTCMonth(to.getUTCMonth() + 1);
  return { from, to };
}

function formatBusinessDay(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function getBusinessMonth(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return getCurrentBusinessMonth();
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}`;
}

function formatReportMonthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1, 1));
  return new Intl.DateTimeFormat("es-MX", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatReportDayLabel(day: string) {
  const [year, monthNumber, dayNumber] = day.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1, dayNumber));
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function calculateMarginPercent(netProfit: number, grossAmount: number) {
  return grossAmount > 0 ? (netProfit / grossAmount) * 100 : 0;
}

function emptyFinancialPeriod() {
  return {
    orders: 0,
    grossAmount: 0,
    estimatedReceived: 0,
    productCost: 0,
    additionalCosts: 0,
    netProfit: 0,
    pendingBilling: 0,
    lossOrders: 0,
  };
}

function toDashboardNumber(value: unknown) {
  if (typeof value === "bigint") {
    return Number(value);
  }

  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundDashboardMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function getDashboardFallbackOrderLimit() {
  const value = Number(process.env.DASHBOARD_REPORT_MAX_ORDERS ?? 1_500);
  return Number.isFinite(value) && value > 0
    ? Math.min(Math.floor(value), 10_000)
    : 1_500;
}

function buildFullAuditAlerts(store: LocalStore) {
  const auditItems = store.fullStockSync?.auditItems ?? [];
  if (auditItems.length === 0) {
    return [];
  }

  const expectedByMasterSku = new Map(
    store.inventoryBalances
      .filter((balance) => balance.warehouseId === "wh_full")
      .map((balance) => [balance.masterSku, balance.physicalQuantity]),
  );
  const productBySku = new Map(
    store.products.map((product) => [product.masterSku, product]),
  );
  const rowsByMasterSku = new Map<
    string,
    {
      masterSku: string;
      expectedUnits: number;
      availableUnits: number;
      meliTotalUnits: number;
      notAvailableUnits: number;
      details: Map<string, number>;
      inventoryIds: string[];
      titles: string[];
    }
  >();

  for (const item of auditItems) {
    if (!item.masterSku || item.totalConsumedQuantity === null) {
      continue;
    }

    const row = rowsByMasterSku.get(item.masterSku) ?? {
      masterSku: item.masterSku,
      expectedUnits: expectedByMasterSku.get(item.masterSku) ?? 0,
      availableUnits: 0,
      meliTotalUnits: 0,
      notAvailableUnits: 0,
      details: new Map<string, number>(),
      inventoryIds: [],
      titles: [],
    };

    row.availableUnits += item.availableConsumedQuantity ?? 0;
    row.meliTotalUnits += item.totalConsumedQuantity;
    row.notAvailableUnits += item.notAvailableConsumedQuantity ?? 0;
    row.inventoryIds.push(item.inventoryId);
    if (item.title && !row.titles.includes(item.title)) {
      row.titles.push(item.title);
    }

    for (const detail of item.notAvailableDetail) {
      const quantity =
        item.componentQuantityRequired !== null
          ? detail.quantity * item.componentQuantityRequired
          : detail.quantity;
      row.details.set(detail.status, (row.details.get(detail.status) ?? 0) + quantity);
    }

    rowsByMasterSku.set(item.masterSku, row);
  }

  return [...rowsByMasterSku.values()]
    .map((row) => {
      const missingUnits = Math.max(0, row.expectedUnits - row.meliTotalUnits);
      const surplusUnits = Math.max(0, row.meliTotalUnits - row.expectedUnits);
      const notAvailableUnits = Math.max(0, row.notAvailableUnits);
      const impactUnits = missingUnits + notAvailableUnits;
      const detailText = [...row.details.entries()]
        .map(([status, quantity]) => `${status}: ${quantity}`)
        .join(", ");
      const id = [
        "full-audit",
        row.masterSku,
        roundForAlert(row.expectedUnits),
        roundForAlert(row.meliTotalUnits),
        roundForAlert(row.notAvailableUnits),
      ].join(":");

      return {
        id,
        accountId: store.fullStockSync?.accountId ?? "",
        auditedAt: store.fullStockSync?.auditedAt ?? "",
        masterSku: row.masterSku,
        productName: productBySku.get(row.masterSku)?.name ?? row.titles[0] ?? row.masterSku,
        expectedUnits: row.expectedUnits,
        availableUnits: row.availableUnits,
        meliTotalUnits: row.meliTotalUnits,
        notAvailableUnits,
        missingUnits,
        surplusUnits,
        impactUnits,
        detailText,
        inventoryIds: [...new Set(row.inventoryIds)],
      };
    })
    .filter(
      (alert) =>
        alert.missingUnits > 0.004 ||
        alert.notAvailableUnits > 0.004 ||
        alert.surplusUnits > 0.004,
    );
}

function roundForAlert(value: number) {
  return value.toFixed(4).replace(/\.?0+$/, "");
}

function buildRareChargeAlertId(
  externalOrderId: string,
  charge: { type: string; source: string; amount: number },
) {
  return `${externalOrderId}:${charge.type}:${charge.source}:${charge.amount.toFixed(2)}`;
}

function buildTopProducts(orders: LocalOrderLike[]) {
  const rows = new Map<
    string,
    {
      masterSku: string;
      title: string;
      soldUnits: number;
      grossAmount: number;
    }
  >();

  for (const order of orders) {
    for (const item of order.items) {
      const masterSku = item.masterSku ?? "SIN_MAPEAR";
      const row = rows.get(masterSku) ?? {
        masterSku,
        title: item.title,
        soldUnits: 0,
        grossAmount: 0,
      };

      row.soldUnits += item.consumedQuantity ?? item.quantity;
      row.grossAmount += item.quantity * item.unitPrice;
      rows.set(masterSku, row);
    }
  }

  return [...rows.values()].sort((a, b) => b.grossAmount - a.grossAmount);
}

type LocalOrderLike = LocalStore["marketplaceOrders"][number];
