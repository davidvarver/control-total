import { getMeliApiBaseUrl, getMeliConfig } from "./config";

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user_id: number;
  token_type: string;
  scope: string;
};

export type MeliUser = {
  id: number;
  nickname: string;
  site_id: string;
};

export type MeliOrderSearchResponse = {
  results: unknown[];
  paging?: {
    total: number;
    offset: number;
    limit: number;
  };
};

export type MeliItemSearchResponse = {
  seller_id: string | number;
  results: string[];
  paging?: {
    total: number;
    offset: number;
    limit: number;
  };
  scroll_id?: string | null;
};

export type MeliFulfillmentStockResponse = {
  inventory_id: string;
  total?: number;
  available_quantity?: number;
  not_available_quantity?: number;
  not_available_detail?: Array<{
    status?: string;
    quantity?: number;
  }>;
};

export type MeliFullBillingDetailsResponse = {
  offset?: number;
  limit?: number;
  total?: number;
  last_id?: string | number | null;
  results?: unknown[];
};

const MELI_FETCH_TIMEOUT_MS = 7000;

async function fetchMeli(
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1] = {},
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MELI_FETCH_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Mercado Libre API timeout");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function parseMeliResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(
      `Mercado Libre API error ${response.status}: ${JSON.stringify(payload)}`,
    );
  }

  return payload as T;
}

export async function exchangeMeliCode(code: string) {
  const config = getMeliConfig();
  const response = await fetchMeli(`${config.apiBaseUrl}/oauth/token`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.redirectUri,
    }),
  });

  return parseMeliResponse<TokenResponse>(response);
}

export async function refreshMeliToken(refreshToken: string) {
  const config = getMeliConfig();
  const response = await fetchMeli(`${config.apiBaseUrl}/oauth/token`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
    }),
  });

  return parseMeliResponse<TokenResponse>(response);
}

export async function getMeliMe(accessToken: string) {
  const apiBaseUrl = getMeliApiBaseUrl();
  const response = await fetchMeli(`${apiBaseUrl}/users/me`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  return parseMeliResponse<MeliUser>(response);
}

export async function searchRecentMeliOrders(params: {
  accessToken: string;
  sellerId: string;
  limit?: number;
  offset?: number;
}) {
  const apiBaseUrl = getMeliApiBaseUrl();
  const url = new URL(`${apiBaseUrl}/orders/search/recent`);
  url.searchParams.set("seller", params.sellerId);
  url.searchParams.set("sort", "date_desc");
  url.searchParams.set("limit", String(params.limit ?? 50));
  url.searchParams.set("offset", String(params.offset ?? 0));

  const response = await fetchMeli(url, {
    headers: {
      authorization: `Bearer ${params.accessToken}`,
    },
  });

  return parseMeliResponse<MeliOrderSearchResponse>(response);
}

export async function searchMeliOrders(params: {
  accessToken: string;
  sellerId: string;
  q?: string;
  limit?: number;
  offset?: number;
  sort?: "date_asc" | "date_desc";
  dateClosedFrom?: string;
  dateClosedTo?: string;
  dateLastUpdatedFrom?: string;
  dateLastUpdatedTo?: string;
}) {
  const apiBaseUrl = getMeliApiBaseUrl();
  const url = new URL(`${apiBaseUrl}/orders/search`);
  url.searchParams.set("seller", params.sellerId);
  url.searchParams.set("sort", params.sort ?? "date_asc");
  url.searchParams.set("limit", String(params.limit ?? 50));
  url.searchParams.set("offset", String(params.offset ?? 0));

  if (params.q) {
    url.searchParams.set("q", params.q);
  }

  if (params.dateClosedFrom) {
    url.searchParams.set("order.date_closed.from", params.dateClosedFrom);
  }

  if (params.dateClosedTo) {
    url.searchParams.set("order.date_closed.to", params.dateClosedTo);
  }

  if (params.dateLastUpdatedFrom) {
    url.searchParams.set("order.date_last_updated.from", params.dateLastUpdatedFrom);
  }

  if (params.dateLastUpdatedTo) {
    url.searchParams.set("order.date_last_updated.to", params.dateLastUpdatedTo);
  }

  const response = await fetchMeli(url, {
    headers: {
      authorization: `Bearer ${params.accessToken}`,
    },
  });

  return parseMeliResponse<MeliOrderSearchResponse>(response);
}

export async function getMeliOrder(accessToken: string, orderId: string) {
  const apiBaseUrl = getMeliApiBaseUrl();
  const response = await fetchMeli(`${apiBaseUrl}/orders/${orderId}`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  return parseMeliResponse<unknown>(response);
}

export async function getMeliPayment(accessToken: string, paymentId: string) {
  const response = await fetchMeli(
    `https://api.mercadopago.com/v1/payments/${paymentId}`,
    {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    },
  );

  return parseMeliResponse<unknown>(response);
}

export async function getMeliPack(accessToken: string, packId: string) {
  const apiBaseUrl = getMeliApiBaseUrl();
  const headers = {
    authorization: `Bearer ${accessToken}`,
  };
  const response = await fetchMeli(`${apiBaseUrl}/packs/${packId}`, {
    headers,
  });

  if (response.ok) {
    return parseMeliResponse<unknown>(response);
  }

  const fallbackResponse = await fetchMeli(
    `${apiBaseUrl}/marketplace/orders/pack/${packId}`,
    { headers },
  );

  return parseMeliResponse<unknown>(fallbackResponse);
}

export async function getMeliMarketplacePackOrders(
  accessToken: string,
  packId: string,
) {
  const apiBaseUrl = getMeliApiBaseUrl();
  const response = await fetchMeli(
    `${apiBaseUrl}/marketplace/orders/pack/${packId}`,
    {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    },
  );

  return parseMeliResponse<unknown>(response);
}

export async function getMeliShipment(accessToken: string, shipmentId: string) {
  const apiBaseUrl = getMeliApiBaseUrl();
  const response = await fetchMeli(`${apiBaseUrl}/shipments/${shipmentId}`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      "x-format-new": "true",
    },
  });

  return parseMeliResponse<unknown>(response);
}

