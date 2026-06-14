import { PrismaClient } from "@prisma/client";
import { getDatabaseUrl } from "./database-url";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};
const databaseUrl = getDatabaseUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    datasources: databaseUrl
      ? {
          db: {
            url: withConnectionLimit(databaseUrl),
          },
        }
      : undefined,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

function withConnectionLimit(url: string) {
  try {
    const parsed = new URL(url);
    const connectionLimit = readPositiveIntegerEnv(
      "DATABASE_CONNECTION_LIMIT",
      process.env.NODE_ENV === "production" ? 5 : 2,
    );
    const poolTimeout = readPositiveIntegerEnv("DATABASE_POOL_TIMEOUT", 20);

    parsed.searchParams.set("connection_limit", String(connectionLimit));
    parsed.searchParams.set("pool_timeout", String(poolTimeout));

    if (parsed.hostname.includes("pooler.supabase.com")) {
      parsed.searchParams.set("pgbouncer", "true");
    }

    return parsed.toString();
  } catch {
    return url;
  }
}

function readPositiveIntegerEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}
