import { NextResponse, type NextRequest } from "next/server";

const sessionCookieName = "ct_session";
const maxBodyBytes = 15 * 1024 * 1024;
const mutatingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const apiBuckets = new Map<string, { count: number; resetAt: number }>();
const maxApiBuckets = 20_000;
let lastApiBucketSweepAt = 0;

type RateLimitRule = {
  name: string;
  limit: number;
  windowMs: number;
};

const oneMinuteMs = 60 * 1000;
const tenMinutesMs = 10 * oneMinuteMs;

const apiRateRules = {
  auth: { name: "auth", limit: 10, windowMs: tenMinutesMs },
  suspiciousAuth: { name: "suspicious-auth", limit: 3, windowMs: tenMinutesMs },
  assistant: { name: "assistant", limit: 30, windowMs: oneMinuteMs },
  sync: { name: "sync", limit: 20, windowMs: oneMinuteMs },
  imports: { name: "imports", limit: 30, windowMs: oneMinuteMs },
  exports: { name: "exports", limit: 30, windowMs: oneMinuteMs },
  mutation: { name: "mutation", limit: 120, windowMs: oneMinuteMs },
  general: { name: "general", limit: 240, windowMs: oneMinuteMs },
} satisfies Record<string, RateLimitRule>;

const publicPaths = [
  "/",
  "/flujo",
  "/legales",
  "/login",
  "/register",
  "/api/auth/login",
  "/api/auth/register",
  "/api/cron/data-retention",
  "/api/cron/monthly-snapshots",
  "/api/cron/meli-hourly",
  "/api/cron/stock-sync",
  "/api/integrations/meli/webhook",
];

function isPublicPath(pathname: string) {
  return publicPaths.some(
    (publicPath) => pathname === publicPath || pathname.startsWith(`${publicPath}/`),
  );
}

function hasTrustedOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) {
    return true;
  }

  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}

function clientIp(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function rateLimitKey(request: NextRequest, rule: RateLimitRule) {
  const sessionId = request.cookies.get(sessionCookieName)?.value ?? "anon";
  return [
    rule.name,
    clientIp(request),
    sessionId,
    request.method,
    request.nextUrl.pathname,
  ].join(":");
}

export function rateLimitRuleFor(request: NextRequest): RateLimitRule {
  const { pathname } = request.nextUrl;

  if (pathname === "/api/auth/login" || pathname === "/api/auth/register") {
    return hasSuspiciousAuthUserAgent(request)
      ? apiRateRules.suspiciousAuth
      : apiRateRules.auth;
  }

  if (pathname === "/api/assistant") {
    return apiRateRules.assistant;
  }

  if (
    pathname.startsWith("/api/integrations/meli/") ||
    pathname.startsWith("/api/cron/") ||
    pathname === "/api/admin/meli-sync" ||
    pathname === "/api/recalculate"
  ) {
    return apiRateRules.sync;
  }

  if (pathname.startsWith("/api/import/")) {
    return apiRateRules.imports;
  }

  if (pathname.startsWith("/api/export/") || pathname.startsWith("/api/templates/")) {
    return apiRateRules.exports;
  }

  if (mutatingMethods.has(request.method)) {
    return apiRateRules.mutation;
  }

  return apiRateRules.general;
}

export function hasSuspiciousAuthUserAgent(request: NextRequest) {
  const userAgent = request.headers.get("user-agent")?.toLowerCase().trim() ?? "";

  if (!userAgent) {
    return true;
  }

  return [
    "curl",
    "wget",
    "python-requests",
    "httpclient",
    "scrapy",
    "spider",
    "bot",
  ].some((signature) => userAgent.includes(signature));
}

function hitApiRateLimit(request: NextRequest) {
  const rule = rateLimitRuleFor(request);
  const key = rateLimitKey(request, rule);
  const now = Date.now();
  sweepApiBuckets(now);
  const bucket = apiBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    if (apiBuckets.size >= maxApiBuckets) {
      dropOldestApiBucket();
    }
    apiBuckets.set(key, { count: 1, resetAt: now + rule.windowMs });
    return { limited: false, rule, resetAt: now + rule.windowMs };
  }

  bucket.count += 1;
  return { limited: bucket.count > rule.limit, rule, resetAt: bucket.resetAt };
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (request.headers.has("x-middleware-subrequest")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maxBodyBytes) {
    return NextResponse.json(
      { error: "Archivo o solicitud demasiado grande." },
      { status: 413 },
    );
  }

  if (mutatingMethods.has(request.method) && !hasTrustedOrigin(request)) {
    return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  }

  if (pathname.startsWith("/api/")) {
    const rateLimit = hitApiRateLimit(request);
    if (rateLimit.limited) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((rateLimit.resetAt - Date.now()) / 1000),
      );

      return NextResponse.json(
        { error: "Demasiadas solicitudes. Intenta de nuevo en un momento." },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfterSeconds),
            "X-RateLimit-Limit": String(rateLimit.rule.limit),
            "X-RateLimit-Policy": rateLimit.rule.name,
          },
        },
      );
    }
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const hasSession = Boolean(request.cookies.get(sessionCookieName)?.value);

  if (!hasSession) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

function sweepApiBuckets(now: number) {
  if (now - lastApiBucketSweepAt < 60_000) {
    return;
  }

  lastApiBucketSweepAt = now;
  for (const [key, bucket] of apiBuckets) {
    if (bucket.resetAt <= now) {
      apiBuckets.delete(key);
    }
  }
}

function dropOldestApiBucket() {
  const oldestKey = apiBuckets.keys().next().value as string | undefined;
  if (oldestKey) {
    apiBuckets.delete(oldestKey);
  }
}

export const config = {
  matcher: [
    "/((?!_next|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map)$).*)",
  ],
};