export async function getMeliShipmentCosts(
  accessToken: string,
  shipmentId: string,
) {
  const apiBaseUrl = getMeliApiBaseUrl();
  const response = await fetchMeli(
    `${apiBaseUrl}/shipments/${shipmentId}/costs`,
    {
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-format-new": "true",
      },
    },
  );

  return parseMeliResponse<unknown>(response);
}

export async function getMeliOrderBillingDetails(
  accessToken: string,
  orderIds: string[],
) {
  if (orderIds.length === 0) {
    return null;
  }

  const apiBaseUrl = getMeliApiBaseUrl();
  const url = new URL(`${apiBaseUrl}/billing/integration/group/ML/order/details`);
  url.searchParams.set("order_ids", orderIds.join(","));

  const response = await fetchMeli(url, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  return parseMeliResponse<unknown>(response);
}

export async function getMeliFullBillingDetails(params: {
  accessToken: string;
  period: string;
  documentType?: "BILL" | "CREDIT_NOTE";
  limit?: number;
  fromId?: string | number;
}) {
  const apiBaseUrl = getMeliApiBaseUrl();
  const url = new URL(
    `${apiBaseUrl}/billing/integration/periods/key/${params.period}/group/ML/full/details`,
  );
  url.searchParams.set("document_type", params.documentType ?? "BILL");
  url.searchParams.set("limit", String(params.limit ?? 150));
  if (params.fromId !== undefined && params.fromId !== "") {
    url.searchParams.set("from_id", String(params.fromId));
  }

  const response = await fetchMeli(url, {
    headers: {
      authorization: `Bearer ${params.accessToken}`,
    },
  });

  return parseMeliResponse<MeliFullBillingDetailsResponse>(response);
}

export async function searchMeliSellerItems(params: {
  accessToken: string;
  sellerId: string;
  limit?: number;
  offset?: number;
}) {
  const apiBaseUrl = getMeliApiBaseUrl();
  const url = new URL(`${apiBaseUrl}/users/${params.sellerId}/items/search`);
  url.searchParams.set("limit", String(params.limit ?? 50));
  url.searchParams.set("offset", String(params.offset ?? 0));
  url.searchParams.set("status", "active");

  const response = await fetchMeli(url, {
    headers: {
      authorization: `Bearer ${params.accessToken}`,
    },
  });

  return parseMeliResponse<MeliItemSearchResponse>(response);
}

export async function getMeliItems(accessToken: string, itemIds: string[]) {
  if (itemIds.length === 0) {
    return [];
  }

  const apiBaseUrl = getMeliApiBaseUrl();
  const url = new URL(`${apiBaseUrl}/items`);
  url.searchParams.set("ids", itemIds.join(","));
  url.searchParams.set("include_attributes", "all");
  url.searchParams.set(
    "attributes",
    "id,title,thumbnail,secure_thumbnail,pictures,seller_custom_field,inventory_id,shipping,variations,attributes",
  );

  const response = await fetchMeli(url, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  return parseMeliResponse<Array<{ code: number; body: unknown }>>(response);
}

export async function getMeliFulfillmentStock(
  accessToken: string,
  inventoryId: string,
) {
  const apiBaseUrl = getMeliApiBaseUrl();
  const response = await fetchMeli(
    `${apiBaseUrl}/inventories/${inventoryId}/stock/fulfillment`,
    {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    },
  );

  return parseMeliResponse<MeliFulfillmentStockResponse>(response);
}

export async function updateMeliItemStock(
  accessToken: string,
  itemId: string,
  quantity: number,
  variationId?: string | null,
) {
  const apiBaseUrl = getMeliApiBaseUrl();
  const url = `${apiBaseUrl}/items/${itemId}`;
  const body = variationId
    ? {
        variations: [
          {
            id: Number(variationId),
            available_quantity: quantity,
          },
        ],
      }
    : {
        available_quantity: quantity,
      };

  const response = await fetchMeli(url, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return parseMeliResponse<unknown>(response);
}
