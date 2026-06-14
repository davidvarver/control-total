type MarketplaceOrderLike = {
  channel?: string | null;
  marketplaceAccountId?: string | number | null;
  externalOrderId?: string | number | null;
  packId?: string | number | null;
  shippingId?: string | number | null;
  status?: string | null;
  orderedAt?: string | Date | null;
  grossAmount?: string | number | null;
  currency?: string | null;
  charges?: Array<{
    type?: string | null;
    amount?: string | number | null;
    source?: string | null;
  }> | null;
  items?: Array<{
    externalSku?: string | null;
    title?: string | null;
    unitPrice?: string | number | null;
    quantity?: string | number | null;
  }> | null;
  raw?: unknown;
};

type RawOrderLike = {
  pack_id?: string | number | null;
  pack?: { id?: string | number | null; pack_id?: string | number | null } | null;
  shipping?: { id?: string | number | null } | null;
  payments?: Array<{
    id?: string | number | null;
    payment_id?: string | number | null;
  }> | null;
  order_request?: { id?: string | number | null } | null;
};

function asRawOrder(raw: unknown) {
  return (raw ?? {}) as RawOrderLike;
}

function cleanId(value: string | number | null | undefined) {
  const id = value === null || value === undefined ? "" : String(value).trim();
  return id.length > 0 ? id : null;
}

function getRawOrderRequestId(order: Pick<MarketplaceOrderLike, "raw">) {
  return cleanId(asRawOrder(order.raw).order_request?.id);
}

function getPackId(order: MarketplaceOrderLike) {
  const raw = asRawOrder(order.raw);
  return (
    cleanId(order.packId) ??
    cleanId(raw.pack_id) ??
    cleanId(raw.pack?.id) ??
    cleanId(raw.pack?.pack_id)
  );
}

function getShippingId(order: MarketplaceOrderLike) {
  const raw = asRawOrder(order.raw);
  return cleanId(order.shippingId) ?? cleanId(raw.shipping?.id);
}

function getAccountId(order: MarketplaceOrderLike) {
  return cleanId(order.marketplaceAccountId);
}

function getOrderTime(order: MarketplaceOrderLike) {
  if (!order.orderedAt) {
    return null;
  }

  const time =
    order.orderedAt instanceof Date
      ? order.orderedAt.getTime()
      : new Date(order.orderedAt).getTime();
  return Number.isFinite(time) ? time : null;
}

function getMoney(value: string | number | null | undefined) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getShippingAmount(order: MarketplaceOrderLike) {
  return (order.charges ?? [])
    .filter((charge) => charge.type === "shipping")
    .reduce((sum, charge) => sum + (getMoney(charge.amount) ?? 0), 0);
}

function isCancelledStatus(status: string | null | undefined) {
  const normalized = normalizeText(status);
  return (
    normalized === "cancelled" ||
    normalized === "canceled" ||
    normalized === "cancelled_partially" ||
    normalized.includes("cancel")
  );
}

function getItemUnits(order: MarketplaceOrderLike) {
  return (order.items ?? []).reduce(
    (sum, item) => sum + (getMoney(item.quantity) ?? 0),
    0,
  );
}

