import type { LocalMarketplaceOrder, LocalStore } from "@/lib/server/local-store";
import { normalizeSkuKey } from "../domain/sku-match";

type MeliOrderItem = {
  item?: {
    id?: string;
    title?: string;
    thumbnail?: string | null;
    secure_thumbnail?: string | null;
    pictures?: Array<{
      secure_url?: string | null;
      url?: string | null;
    }>;
    seller_sku?: string | null;
    seller_custom_field?: string | null;
    variation_id?: number | null;
    variation_attributes?: Array<{ name?: string; value_name?: string }>;
  };
  quantity?: number;
  unit_price?: number;
  sale_fee?: number;
};

type MeliPayment = {
  id?: number | string;
  payment_id?: number | string;
  transaction_amount?: number;
  total_paid_amount?: number;
  marketplace_fee?: number;
  taxes_amount?: number;
  status?: string;
};

type MeliPaymentDetail = {
  id?: number | string;
  status?: string;
  transaction_amount?: number;
  total_paid_amount?: number;
  transaction_details?: {
    net_received_amount?: number;
    total_paid_amount?: number;
  };
  fee_details?: Array<{
    amount?: number;
    type?: string;
    fee_payer?: string;
  }>;
  charges_details?: Array<{
    name?: string;
    type?: string;
    accounts?: {
      from?: string;
      to?: string;
    };
    amounts?: {
      original?: number;
      refunded?: number;
    };
  }>;
};

type MeliBillingOrderDetail = {
  payment_info?: Array<{
    tax_details?: Array<{
      original_amount?: number;
      refunded_amount?: number;
      mov_financial_entity?: string;
      mov_detail?: string;
    }>;
  }>;
  details?: Array<{
    charge_info?: {
      transaction_detail?: string;
      debited_from_operation?: string;
      detail_amount?: number;
      detail_type?: string;
      detail_sub_type?: string;
    };
  }>;
};

type MeliOrder = {
  id?: number | string;
  pack_id?: number | string | null;
  packId?: number | string | null;
  pack?: {
    id?: number | string | null;
    pack_id?: number | string | null;
  } | null;
  order_request?: {
    id?: number | string | null;
  } | null;
  status?: string;
  date_created?: string;
  date_closed?: string;
  total_amount?: number;
  paid_amount?: number;
  currency_id?: string;
  order_items?: MeliOrderItem[];
  payments?: MeliPayment[];
  shipping?: {
    id?: number | string;
    logistic_type?: string;
    logistic?: {
      type?: string;
    };
  };
};

type MeliShipment = {
  status?: string;
  substatus?: string;
  logistic_type?: string;
  logistic?: {
    type?: string;
  };
};

type MeliShipmentCosts = {
  senders?: Array<{
    cost?: number;
  }>;
  sender?: {
    cost?: number;
  };
  receiver?: {
    cost?: number;
  };
  cost?: number;
};

function toNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeLabel(value: string | undefined | null) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getExternalSku(item: MeliOrderItem) {
  return (
    item.item?.seller_sku ??
    item.item?.seller_custom_field ??
    item.item?.id ??
    "MELI_SKU_SIN_MAPEAR"
  );
}

function getMeliItemImageUrl(item: MeliOrderItem) {
  const firstPicture = item.item?.pictures?.find(
    (picture) => picture.secure_url || picture.url,
  );
  const imageUrl =
    item.item?.secure_thumbnail ??
    item.item?.thumbnail ??
    firstPicture?.secure_url ??
    firstPicture?.url;

  return normalizeImageUrl(imageUrl);
}

function normalizeImageUrl(value: string | undefined | null) {
  const url = value?.trim();
  if (!url) {
    return null;
  }

  if (url.startsWith("http://")) {
    return `https://${url.slice("http://".length)}`;
  }

  return url.startsWith("https://") ? url : null;
}

