import { NextResponse, type NextRequest } from "next/server";

const sessionCookieName = "ct_session";
const maxBodyBytes = 15 * 1024 * 1024;
const mutatingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const apiBuckets = new Map<string, { count: number; resetAt: number }>();
const apiRateLimit = 240;
const apiRateWindowMs = 60 * 1000;
const maxApiBuckets = 20_000;
let lastApiBucketSweepAt = 0;

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

function hitApiRateLimit(request: NextRequest) {
  const key = `${clientIp(request)}:${request.nextUrl.pathname}`;
  const now = Date.now();
  sweepApiBuckets(now);
  const bucket = apiBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    if (apiBuckets.size >= maxApiBuckets) {
      dropOldestApiBucket();
    }
    apiBuckets.set(key, { count: 1, resetAt: now + apiRateWindowMs });
    return false;
  }

  bucket.count += 1;
  return bucket.count > apiRateLimit;
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

  if (pathname.startsWith("/api/") && hitApiRateLimit(request)) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Intenta de nuevo en un momento." },
      { status: 429 },
    );
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
