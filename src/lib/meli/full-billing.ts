import {
  getMarketplaceAccount,
  saveFullBillingCharges,
  upsertMarketplaceAccount,
  type LocalFullBillingCharge,
} from "../server/local-store";
import {
  getMeliFullBillingDetails,
  refreshMeliToken,
  type MeliFullBillingDetailsResponse,
} from "./client";

const FULL_BILLING_PAGE_LIMIT = 150;
const FULL_BILLING_MAX_PAGES = 20;

type FullBillingBucket = LocalFullBillingCharge["ageBucket"];

const BUCKET_LABELS: Record<FullBillingBucket, string> = {
  up_to_2_months: "Hasta 2 meses",
  "2_to_4_months": "De 2 a 4 meses",
  "4_to_6_months": "De 4 a 6 meses",
  "6_to_12_months": "De 6 a 12 meses",
  over_12_months: "Mas de 12 meses",
  other: "Otros cargos Full",
};

const BUCKET_ALIASES: Array<{
  bucket: Exclude<FullBillingBucket, "other">;
  aliases: string[];
}> = [
  {
    bucket: "up_to_2_months",
    aliases: ["hasta2", "hasta_2", "up_to_2", "less_than_2", "0_2"],
  },
  {
    bucket: "2_to_4_months",
    aliases: ["2a4", "2_4", "from_2_to_4", "two_to_four"],
  },
  {
    bucket: "4_to_6_months",
    aliases: ["4a6", "4_6", "from_4_to_6", "four_to_six"],
  },
  {
    bucket: "6_to_12_months",
    aliases: ["6a12", "6_12", "from_6_to_12", "six_to_twelve"],
  },
  {
    bucket: "over_12_months",
    aliases: ["mas12", "mas_de_12", "more_than_12", "over_12", "12_plus"],
  },
];

export type FullBillingSyncResult = {
  accountId: string;
  period: string;
  syncedAt: string;
  fetchedRows: number;
  charges: LocalFullBillingCharge[];
  totalAmount: number;
  totalUnits: number;
};

export async function syncMeliFullBilling(params: {
  accountId: string;
  period: string;
}) {
  const account = await getFreshMarketplaceAccount(params.accountId);
  const syncedAt = new Date().toISOString();
  const rows = await fetchAllFullBillingRows({
    accessToken: account.accessToken,
    period: params.period,
  });
  const charges = normalizeFullBillingRows({
    accountId: account.id,
    period: params.period,
    syncedAt,
    rows,
  });
  const saved = await saveFullBillingCharges({
    accountId: account.id,
    period: params.period,
    charges,
  });

  return {
    accountId: account.id,
    period: params.period,
    syncedAt,
    fetchedRows: rows.length,
    charges: saved.charges,
    totalAmount: saved.totalAmount,
    totalUnits: saved.totalUnits,
  } satisfies FullBillingSyncResult;
}

export function normalizeFullBillingRows(params: {
  accountId: string;
  period: string;
  syncedAt: string;
  rows: unknown[];
}) {
  const charges: LocalFullBillingCharge[] = [];

  params.rows.forEach((row, rowIndex) => {
    const bucketCharges = extractBucketCharges(row);
    const productTitle = getString(row, [
      "title",
      "product_title",
      "item_title",
      "product_name",
      "name",
      "description",
    ]);
    const base = {
      accountId: params.accountId,
      period: params.period,
      syncedAt: params.syncedAt,
      productTitle: productTitle || "Producto Full",
      externalSku: getString(row, [
        "seller_sku",
        "sku",
        "seller_custom_field",
        "external_sku",
      ]),
      externalProductId: getString(row, [
        "product_id",
        "item_id",
        "ml_product_id",
        "code",
      ]),
      inventoryId: getString(row, ["inventory_id", "fulfillment_inventory_id"]),
      listingId: getString(row, ["listing_id", "publication_id"]),
      size: getString(row, ["size", "dimensions", "storage_size"]),
      detailType: getString(row, ["detail_type"]),
      chargeType: getString(row, [
        "charge_type",
        "concept_type",
        "concept",
        "type",
        "description",
      ]),
      currency: getString(row, ["currency", "currency_id"]),
      raw: row,
    };

    if (bucketCharges.length > 0) {
      for (const bucketCharge of bucketCharges) {
        charges.push({
          ...base,
          id: buildChargeId(params.accountId, params.period, rowIndex, bucketCharge.bucket),
          ageBucket: bucketCharge.bucket,
          amount: bucketCharge.amount,
          units: bucketCharge.units,
        });
      }
      return;
    }

    const amount = getNumber(row, [
      "amount",
      "total_amount",
      "charge_amount",
      "charged_amount",
      "charges_total",
      "total",
      "value",
    ]);

    if (amount === 0) {
      return;
    }

    charges.push({
      ...base,
      id: buildChargeId(params.accountId, params.period, rowIndex, "other"),
      ageBucket: inferBucketFromText(row),
      amount,
      units: getNumber(row, ["units", "quantity", "qty", "total_units"]),
    });
  });

  return charges;
}