export function normalizeMeliOrder(params: {
  accountId: string;
  order: unknown;
  shipment?: unknown;
  shipmentCosts?: unknown;
  store: LocalStore;
  billingDetails?: unknown;
  paymentDetails?: unknown[];
  billingError?: string | null;
}): LocalMarketplaceOrder {
  const order = params.order as MeliOrder;
  const shipment = params.shipment as MeliShipment | undefined;
  const externalOrderId = String(order.id ?? "");
  const packId = getOrderPackId(order);
  const shippingId = order.shipping?.id ? String(order.shipping.id) : null;
  const realSaleRequestId =
    getOrderRequestId(order) ?? extractShipmentRealSaleId(params.shipment);
  const items = order.order_items ?? [];
  const payments = order.payments ?? [];
  const logisticType =
    shipment?.logistic?.type ??
    shipment?.logistic_type ??
    order.shipping?.logistic?.type ??
    order.shipping?.logistic_type ??
    null;
  const warehouseId = logisticType === "fulfillment" ? "wh_full" : "wh_main";

  const normalizedItems = items.map((item) => {
    const externalSku = String(getExternalSku(item)).trim();
    const quantity = toNumber(item.quantity);
    const externalSkuKey = normalizeSkuKey(externalSku);
    const mapping = params.store.onlineSkus.find(
      (sku) => normalizeSkuKey(sku.onlineSku) === externalSkuKey,
    );
    const components =
      mapping?.components
        .map((component) => ({
          masterSku: component.masterSku,
          quantityRequired: component.quantityRequired,
          consumedQuantity: quantity * component.quantityRequired,
        }))
        .filter(
          (component) =>
            component.masterSku &&
            Number.isFinite(component.quantityRequired) &&
            component.quantityRequired > 0,
        ) ?? [];
    const firstComponent = components[0] ?? null;

    return {
      externalSku,
      title: item.item?.title ?? externalSku,
      imageUrl: getMeliItemImageUrl(item),
      quantity,
      unitPrice: toNumber(item.unit_price),
      masterSku: firstComponent?.masterSku ?? null,
      consumedQuantity: firstComponent?.consumedQuantity ?? null,
      warehouseId,
      logisticType,
      components: components.length > 0 ? components : undefined,
    };
  });

  const saleFees = items.reduce((sum, item) => sum + toNumber(item.sale_fee), 0);
  const marketplaceFees = payments.reduce(
    (sum, payment) => sum + toNumber(payment.marketplace_fee),
    0,
  );
  const paymentTaxes = payments.reduce(
    (sum, payment) => sum + toNumber(payment.taxes_amount),
    0,
  );
  const billingCharges = extractBillingCharges(params.billingDetails);
  const shipmentCost = extractSellerShipmentCost(params.shipmentCosts);
  const receiverShipmentCredit = extractReceiverShipmentCredit(params.shipmentCosts);
  const paymentNetReceived = extractPaymentNetReceived(params.paymentDetails);
  const paymentCharges = extractPaymentCharges(params.paymentDetails);
  const orderedAt = order.date_closed ?? order.date_created ?? new Date().toISOString();
  const fallbackCharges = [
    {
      type: "marketplace_commission",
      amount: saleFees || marketplaceFees,
      source: "meli",
    },
    {
      type: "shipping",
      amount: shipmentCost,
      source: "meli_shipment_costs",
    },
    {
      type: "tax_withholding",
      amount: paymentTaxes,
      source: "meli",
    },
  ].filter((charge) => charge.amount > 0);
  const orderGrossAmount =
    toNumber(order.total_amount) ||
    normalizedItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const zeroNetCancellation = isZeroNetCancellation({
    billingDetails: params.billingDetails,
    billingCharges,
    grossAmount: orderGrossAmount,
    orderStatus: order.status,
    paymentDetails: params.paymentDetails,
    paymentNetReceived,
  });
  const status = getNormalizedOrderStatus(order.status, shipment, {
    zeroNetCancellation,
  });
  const isCancelled = isCancelledOrder(status);
  const grossAmount = isCancelled ? 0 : orderGrossAmount;
  const charges = isCancelled
    ? zeroNetCancellation
      ? []
      : billingCharges
    : mergePaymentCharges(
        mergeBillingAndFallbackCharges(billingCharges, fallbackCharges),
        paymentCharges,
        { receiverShipmentCredit },
      );
  const totalCharges = charges.reduce((sum, charge) => sum + charge.amount, 0);
  const hasBillingDetails = Boolean(params.billingDetails);
  const hasPaymentDerivedCharges = charges.some((charge) =>
    charge.source.startsWith("mercado_pago:"),
  );
  const expectedNetReceived = roundMoney(Math.max(0, grossAmount - totalCharges));
  const paymentNetWithShipmentCredit =
    paymentNetReceived === null
      ? null
      : roundMoney(paymentNetReceived + receiverShipmentCredit);
  const hasPaymentSettlement = paymentNetWithShipmentCredit !== null;
  const hasAgedFallbackSettlement =
    !isCancelled &&
    !hasBillingDetails &&
    !hasPaymentSettlement &&
    hasEnoughFallbackEvidence({
      orderedAt,
      grossAmount,
      charges,
    });
  const billingStatus =
    hasBillingDetails || hasPaymentSettlement || hasAgedFallbackSettlement
      ? "confirmed"
      : params.billingError
        ? "error"
        : "pending";
  const netReceivedAmount = isCancelled
    ? billingStatus === "confirmed"
      ? 0
      : null
    : hasBillingDetails
      ? paymentNetWithShipmentCredit !== null &&
        hasPaymentDerivedCharges &&
        paymentNetWithShipmentCredit < expectedNetReceived - 0.01
        ? paymentNetWithShipmentCredit
        : expectedNetReceived
      : paymentNetWithShipmentCredit !== null
        ? paymentNetWithShipmentCredit
        : hasAgedFallbackSettlement
          ? expectedNetReceived
      : null;

  return {
    id: `meli_${externalOrderId}`,
    channel: "mercado_libre",
    marketplaceAccountId: params.accountId,
    externalOrderId,
    packId,
    shippingId,
    status,
    orderedAt,
    grossAmount,
    netReceivedAmount,
    billingStatus,
    billingLastTriedAt: new Date().toISOString(),
    billingError: billingStatus === "confirmed" ? null : (params.billingError ?? null),
    currency: order.currency_id ?? "MXN",
    raw: pruneMeliOrder(order, { orderRequestId: realSaleRequestId }),
    items: normalizedItems,
    charges,
  };
}

