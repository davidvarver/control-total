export function getMeliConfig() {
  const clientId = process.env.MELI_CLIENT_ID;
  const clientSecret = process.env.MELI_CLIENT_SECRET;
  const redirectUri =
    process.env.MELI_REDIRECT_URI ??
    `${process.env.APP_URL ?? "http://127.0.0.1:3000"}/api/integrations/meli/callback`;

  if (!clientId || !clientSecret) {
    throw new Error("Missing MELI_CLIENT_ID or MELI_CLIENT_SECRET");
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    authBaseUrl: "https://auth.mercadolibre.com.mx/authorization",
    apiBaseUrl: "https://api.mercadolibre.com",
  };
}

export function getMeliApiBaseUrl() {
  return "https://api.mercadolibre.com";
}

export function buildMeliAuthorizationUrl(state: string) {
  const config = getMeliConfig();
  const url = new URL(config.authBaseUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);
  return url;
}