function hasCompatibleUnitCount(left: MarketplaceOrderLike, right: MarketplaceOrderLike) {
  const leftUnits = getItemUnits(left);
  const rightUnits = getItemUnits(right);
  if (leftUnits <= 0 || rightUnits <= 0) {
    return false;
  }

  const smaller = Math.min(leftUnits, rightUnits);
  const larger = Math.max(leftUnits, rightUnits);
  return larger / smaller <= 3;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function getItemUnitKeys(order: MarketplaceOrderLike) {
  return new Set(
    (order.items ?? [])
      .map((item) => {
        const skuOrTitle = normalizeText(item.externalSku) || normalizeText(item.title);
        const unitPrice = getMoney(item.unitPrice);
        return skuOrTitle && unitPrice !== null ? `${skuOrTitle}:${roundMoney(unitPrice)}` : "";
      })
      .filter(Boolean),
  );
}

function hasSharedItemUnitKey(left: MarketplaceOrderLike, right: MarketplaceOrderLike) {
  const leftKeys = getItemUnitKeys(left);
  if (leftKeys.size === 0) {
    return false;
  }

  for (const key of getItemUnitKeys(right)) {
    if (leftKeys.has(key)) {
      return true;
    }
  }

  return false;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function getMeliPaymentIds(order: Pick<MarketplaceOrderLike, "raw">) {
  const raw = asRawOrder(order.raw);
  return [
    ...new Set(
      (raw.payments ?? [])
        .map((payment) => cleanId(payment.id ?? payment.payment_id))
        .filter((paymentId): paymentId is string => Boolean(paymentId)),
    ),
  ].sort();
}

export function getMarketplaceRealSaleKey(order: MarketplaceOrderLike) {
  const orderRequestId = getRawOrderRequestId(order);
  if (orderRequestId) {
    return `order-request:${orderRequestId}`;
  }

  const packId = getPackId(order);
  if (packId) {
    return `pack:${packId}`;
  }

  const paymentIds = getMeliPaymentIds(order);
  if (paymentIds.length > 0) {
    return `payment:${paymentIds.join("+")}`;
  }

  const shippingId = getShippingId(order);
  if (shippingId) {
    return `shipping:${shippingId}`;
  }

  const externalOrderId = cleanId(order.externalOrderId);
  return externalOrderId ? `order:${externalOrderId}` : "";
}

export function getMarketplaceSaleDisplayId(
  orderOrGroup: MarketplaceOrderLike | MarketplaceOrderLike[],
  realSaleKey?: string,
) {
  const orders = Array.isArray(orderOrGroup) ? orderOrGroup : [orderOrGroup];
  const keyId = getDisplayIdFromRealSaleKey(realSaleKey);
  if (keyId) {
    return keyId;
  }

  const orderRequestIds = uniqueIds(orders.map((order) => getRawOrderRequestId(order)));
  if (orderRequestIds.length > 0) {
    return orderRequestIds[0]!;
  }

  const packIds = uniqueIds(orders.map((order) => getPackId(order)));
  if (packIds.length > 0) {
    return packIds[0]!;
  }

  const paymentIds = uniqueIds(orders.flatMap((order) => getMeliPaymentIds(order)));
  if (paymentIds.length > 0) {
    return paymentIds.join("+");
  }

  const shippingIds = uniqueIds(orders.map((order) => getShippingId(order)));
  if (shippingIds.length > 0) {
    return shippingIds[0]!;
  }

  return cleanId(orders[0]?.externalOrderId) ?? "";
}

export function marketplaceOrderMatchesIdentifier(
  order: MarketplaceOrderLike,
  identifier: string | number | null | undefined,
) {
  const target = cleanId(identifier);
  if (!target) {
    return false;
  }

  return getMarketplaceOrderReferenceIds(order).includes(target);
}

export function marketplaceRealSaleMatchesIdentifier(
  group: MarketplaceOrderLike[],
  identifier: string | number | null | undefined,
  realSaleKey?: string,
) {
  const target = cleanId(identifier);
  if (!target) {
    return false;
  }

  return (
    getMarketplaceSaleDisplayId(group, realSaleKey) === target ||
    realSaleKey === target ||
    group.some((order) => marketplaceOrderMatchesIdentifier(order, target))
  );
}

function getMarketplaceOrderReferenceIds(order: MarketplaceOrderLike) {
  return uniqueIds([
    cleanId(order.externalOrderId),
    getRawOrderRequestId(order),
    getPackId(order),
    getShippingId(order),
    ...getMeliPaymentIds(order),
    getMarketplaceRealSaleKey(order),
    getMarketplaceSaleDisplayId(order),
  ]);
}

function getDisplayIdFromRealSaleKey(realSaleKey: string | null | undefined) {
  if (!realSaleKey) {
    return null;
  }

  for (const prefix of ["order-request:", "pack:"]) {
    if (realSaleKey.startsWith(prefix)) {
      return realSaleKey.slice(prefix.length);
    }
  }

  return null;
}

function uniqueIds(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

export function isLikelyMeliSplitShipmentSibling(
  left: MarketplaceOrderLike,
  right: MarketplaceOrderLike,
) {
  if (left === right) {
    return false;
  }

  if (
    (left.channel && left.channel !== "mercado_libre") ||
    (right.channel && right.channel !== "mercado_libre")
  ) {
    return false;
  }

  const leftOrderId = cleanId(left.externalOrderId);
  const rightOrderId = cleanId(right.externalOrderId);
  if (leftOrderId && rightOrderId && leftOrderId === rightOrderId) {
    return false;
  }

  const leftAccountId = getAccountId(left);
  const rightAccountId = getAccountId(right);
  if (leftAccountId && rightAccountId && leftAccountId !== rightAccountId) {
    return false;
  }

  const leftPackId = getPackId(left);
  const rightPackId = getPackId(right);
  if (!leftPackId || !rightPackId || leftPackId === rightPackId) {
    return false;
  }

  const leftShippingId = getShippingId(left);
  const rightShippingId = getShippingId(right);
  if (!leftShippingId || !rightShippingId || leftShippingId === rightShippingId) {
    return false;
  }

  const leftGross = getMoney(left.grossAmount);
  const rightGross = getMoney(right.grossAmount);
  if (leftGross === null || rightGross === null) {
    return false;
  }

  const leftCancelled = isCancelledStatus(left.status);
  const rightCancelled = isCancelledStatus(right.status);
  const hasPositiveGross = leftGross > 0 || rightGross > 0;
  const hasCancelledZeroGrossSibling =
    (leftCancelled && leftGross <= 0 && rightGross > 0) ||
    (rightCancelled && rightGross <= 0 && leftGross > 0);
  if (
    !hasPositiveGross ||
    ((leftGross <= 0 || rightGross <= 0) && !hasCancelledZeroGrossSibling)
  ) {
    return false;
  }

  const leftTime = getOrderTime(left);
  const rightTime = getOrderTime(right);
  if (leftTime === null || rightTime === null || Math.abs(leftTime - rightTime) > 120_000) {
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

  const sameGross = Math.abs(leftGross - rightGross) <= 0.01;
  const sharedItemUnit = hasSharedItemUnitKey(left, right);
  if (!sameGross && !sharedItemUnit) {
    return false;
  }

  if (!sameGross && sharedItemUnit && !hasCompatibleUnitCount(left, right)) {
    return false;
  }

  const leftShippingAmount = getShippingAmount(left);
  const rightShippingAmount = getShippingAmount(right);
  return leftShippingAmount > 0 || rightShippingAmount > 0;
}

function getLikelySplitShipmentBucket(order: MarketplaceOrderLike) {
  if (order.channel && order.channel !== "mercado_libre") {
    return null;
  }

  const accountId = getAccountId(order);
  const orderedAt = getOrderTime(order);
  const grossAmount = getMoney(order.grossAmount);
  const packId = getPackId(order);
  const shippingId = getShippingId(order);

  if (
    !accountId ||
    orderedAt === null ||
    grossAmount === null ||
    !packId ||
    !shippingId
  ) {
    return null;
  }

  const fiveMinuteWindow = Math.floor(orderedAt / (5 * 60_000));
  return `${accountId}:${fiveMinuteWindow}:${order.currency ?? ""}`;
}

export function groupMarketplaceOrdersIntoRealSales<T extends MarketplaceOrderLike>(
  orders: T[],
) {
  const parents = orders.map((_, index) => index);

  function find(index: number): number {
    const parent = parents[index] ?? index;
    if (parent === index) {
      return index;
    }

    const root = find(parent);
    parents[index] = root;
    return root;
  }

  function union(left: number, right: number) {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) {
      parents[rightRoot] = leftRoot;
    }
  }

  const firstByKey = new Map<string, number>();
  orders.forEach((order, index) => {
    const key = getMarketplaceRealSaleKey(order);
    if (!key) {
      return;
    }

    const first = firstByKey.get(key);
    if (first === undefined) {
      firstByKey.set(key, index);
      return;
    }

    union(first, index);
  });

  const splitBuckets = new Map<string, number[]>();
  orders.forEach((order, index) => {
    const bucketKey = getLikelySplitShipmentBucket(order);
    if (!bucketKey) {
      return;
    }

    const bucket = splitBuckets.get(bucketKey) ?? [];
    bucket.push(index);
    splitBuckets.set(bucketKey, bucket);
  });

  for (const bucket of splitBuckets.values()) {
    for (let leftIndex = 0; leftIndex < bucket.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < bucket.length; rightIndex += 1) {
        const leftOrderIndex = bucket[leftIndex]!;
        const rightOrderIndex = bucket[rightIndex]!;
        if (
          isLikelyMeliSplitShipmentSibling(
            orders[leftOrderIndex]!,
            orders[rightOrderIndex]!,
          )
        ) {
          union(leftOrderIndex, rightOrderIndex);
        }
      }
    }
  }

  const groups = new Map<number, T[]>();
  orders.forEach((order, index) => {
    const root = find(index);
    const group = groups.get(root) ?? [];
    group.push(order);
    groups.set(root, group);
  });

  return [...groups.values()].map((group) => {
    const primaryKey = getMarketplaceRealSaleKey(group[0]!) || "";
    const key =
      group.every((order) => getMarketplaceRealSaleKey(order) === primaryKey)
        ? primaryKey
        : `split:${group
            .map((order) => cleanId(order.externalOrderId) ?? getMarketplaceRealSaleKey(order))
            .sort()
            .join("+")}`;

    return {
      key,
      orders: group.sort((a, b) => {
        const left = getOrderTime(a) ?? 0;
        const right = getOrderTime(b) ?? 0;
        return left - right;
      }),
    };
  });
}