function getOrderPackId(order: MeliOrder) {
  const packId =
    order.pack_id ?? order.packId ?? order.pack?.id ?? order.pack?.pack_id;
  return packId ? String(packId) : null;
}

function getOrderRequestId(order: MeliOrder) {
  const orderRequestId = order.order_request?.id;
  return orderRequestId ? String(orderRequestId) : null;
}

function extractShipmentRealSaleId(shipment: unknown) {
  const seen = new Set<object>();

  function visit(value: unknown): string | null {
    if (!value || typeof value !== "object") {
      return null;
    }

    if (seen.has(value)) {
      return null;
    }
    seen.add(value);

    if (Array.isArray(value)) {
      for (const child of value) {
        const found = visit(child);
        if (found) {
          return found;
        }
      }
      return null;
    }

    const record = value as Record<string, unknown>;
    const orderRequest = asRecord(record.order_request);
    const orderRequestId = orderRequest.id;
    if (typeof orderRequestId === "string" || typeof orderRequestId === "number") {
      return String(orderRequestId);
    }

    for (const key of [
      "family_pack_id",
      "familyPackId",
      "family_pack",
      "familyPack",
      "order_request_id",
      "orderRequestId",
    ]) {
      const candidate = record[key];
      if (typeof candidate === "string" || typeof candidate === "number") {
        return String(candidate);
      }
    }

    for (const child of Object.values(record)) {
      const found = visit(child);
      if (found) {
        return found;
      }
    }

    return null;
  }

  return visit(shipment);
}

export function getMeliPaymentIds(order: unknown) {
  const candidate = order as MeliOrder;

  return [
    ...new Set(
      (candidate.payments ?? [])
        .map((payment) => payment.id ?? payment.payment_id)
        .filter((paymentId): paymentId is string | number => Boolean(paymentId))
        .map(String),
    ),
  ];
}

export function isCancelledOrder(status: string | undefined | null) {
  const normalized = normalizeLabel(status);
  return (
    normalized === "cancelled" ||
    normalized === "canceled" ||
    normalized === "cancelled_partially"
  );
}

function getNormalizedOrderStatus(
  orderStatus: string | undefined | null,
  shipment: MeliShipment | undefined,
  options?: { zeroNetCancellation?: boolean },
) {
  const shipmentStatus = shipment?.status;
  const shipmentSubstatus = shipment?.substatus;

  if (options?.zeroNetCancellation) {
    return "cancelled";
  }

  if (isCancelledOrder(orderStatus) || isCancelledOrder(shipmentStatus)) {
    return "cancelled";
  }

  if (normalizeLabel(shipmentSubstatus).includes("cancel")) {
    return "cancelled";
  }

  return orderStatus ?? "unknown";
}

function extractPaymentNetReceived(paymentDetails: unknown[] | undefined) {
  let total = 0;
  let found = false;

  for (const payment of (paymentDetails ?? []) as MeliPaymentDetail[]) {
    const net =
      toOptionalNumber(payment.transaction_details?.net_received_amount) ??
      null;

    if (net === null) {
      continue;
    }

    found = true;
    total += Math.max(0, net);
  }

  return found ? roundMoney(total) : null;
}

