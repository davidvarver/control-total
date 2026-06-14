import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const apiRoot = path.join(process.cwd(), "src", "app", "api");
const mutatingMethods = ["POST", "PUT", "PATCH", "DELETE"] as const;
const securityGuards = [
  "requireApiUser",
  "requireApiPermission",
  "requireApiWritablePermission",
  "requirePermission",
  "requireWritablePermission",
  "requirePlatformAdmin",
  "hasValidSharedSecret",
  "CRON_SECRET",
  "MELI_WEBHOOK_SECRET",
];
const explicitlyPublicMutations = new Set([
  "/api/auth/login",
  "/api/auth/register",
]);
const explicitlyBlockedMutations = new Set([
  "/api/subscription",
  "/api/subscription/payment",
]);
const proxySessionMutations = new Set([
  "/api/auth/logout",
]);
const sensitiveGetRoutes = [
  "/api/admin",
  "/api/cron",
  "/api/export",
  "/api/integrations",
  "/api/templates",
];

describe("API route security guards", () => {
  it("keeps mutating API routes behind auth, a shared secret, or an explicit block", () => {
    const failures = findRouteFiles()
      .flatMap((file) => {
        const source = fs.readFileSync(file, "utf8");
        const routePath = toRoutePath(file);
        return mutatingMethods
          .filter((method) => source.includes(`export async function ${method}`))
          .map((method) => ({ method, routePath, source }));
      })
      .filter(({ routePath, source }) => {
        if (explicitlyPublicMutations.has(routePath)) return false;
        if (explicitlyBlockedMutations.has(routePath)) return false;
        if (proxySessionMutations.has(routePath)) return false;
        return !securityGuards.some((guard) => source.includes(guard));
      })
      .map(({ method, routePath }) => `${method} ${routePath}`);

    expect(failures).toEqual([]);
  });

  it("keeps sensitive GET API routes behind auth or a shared secret", () => {
    const failures = findRouteFiles()
      .map((file) => ({
        routePath: toRoutePath(file),
        source: fs.readFileSync(file, "utf8"),
      }))
      .filter(({ routePath, source }) => {
        if (!source.includes("export async function GET")) return false;
        if (!sensitiveGetRoutes.some((prefix) => routePath.startsWith(prefix))) {
          return false;
        }
        return !securityGuards.some((guard) => source.includes(guard));
      })
      .map(({ routePath }) => `GET ${routePath}`);

    expect(failures).toEqual([]);
  });
});

function findRouteFiles(dir = apiRoot): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return findRouteFiles(fullPath);
    }
    return entry.isFile() && entry.name === "route.ts" ? [fullPath] : [];
  });
}

function toRoutePath(file: string) {
  const relative = path.relative(apiRoot, path.dirname(file));
  return `/api/${relative.split(path.sep).join("/")}`;
}
