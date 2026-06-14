import fs from "node:fs";
import path from "node:path";
import type { Prisma } from "@prisma/client";
import { PrismaClient } from "@prisma/client";

loadLocalEnv();

const prisma = new PrismaClient();

type StorePayload = {
  marketplaceAccounts?: Array<{
    accessToken?: string;
    refreshToken?: string;
    tokenExpiresAt?: string;
    status?: string;
    lastSyncAt?: string;
    [key: string]: unknown;
  }>;
};

async function main() {
  const relational = await prisma.marketplaceAccount.updateMany({
    where: { channel: "mercado_libre" },
    data: {
      authStatus: "disconnected",
      tokenEncrypted: null,
      refreshTokenEncrypted: null,
      lastSyncAt: null,
      isActive: false,
    },
  });

  const stores = await prisma.localDataStore.findMany({
    select: { organizationId: true, payload: true },
  });
  let disconnectedPayloadAccounts = 0;

  for (const store of stores) {
    const payload = store.payload as StorePayload;
    const accounts = payload.marketplaceAccounts ?? [];
    let changed = false;

    for (const account of accounts) {
      if (account.status === "disabled" && !account.accessToken && !account.refreshToken) {
        continue;
      }

      account.accessToken = "";
      account.refreshToken = "";
      account.tokenExpiresAt = "";
      account.status = "disabled";
      account.lastSyncAt = undefined;
      disconnectedPayloadAccounts += 1;
      changed = true;
    }

    if (changed) {
      await prisma.localDataStore.update({
        where: { organizationId: store.organizationId },
        data: { payload: payload as Prisma.InputJsonValue },
      });
    }
  }

  console.log(
    `Disconnected Meli accounts. Relational rows: ${relational.count}; payload accounts: ${disconnectedPayloadAccounts}.`,
  );
}

function loadLocalEnv() {
  for (const fileName of [".env.local", ".env"]) {
    const filePath = path.join(process.cwd(), fileName);
    if (!fs.existsSync(filePath)) continue;

    for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const separator = trimmed.indexOf("=");
      if (separator <= 0) continue;

      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
      process.env[key] ??= value;
    }
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