function extractPaymentCharges(paymentDetails: unknown[] | undefined) {
  const chargeByType = new Map<
    string,
    { type: string; amount: number; source: string }
  >();

  for (const payment of (paymentDetails ?? []) as MeliPaymentDetail[]) {
    for (const charge of payment.charges_details ?? []) {
      if (normalizeLabel(charge.accounts?.from) !== "collector") {
        continue;
      }

      const amount = Math.max(
        0,
        toNumber(charge.amounts?.original) - toNumber(charge.amounts?.refunded),
      );

      if (amount <= 0) {
        continue;
      }

      const type = mapPaymentChargeType(charge);
      const existing = chargeByType.get(type);
      chargeByType.set(type, {
        type,
        amount: (existing?.amount ?? 0) + amount,
        source: getPaymentChargeSource(charge),
      });
    }

    for (const fee of payment.fee_details ?? []) {
      if (normalizeLabel(fee.fee_payer) !== "collector") {
        continue;
      }

      const amount = toNumber(fee.amount);
      if (amount <= 0) {
        continue;
      }

      const type = mapPaymentChargeType(fee);
      const existing = chargeByType.get(type);
      chargeByType.set(type, {
        type,
        amount: Math.max(existing?.amount ?? 0, amount),
        source: existing?.source ?? "mercado_pago:fee_details",
      });
    }
  }

  return [...chargeByType.values()]
    .map((charge) => ({
      ...charge,
      amount: roundMoney(charge.amount),
    }))
    .filter((charge) => charge.amount > 0);
}

function hasEnoughFallbackEvidence(params: {
  orderedAt: string;
  grossAmount: number;
  charges: Array<{ type: string; amount: number; source: string }>;
}) {
  if (params.grossAmount <= 0 || params.charges.length === 0) {
    return false;
  }

  const orderedAtMs = new Date(params.orderedAt).getTime();
  if (!Number.isFinite(orderedAtMs)) {
    return false;
  }

  const billingGraceMs = 48 * 60 * 60 * 1000;
  if (Date.now() - orderedAtMs < billingGraceMs) {
    return false;
  }

  const hasMarketplaceCommission = params.charges.some(
    (charge) => charge.type === "marketplace_commission",
  );
  const hasMoneyDetail = params.charges.some(
    (charge) =>
      charge.type === "shipping" ||
      charge.type === "tax_withholding" ||
      charge.source.startsWith("mercado_pago:"),
  );

  return hasMarketplaceCommission && hasMoneyDetail;
}

function isZeroNetCancellation(params: {
  billingDetails: unknown;
  billingCharges: Array<{ type: string; amount: number; source: string }>;
  grossAmount: number;
  orderStatus: string | undefined | null;
  paymentDetails: unknown[] | undefined;
  paymentNetReceived: number | null;
}) {
  if (
    !params.billingDetails ||
    params.grossAmount <= 0 ||
    params.paymentNetReceived !== 0
  ) {
    return false;
  }

  if (hasRefundedOrCancelledPayment(params.paymentDetails)) {
    return true;
  }

  if (hasBillingCreditMovements(params.billingDetails)) {
    return params.billingCharges.length === 0;
  }

  const billingChargeTotal = params.billingCharges.reduce(
    (sum, charge) => sum + charge.amount,
    0,
  );

  return (
    normalizeLabel(params.orderStatus) === "paid" &&
    billingChargeTotal >= params.grossAmount
  );
}

function hasRefundedOrCancelledPayment(paymentDetails: unknown[] | undefined) {
  return ((paymentDetails ?? []) as MeliPaymentDetail[]).some((payment) => {
    const status = normalizeLabel(payment.status);
    return (
      status.includes("refund") ||
      status.includes("cancel") ||
      status.includes("chargeback") ||
      status.includes("charged_back")
    );
  });
}

function hasBillingCreditMovements(billingDetails: unknown) {
  const billing = billingDetails as MeliBillingOrderDetail | undefined;
  return (billing?.details ?? []).some((detail) => {
    const charge = detail.charge_info;
    const type = normalizeLabel(charge?.detail_type);
    const text = normalizeLabel(charge?.transaction_detail);
    return (
      type === "credit" ||
      text.includes("devol") ||
      text.includes("refund") ||
      text.includes("bonif") ||
      text.includes("cancel")
    );
  });
}

