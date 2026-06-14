export function extractPackOrderIds(pack: unknown) {
  const ids = new Set<string>();
  const seen = new Set<object>();

  collectFromContainer(pack, ids, seen, false);

  return [...ids];
}

export function extractPackFamilyPackIds(pack: unknown) {
  const ids = new Set<string>();
  const seen = new Set<object>();

  collectFamilyPackIds(pack, ids, seen);

  return [...ids];
}

export function extractOrderRequestIds(payload: unknown) {
  const ids = new Set<string>();
  const seen = new Set<object>();

  collectOrderRequestIds(payload, ids, seen);

  return [...ids];
}

export function referencesMeliIdentifier(payload: unknown, identifier: string) {
  const normalizedIdentifier = normalizeIdentifier(identifier);
  if (!normalizedIdentifier) {
    return false;
  }

  if (
    extractPackFamilyPackIds(payload).includes(normalizedIdentifier) ||
    extractOrderRequestIds(payload).includes(normalizedIdentifier)
  ) {
    return true;
  }

  return hasExactIdentifierValue(payload, normalizedIdentifier, new Set<object>());
}

const CONTAINER_KEYS = [
  "orders",
  "pack_orders",
  "order_ids",
  "orderIds",
  "results",
  "related_orders",
  "relatedOrders",
  "data",
  "content",
  "items",
  "children",
  "shipment_orders",
  "shipments",
  "packages",
  "pack",
  "response",
] as const;

const ORDER_COLLECTION_KEYS = new Set<string>([
  "orders",
  "pack_orders",
  "order_ids",
  "orderIds",
  "results",
  "related_orders",
  "relatedOrders",
  "data",
  "content",
  "items",
  "children",
  "shipment_orders",
  "shipments",
  "packages",
  "response",
]);

function collectFromContainer(
  value: unknown,
  ids: Set<string>,
  seen: Set<object>,
  readSelf: boolean,
) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectOrderEntry(entry, ids, seen);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  if (seen.has(value)) {
    return;
  }
  seen.add(value);

  if (readSelf) {
    const orderId = readPackOrderId(value);
    if (orderId) {
      ids.add(orderId);
    }
  }

  collectKnownChildren(value, ids, seen);
}

function collectOrderEntry(entry: unknown, ids: Set<string>, seen: Set<object>) {
  const orderId = readPackOrderId(entry);
  if (orderId) {
    ids.add(orderId);
  }

  collectFromContainer(entry, ids, seen, false);
}

function collectKnownChildren(value: unknown, ids: Set<string>, seen: Set<object>) {
  if (!value || typeof value !== "object") {
    return;
  }

  const record = value as Record<string, unknown>;

  for (const key of CONTAINER_KEYS) {
    const child = record[key];
    if (child === undefined || child === null) {
      continue;
    }

    const mayBeOrderCollection = ORDER_COLLECTION_KEYS.has(key);
    collectFromContainer(child, ids, seen, mayBeOrderCollection);

    if (mayBeOrderCollection && !Array.isArray(child)) {
      collectObjectValues(child, ids, seen);
    }
  }
}

function collectObjectValues(value: unknown, ids: Set<string>, seen: Set<object>) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return;
  }

  for (const child of Object.values(value as Record<string, unknown>)) {
    collectOrderEntry(child, ids, seen);
  }
}

function readPackOrderId(entry: unknown): string {
  if (typeof entry === "string" || typeof entry === "number") {
    return String(entry);
  }

  if (!entry || typeof entry !== "object") {
    return "";
  }

  const candidate = entry as {
    id?: string | number;
    order_id?: string | number;
    orderId?: string | number;
    order?: { id?: string | number };
    resource?: string;
  };
  const directId =
    candidate.order_id ?? candidate.orderId ?? candidate.order?.id ?? candidate.id;

  if (directId) {
    return String(directId);
  }

  const resourceMatch = candidate.resource?.match(/\/orders\/(\d+)/);
  return resourceMatch?.[1] ?? "";
}

function collectFamilyPackIds(
  value: unknown,
  ids: Set<string>,
  seen: Set<object>,
) {
  if (!value || typeof value !== "object") {
    return;
  }

  if (seen.has(value)) {
    return;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((entry) => collectFamilyPackIds(entry, ids, seen));
    return;
  }

  const record = value as Record<string, unknown>;
  for (const [key, child] of Object.entries(record)) {
    if (
      key === "family_pack_id" ||
      key === "familyPackId" ||
      key === "family_pack" ||
      key === "familyPack"
    ) {
      const id = readPackId(child);
      if (id) {
        ids.add(id);
      }
    }

    collectFamilyPackIds(child, ids, seen);
  }
}

function readPackId(value: unknown) {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (!value || typeof value !== "object") {
    return "";
  }

  const candidate = value as {
    id?: string | number;
    pack_id?: string | number;
    family_pack_id?: string | number;
    familyPackId?: string | number;
  };

  const id =
    candidate.family_pack_id ??
    candidate.familyPackId ??
    candidate.pack_id ??
    candidate.id;

  return id ? String(id) : "";
}

function collectOrderRequestIds(
  value: unknown,
  ids: Set<string>,
  seen: Set<object>,
) {
  if (!value || typeof value !== "object") {
    return;
  }

  if (seen.has(value)) {
    return;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((entry) => collectOrderRequestIds(entry, ids, seen));
    return;
  }

  const record = value as Record<string, unknown>;
  for (const [key, child] of Object.entries(record)) {
    if (
      key === "order_request" ||
      key === "orderRequest" ||
      key === "order_request_id" ||
      key === "orderRequestId"
    ) {
      const id = readRequestId(child);
      if (id) {
        ids.add(id);
      }
    }

    collectOrderRequestIds(child, ids, seen);
  }
}

function readRequestId(value: unknown) {
  if (typeof value === "string" || typeof value === "number") {
    return normalizeIdentifier(value);
  }

  if (!value || typeof value !== "object") {
    return "";
  }

  const candidate = value as {
    id?: string | number;
    order_request_id?: string | number;
    orderRequestId?: string | number;
  };
  return normalizeIdentifier(
    candidate.order_request_id ?? candidate.orderRequestId ?? candidate.id,
  );
}

function hasExactIdentifierValue(
  value: unknown,
  identifier: string,
  seen: Set<object>,
): boolean {
  if (typeof value === "string" || typeof value === "number") {
    return normalizeIdentifier(value) === identifier;
  }

  if (!value || typeof value !== "object") {
    return false;
  }

  if (seen.has(value)) {
    return false;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.some((entry) =>
      hasExactIdentifierValue(entry, identifier, seen),
    );
  }

  return Object.values(value as Record<string, unknown>).some((child) =>
    hasExactIdentifierValue(child, identifier, seen),
  );
}

function normalizeIdentifier(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") {
    return "";
  }

  const normalized = String(value).trim();
  return /^\d{8,}$/.test(normalized) ? normalized : "";
}
