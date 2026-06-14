import { isCancelledOrder } from "./order-status";
import { groupMarketplaceOrdersIntoRealSales } from "../meli/order-group";
import type { LocalMarketplaceOrder, LocalStore } from "./local-store";

export type SalesAuditSeverity = "critical" | "warning";

export type SalesAuditIssue = {
  id: string;
  severity: SalesAuditSeverity;
  rule: string;
  title: string;
  detail: string;
  orderId: string;
  realSaleKey: string;
  orderedAt: string;
  status: string;
  grossAmount: number;
  netReceivedAmount: number | null;
  chargesTotal: number;
  expectedReceived: number | null;
  delta: number | null;
  accountAlias: string;
  href: string;
  actionHref?: string;
  actionLabel?: string;
};

export type SalesAuditReport = {
  generatedAt: string;
  organization: LocalStore["organization"];
  totalOrders: number;
  totalRealSales: number;
  cleanRealSales: number;
  criticalCount: number;
  warningCount: number;
  issues: SalesAuditIssue[];
  ruleCounts: Array<{
    rule: string;
    title: string;
    severity: SalesAuditSeverity;
    count: number;
  }>;
};

type RealSaleGroup = {
  key: string;
  orders: LocalMarketplaceOrder[];
};

const moneyTolerance = 0.02;
const pendingBillingLimitMs = 48 * 60 * 60 * 1000;

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function groupMarketplaceOrdersByRealSale(orders: LocalMarketplaceOrder[]) {
  return groupMarketplaceOrdersIntoRealSales(orders);
}

function aggregateShippingCharges(charges: LocalMarketplaceOrder["charges"]) {
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
    (amount) => Math.abs(amount - amounts[0]) < moneyTolerance,
  );
  const amount =
    !allAlreadyAllocated && allSameAmount && amounts.length > 1
      ? amounts[0]
      : amounts.reduce((sum, value) => sum + value, 0);

  return roundMoney(amount);
}

function aggregateRealSaleCharges(group: LocalMarketplaceOrder[]) {
  const regularCharges = new Map<string, number>();
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
    regularCharges.set(key, (regularCharges.get(key) ?? 0) + charge.amount);
  }

  const shippingCharge = aggregateShippingCharges(allCharges) ?? 0;
  return roundMoney(
    [...regularCharges.values()].reduce((sum, value) => sum + value, 0) +
      shippingCharge,
  );
}

function getPrimaryOrder(group: LocalMarketplaceOrder[]) {
  return group.reduce((candidate, order) =>
    new Date(order.orderedAt).getTime() > new Date(candidate.orderedAt).getTime()
      ? order
      : candidate,
  );
}

function getAccountAlias(store: LocalStore, accountId: string) {
  return (
    store.marketplaceAccounts.find((account) => account.id === accountId)?.alias ??
    accountId
  );
}

function isBillingConfirmed(group: LocalMarketplaceOrder[]) {
  return group.every((order) => order.billingStatus === "confirmed");
}

function hasPendingBillingTooLong(group: LocalMarketplaceOrder[], now: number) {
  return group.some((order) => {
    if (order.billingStatus === "confirmed") {
      return false;
    }

    const triedAt = order.billingLastTriedAt ?? order.orderedAt;
    return now - new Date(triedAt).getTime() > pendingBillingLimitMs;
  });
}

function buildIssue(input: {
  group: RealSaleGroup;
  store: LocalStore;
  severity: SalesAuditSeverity;
  rule: string;
  title: string;
  detail: string;
  grossAmount: number;
  netReceivedAmount: number | null;
  chargesTotal: number;
  expectedReceived: number | null;
  delta?: number | null;
  actionHref?: string;
  actionLabel?: string;
}): SalesAuditIssue {
  const primary = getPrimaryOrder(input.group.orders);
  return {
    id: `${input.group.key}:${input.rule}`,
    severity: input.severity,
    rule: input.rule,
    title: input.title,
    detail: input.detail,
    orderId: primary.externalOrderId,
    realSaleKey: input.group.key,
    orderedAt: primary.orderedAt,
    status: primary.status,
    grossAmount: input.grossAmount,
    netReceivedAmount: input.netReceivedAmount,
    chargesTotal: input.chargesTotal,
    expectedReceived: input.expectedReceived,
    delta: input.delta ?? null,
    accountAlias: getAccountAlias(input.store, primary.marketplaceAccountId),
    href: `/ventas/${encodeURIComponent(primary.externalOrderId)}`,
    actionHref: input.actionHref,
    actionLabel: input.actionLabel,
  };
}