function extractBillingCharges(billingDetails: unknown) {
  const billing = billingDetails as MeliBillingOrderDetail | undefined;
  const chargeByType = new Map<string, number>();

  for (const detail of billing?.details ?? []) {
    const charge = detail.charge_info;
    const amount = toNumber(charge?.detail_amount);

    const detailType = normalizeLabel(charge?.detail_type);
    if (!charge || amount <= 0 || charge.debited_from_operation === "NO") {
      continue;
    }

    if (detailType !== "charge" && detailType !== "credit") {
      continue;
    }

    const type = mapBillingChargeType(charge);
    const signedAmount = detailType === "credit" ? -amount : amount;
    chargeByType.set(type, (chargeByType.get(type) ?? 0) + signedAmount);
  }

  const taxWithholding = (billing?.payment_info ?? []).reduce((sum, payment) => {
    return (
      sum +
      (payment.tax_details ?? []).reduce((taxSum, tax) => {
        const original = toNumber(tax.original_amount);
        const refunded = toNumber(tax.refunded_amount);
        return taxSum + Math.max(0, original - refunded);
      }, 0)
    );
  }, 0);
  if (taxWithholding > 0) {
    chargeByType.set(
      "tax_withholding",
      (chargeByType.get("tax_withholding") ?? 0) + taxWithholding,
    );
  }

  return [...chargeByType.entries()]
    .map(([type, amount]) => ({
      type,
      amount: roundMoney(amount),
      source: "meli_billing",
    }))
    .filter((charge) => charge.amount > 0);
}

function mergeBillingAndFallbackCharges(
  billingCharges: Array<{ type: string; amount: number; source: string }>,
  fallbackCharges: Array<{ type: string; amount: number; source: string }>,
) {
  if (billingCharges.length === 0) {
    return fallbackCharges;
  }

  const merged = new Map<string, { type: string; amount: number; source: string }>();

  for (const charge of billingCharges) {
    merged.set(charge.type, charge);
  }

  for (const charge of fallbackCharges) {
    const existing = merged.get(charge.type);
    const hasTwoShippingSources =
      existing &&
      charge.type === "shipping" &&
      charge.source === "meli_shipment_costs";

    if (hasTwoShippingSources) {
      merged.set(charge.type, existing.amount <= charge.amount ? existing : charge);
      continue;
    }

    if (merged.has(charge.type)) {
      continue;
    }

    merged.set(charge.type, {
      ...charge,
      source: "meli_fallback",
    });
  }

  return [...merged.values()];
}

function mergePaymentCharges(
  charges: Array<{ type: string; amount: number; source: string }>,
  paymentCharges: Array<{ type: string; amount: number; source: string }>,
  options: { receiverShipmentCredit?: number } = {},
) {
  if (paymentCharges.length === 0) {
    return charges;
  }

  const merged = new Map(charges.map((charge) => [charge.type, charge]));

  for (const charge of paymentCharges) {
    const existing = merged.get(charge.type);
    const existingMarketplaceCommission = merged.get("marketplace_commission");

    if (
      charge.type === "other" &&
      charge.source === "mercado_pago:fee_details" &&
      existingMarketplaceCommission &&
      amountsEqual(charge.amount, existingMarketplaceCommission.amount)
    ) {
      continue;
    }

    if (charge.type === "shipping") {
      if (!existing) {
        merged.set("fulfillment", {
          type: "fulfillment",
          amount: charge.amount,
          source: `${charge.source}:detected_full_charge`,
        });
        continue;
      }

      const extraFulfillment = roundMoney(charge.amount - existing.amount);
      const explainedByReceiverCredit =
        extraFulfillment > 0 &&
        Math.abs(extraFulfillment - (options.receiverShipmentCredit ?? 0)) <= 0.01;
      if (explainedByReceiverCredit) {
        continue;
      }

      if (extraFulfillment > 0.01) {
        merged.set("fulfillment", {
          type: "fulfillment",
          amount: extraFulfillment,
          source: `${charge.source}:extra_over_meli_shipping`,
        });
      }
      continue;
    }

    if (!existing || charge.amount > existing.amount + 0.01) {
      merged.set(charge.type, charge);
    }
  }

  return [...merged.values()];
}

