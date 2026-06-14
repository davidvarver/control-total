import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

loadLocalEnv();

const prisma = new PrismaClient();

async function main() {
  const email = normalizeEmail(
    process.env.PLATFORM_ADMIN_EMAIL ?? process.env.ADMIN_EMAIL ?? "",
  );
  const password =
    process.env.PLATFORM_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD ?? "";
  const name = process.env.PLATFORM_ADMIN_NAME?.trim() || "Admin Control Total";

  if (!email || password.length < 12) {
    throw new Error(
      "Set PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD with at least 12 characters.",
    );
  }

  if (!isConfiguredPlatformAdmin(email)) {
    throw new Error("PLATFORM_ADMIN_EMAIL must also be listed in PLATFORM_ADMIN_EMAILS.");
  }

  const passwordData = await hashPassword(password);
  const user = await prisma.user.upsert({
    where: { email },
    create: {
      name,
      email,
      passwordHash: passwordData.hash,
      passwordSalt: passwordData.salt,
      status: "active",
    },
    update: {
      name,
      passwordHash: passwordData.hash,
      passwordSalt: passwordData.salt,
      status: "active",
    },
    select: { id: true, email: true, name: true, status: true },
  });

  console.log(`Platform admin ready: ${user.email}`);
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

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isConfiguredPlatformAdmin(email: string) {
  const configuredEmails =
    process.env.PLATFORM_ADMIN_EMAILS ??
    process.env.SUPER_ADMIN_EMAILS ??
    "david@gmail.com";

  return configuredEmails
    .split(",")
    .map((entry) => normalizeEmail(entry))
    .filter(Boolean)
    .includes(normalizeEmail(email));
}

async function hashPassword(
  password: string,
  salt = crypto.randomBytes(16).toString("hex"),
) {
  const hash = await new Promise<string>((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey.toString("hex"));
    });
  });

  return { hash, salt };
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