export function getFullBillingBucketLabel(bucket: FullBillingBucket) {
  return BUCKET_LABELS[bucket];
}

async function fetchAllFullBillingRows(params: {
  accessToken: string;
  period: string;
}) {
  const rows: unknown[] = [];
  let fromId: string | number | undefined;

  for (let page = 0; page < FULL_BILLING_MAX_PAGES; page += 1) {
    const response: MeliFullBillingDetailsResponse = await getMeliFullBillingDetails({
      accessToken: params.accessToken,
      period: params.period,
      documentType: "BILL",
      limit: FULL_BILLING_PAGE_LIMIT,
      fromId,
    });
    const pageRows = Array.isArray(response.results) ? response.results : [];
    rows.push(...pageRows);

    if (
      pageRows.length === 0 ||
      !response.last_id ||
      response.last_id === fromId ||
      (typeof response.total === "number" && rows.length >= response.total)
    ) {
      break;
    }

    fromId = response.last_id;
  }

  return rows;
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

function tokenNeedsRefresh(tokenExpiresAt: string) {
  const expiresAt = new Date(tokenExpiresAt).getTime();
  const fiveMinutes = 5 * 60 * 1000;
  return Number.isFinite(expiresAt) && expiresAt - Date.now() < fiveMinutes;
}

function extractBucketCharges(row: unknown) {
  const charges: Array<{
    bucket: Exclude<FullBillingBucket, "other">;
    amount: number;
    units: number;
  }> = [];

  for (const spec of BUCKET_ALIASES) {
    const bucketValue = findValueByNormalizedKey(row, spec.aliases);
    if (bucketValue === undefined) {
      continue;
    }

    const amount =
      typeof bucketValue === "number"
        ? bucketValue
        : getNumber(bucketValue, [
            "amount",
            "total",
            "charge_amount",
            "charged_amount",
            "value",
          ]);
    const units =
      typeof bucketValue === "number"
        ? 0
        : getNumber(bucketValue, ["units", "quantity", "qty", "total_units"]);

    if (amount !== 0 || units !== 0) {
      charges.push({
        bucket: spec.bucket,
        amount,
        units,
      });
    }
  }

  return charges;
}

function inferBucketFromText(row: unknown): FullBillingBucket {
  const text = normalizeKey(JSON.stringify(row).slice(0, 5000));
  const match = BUCKET_ALIASES.find((spec) =>
    spec.aliases.some((alias) => text.includes(normalizeKey(alias))),
  );

  return match?.bucket ?? "other";
}

function buildChargeId(
  accountId: string,
  period: string,
  rowIndex: number,
  bucket: FullBillingBucket,
) {
  return `full_billing_${accountId}_${period}_${rowIndex}_${bucket}`;
}

function getString(value: unknown, keys: string[]) {
  const found = findValueByNormalizedKey(value, keys);
  if (found === null || found === undefined) {
    return null;
  }

  if (typeof found === "string" || typeof found === "number") {
    return String(found);
  }

  return null;
}

function getNumber(value: unknown, keys: string[]) {
  const found = findValueByNormalizedKey(value, keys);
  return toNumber(found);
}

function findValueByNormalizedKey(value: unknown, keys: string[]) {
  const wanted = keys.map(normalizeKey);
  const queue: unknown[] = [value];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!isRecord(current)) {
      continue;
    }

    for (const [key, child] of Object.entries(current)) {
      const normalizedKey = normalizeKey(key);
      if (
        wanted.some(
          (wantedKey) =>
            normalizedKey === wantedKey ||
            normalizedKey.endsWith(wantedKey) ||
            normalizedKey.includes(wantedKey),
        )
      ) {
        return child;
      }

      if (isRecord(child) || Array.isArray(child)) {
        queue.push(child);
      }
    }
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(/[$,\s]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}