function extractSellerShipmentCost(shipmentCosts: unknown) {
  const costs = shipmentCosts as MeliShipmentCosts | undefined;
  const senderCosts = (costs?.senders ?? [])
    .map((sender) => toNumber(sender.cost))
    .filter((amount) => amount > 0);

  if (senderCosts.length > 0) {
    return roundMoney(senderCosts.reduce((sum, amount) => sum + amount, 0));
  }

  const singleSenderCost = toNumber(costs?.sender?.cost);
  if (singleSenderCost > 0) {
    return roundMoney(singleSenderCost);
  }

  return 0;
}

function extractReceiverShipmentCredit(shipmentCosts: unknown) {
  const costs = shipmentCosts as MeliShipmentCosts | undefined;
  return roundMoney(toNumber(costs?.receiver?.cost));
}

function mapBillingChargeType(charge: NonNullable<MeliBillingOrderDetail["details"]>[number]["charge_info"]) {
  const subType = charge?.detail_sub_type;
  const label = normalizeLabel(charge?.transaction_detail);

  if (subType === "CV" || label.includes("cargo por venta")) {
    return "marketplace_commission";
  }

  if (subType === "CFF" || label.includes("envio")) {
    return "shipping";
  }

  if (subType === "CFF" || label.includes("envio") || label.includes("envíos")) {
    return "shipping";
  }

  if (label.includes("publicidad")) {
    return "advertising";
  }

  if (label.includes("almacen")) {
    return "storage";
  }

  return "other";
}

function mapPaymentChargeType(charge: {
  name?: string;
  type?: string;
}) {
  const type = normalizeLabel(charge.type);
  const label = normalizeLabel(charge.name);

  if (type === "fee" || label.includes("meli_fee") || label.includes("application_fee")) {
    return "marketplace_commission";
  }

  if (type === "tax" || label.includes("tax_withholding")) {
    return "tax_withholding";
  }

  if (type === "shipping" || label.includes("shp") || label.includes("fulfillment")) {
    return "shipping";
  }

  if (label.includes("storage") || label.includes("almacen")) {
    return "storage";
  }

  if (label.includes("financing") || label.includes("financi")) {
    return "financing";
  }

  return "other";
}

function getPaymentChargeSource(charge: { name?: string; type?: string }) {
  const label = normalizeLabel(charge.name || charge.type || "charge");
  return `mercado_pago:${label || "charge"}`;
}

function toOptionalNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function amountsEqual(left: number, right: number) {
  return Math.abs(left - right) <= 0.01;
}

type MeliPrunedRecord = Record<string, unknown>;

function asRecord(value: unknown): MeliPrunedRecord {
  return value && typeof value === "object" ? (value as MeliPrunedRecord) : {};
}

function asRecordArray(value: unknown): MeliPrunedRecord[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

export function pruneMeliOrder(
  order: unknown,
  options?: { orderRequestId?: string | null },
): MeliPrunedRecord {
  const source = asRecord(order);
  const pack = asRecord(source.pack);
  const orderRequest = asRecord(source.order_request);
  const orderRequestId =
    options?.orderRequestId ?? orderRequest.id;
  const shipping = asRecord(source.shipping);
  const logistic = asRecord(shipping.logistic);

  return {
    id: source.id,
    pack_id: source.pack_id,
    packId: source.packId,
    pack: source.pack ? {
      id: pack.id,
      pack_id: pack.pack_id,
    } : null,
    order_request: orderRequestId ? {
      id: orderRequestId,
    } : null,
    status: source.status,
    date_created: source.date_created,
    date_closed: source.date_closed,
    total_amount: source.total_amount,
    paid_amount: source.paid_amount,
    currency_id: source.currency_id,
    order_items: asRecordArray(source.order_items).map((item) => {
      const itemRecord = asRecord(item.item);

      return {
        item: item.item ? {
          id: itemRecord.id,
          title: itemRecord.title,
          seller_sku: itemRecord.seller_sku,
          seller_custom_field: itemRecord.seller_custom_field,
          variation_id: itemRecord.variation_id,
        } : undefined,
        quantity: item.quantity,
        unit_price: item.unit_price,
        sale_fee: item.sale_fee,
      };
    }),
    payments: asRecordArray(source.payments).map((payment) => ({
      id: payment.id,
      payment_id: payment.payment_id,
      marketplace_fee: payment.marketplace_fee,
      taxes_amount: payment.taxes_amount,
      total_paid_amount: payment.total_paid_amount,
    })),
    shipping: source.shipping ? {
      id: shipping.id,
      logistic_type: shipping.logistic_type,
      logistic: shipping.logistic ? {
        type: logistic.type,
      } : undefined,
    } : undefined,
  };
}