export function buildSalesAuditReportFromStore(
  store: LocalStore,
  now = Date.now(),
): SalesAuditReport {
  const groups = groupMarketplaceOrdersByRealSale(store.marketplaceOrders);
  const duplicateOrderIds = new Map<string, number>();
  const issues: SalesAuditIssue[] = [];

  for (const order of store.marketplaceOrders) {
    duplicateOrderIds.set(
      order.externalOrderId,
      (duplicateOrderIds.get(order.externalOrderId) ?? 0) + 1,
    );
  }

  for (const group of groups) {
    const primary = getPrimaryOrder(group.orders);
    const allCancelled = group.orders.every((order) => isCancelledOrder(order.status));
    const anyCancelled = group.orders.some((order) => isCancelledOrder(order.status));
    const grossAmount = allCancelled
      ? 0
      : roundMoney(group.orders.reduce((sum, order) => sum + order.grossAmount, 0));
    const chargesTotal = allCancelled ? 0 : aggregateRealSaleCharges(group.orders);
    const netReceivedAmount = allCancelled
      ? 0
      : group.orders.some((order) => order.netReceivedAmount === null)
        ? null
        : roundMoney(
            group.orders.reduce((sum, order) => sum + (order.netReceivedAmount ?? 0), 0),
          );
    const expectedReceived =
      allCancelled || !isBillingConfirmed(group.orders)
        ? null
        : roundMoney(Math.max(0, grossAmount - chargesTotal));

    if (allCancelled) {
      const originalGross = roundMoney(
        group.orders.reduce((sum, order) => sum + order.grossAmount, 0),
      );
      const originalCharges = roundMoney(
        group.orders.reduce(
          (sum, order) =>
            sum + order.charges.reduce((chargeSum, charge) => chargeSum + charge.amount, 0),
          0,
        ),
      );
      const originalNet = group.orders.reduce(
        (sum, order) => sum + (order.netReceivedAmount ?? 0),
        0,
      );

      if (
        Math.abs(originalGross) > moneyTolerance ||
        Math.abs(originalCharges) > moneyTolerance ||
        Math.abs(originalNet) > moneyTolerance
      ) {
        issues.push(
          buildIssue({
            group,
            store,
            severity: "critical",
            rule: "cancelled_money",
            title: "Cancelada con dinero activo",
            detail:
              "Meli la marca cancelada, pero la venta todavia tiene venta, recibido o cargos. Hay que re-sincronizar y confirmar billing.",
            grossAmount: originalGross,
            netReceivedAmount: roundMoney(originalNet),
            chargesTotal: originalCharges,
            expectedReceived: 0,
            delta: roundMoney(originalNet),
            actionHref: `/api/integrations/meli/repair-audit?orderId=${encodeURIComponent(primary.externalOrderId)}&back=${encodeURIComponent(`/ventas/${primary.externalOrderId}`)}`,
            actionLabel: "Actualizar Meli",
          }),
        );
      }

      continue;
    }

    if (anyCancelled) {
      issues.push(
        buildIssue({
          group,
          store,
          severity: "critical",
          rule: "mixed_cancelled_pack",
          title: "Pack mezclado con canceladas",
          detail:
            "Una parte del paquete esta cancelada y otra no. Se debe revisar contra Meli para no duplicar cargos o inventario.",
          grossAmount,
          netReceivedAmount,
          chargesTotal,
          expectedReceived,
          actionHref: `/ventas/${encodeURIComponent(primary.externalOrderId)}`,
          actionLabel: "Ver venta",
        }),
      );
    }

    if (grossAmount <= 0) {
      issues.push(
        buildIssue({
          group,
          store,
          severity: "critical",
          rule: "zero_gross",
          title: "Venta sin importe",
          detail: "La venta no esta cancelada, pero la venta bruta es cero o negativa.",
          grossAmount,
          netReceivedAmount,
          chargesTotal,
          expectedReceived,
        }),
      );
    }

    if (
      isBillingConfirmed(group.orders) &&
      chargesTotal > grossAmount + moneyTolerance &&
      (netReceivedAmount ?? 0) <= moneyTolerance
    ) {
      issues.push(
        buildIssue({
          group,
          store,
          severity: "critical",
          rule: "possible_cancelled_not_marked",
          title: "Posible cancelada no marcada",
          detail:
            "Los cargos son mayores a la venta y el recibido es cero. Normalmente esto significa cancelacion/refund que aun no quedo normalizado.",
          grossAmount,
          netReceivedAmount,
          chargesTotal,
          expectedReceived: 0,
          delta: netReceivedAmount,
          actionHref: `/api/integrations/meli/repair-audit?orderId=${encodeURIComponent(primary.externalOrderId)}&back=${encodeURIComponent(`/ventas/${primary.externalOrderId}`)}`,
          actionLabel: "Actualizar Meli",
        }),
      );
    }

    if (
      expectedReceived !== null &&
      netReceivedAmount !== null &&
      Math.abs(netReceivedAmount - expectedReceived) > moneyTolerance
    ) {
      issues.push(
        buildIssue({
          group,
          store,
          severity: "critical",
          rule: "net_mismatch",
          title: "Recibido no cuadra",
          detail:
            "Billing ya esta confirmado, pero recibido no coincide con venta menos cargos. Este es el tipo de error que estabamos detectando a ojo.",
          grossAmount,
          netReceivedAmount,
          chargesTotal,
          expectedReceived,
          delta: roundMoney(netReceivedAmount - expectedReceived),
          actionHref: `/api/integrations/meli/repair-audit?orderId=${encodeURIComponent(primary.externalOrderId)}&back=${encodeURIComponent(`/ventas/${primary.externalOrderId}`)}`,
          actionLabel: "Actualizar Meli",
        }),
      );
    }

    if (netReceivedAmount === null && hasPendingBillingTooLong(group.orders, now)) {
      issues.push(
        buildIssue({
          group,
          store,
          severity: "warning",
          rule: "old_pending_billing",
          title: "Billing pendiente +48h",
          detail:
            "Meli todavia no entrego el neto real y ya paso el tiempo normal. Conviene reintentar o revisar la venta.",
          grossAmount,
          netReceivedAmount,
          chargesTotal,
          expectedReceived,
          actionHref: `/api/integrations/meli/repair-audit?orderId=${encodeURIComponent(primary.externalOrderId)}&back=${encodeURIComponent(`/ventas/${primary.externalOrderId}`)}`,
          actionLabel: "Reintentar billing",
        }),
      );
    }

    if (chargesTotal <= moneyTolerance && grossAmount > 0 && isBillingConfirmed(group.orders)) {
      issues.push(
        buildIssue({
          group,
          store,
          severity: "warning",
          rule: "no_charges",
          title: "Venta sin cargos",
          detail:
            "La venta esta confirmada pero no hay comision, envio ni impuestos detectados. Puede ser correcto, pero vale revisarlo.",
          grossAmount,
          netReceivedAmount,
          chargesTotal,
          expectedReceived,
        }),
      );
    }

    const rawItemGross = roundMoney(
      group.orders.flatMap((order) => order.items).reduce(
        (sum, item) => sum + item.quantity * item.unitPrice,
        0,
      ),
    );
    if (Math.abs(rawItemGross - grossAmount) > moneyTolerance) {
      issues.push(
        buildIssue({
          group,
          store,
          severity: "warning",
          rule: "item_gross_mismatch",
          title: "Venta no cuadra con items",
          detail:
            "La suma de piezas por precio no coincide con la venta bruta. Puede indicar pack mal agrupado o cantidad incompleta.",
          grossAmount,
          netReceivedAmount,
          chargesTotal,
          expectedReceived,
          delta: roundMoney(rawItemGross - grossAmount),
        }),
      );
    }

    const unmappedItems = group.orders
      .flatMap((order) => order.items)
      .filter((item) => !item.masterSku || item.consumedQuantity === null);
    if (unmappedItems.length > 0) {
      issues.push(
        buildIssue({
          group,
          store,
          severity: "critical",
          rule: "unmapped_items",
          title: "SKU sin equivalencia",
          detail:
            "La venta no sabe que SKU maestro descontar o cuantas unidades consume.",
          grossAmount,
          netReceivedAmount,
          chargesTotal,
          expectedReceived,
          actionHref: "/setup#mapear",
          actionLabel: "Mapear SKU",
        }),
      );
    }

    for (const order of group.orders) {
      if ((duplicateOrderIds.get(order.externalOrderId) ?? 0) > 1) {
        issues.push(
          buildIssue({
            group,
            store,
            severity: "critical",
            rule: "duplicate_order_id",
            title: "Orden duplicada",
            detail:
              "El mismo numero de orden aparece mas de una vez. Puede duplicar cargos o inventario.",
            grossAmount,
            netReceivedAmount,
            chargesTotal,
            expectedReceived,
          }),
        );
        break;
      }
    }
  }

  const uniqueIssueSaleKeys = new Set(issues.map((issue) => issue.realSaleKey));
  const ruleMap = new Map<
    string,
    { rule: string; title: string; severity: SalesAuditSeverity; count: number }
  >();

  for (const issue of issues) {
    const current = ruleMap.get(issue.rule) ?? {
      rule: issue.rule,
      title: issue.title,
      severity: issue.severity,
      count: 0,
    };
    current.count += 1;
    if (issue.severity === "critical") {
      current.severity = "critical";
    }
    ruleMap.set(issue.rule, current);
  }

  return {
    generatedAt: new Date(now).toISOString(),
    organization: store.organization,
    totalOrders: store.marketplaceOrders.length,
    totalRealSales: groups.length,
    cleanRealSales: Math.max(0, groups.length - uniqueIssueSaleKeys.size),
    criticalCount: issues.filter((issue) => issue.severity === "critical").length,
    warningCount: issues.filter((issue) => issue.severity === "warning").length,
    issues: issues.sort((a, b) => {
      if (a.severity !== b.severity) {
        return a.severity === "critical" ? -1 : 1;
      }
      return new Date(b.orderedAt).getTime() - new Date(a.orderedAt).getTime();
    }),
    ruleCounts: [...ruleMap.values()].sort((a, b) => b.count - a.count),
  };
}

export async function buildSalesAuditReport() {
  const { readLocalStore } = await import("./local-store");
  return buildSalesAuditReportFromStore(await readLocalStore());
}

