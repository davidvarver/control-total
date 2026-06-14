import crypto from "node:crypto";

const encryptedPrefix = "ctenc:v1:";
const algorithm = "aes-256-gcm";

export function isEncryptedSecret(value: string | null | undefined) {
  return typeof value === "string" && value.startsWith(encryptedPrefix);
}

export function encryptSecret(value: string | null | undefined) {
  if (!value || isEncryptedSecret(value)) {
    return value ?? "";
  }

  const key = getSecretKey();
  if (!key) {
    return value;
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    encryptedPrefix,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptSecret(value: string | null | undefined) {
  if (!value || !isEncryptedSecret(value)) {
    return value ?? "";
  }

  const key = getSecretKey();
  if (!key) {
    throw new Error("TOKEN_ENCRYPTION_KEY is required to decrypt integration tokens.");
  }

  const [, ivText, tagText, encryptedText] = value.split(".");
  if (!ivText || !tagText || !encryptedText) {
    throw new Error("Invalid encrypted secret payload.");
  }

  const decipher = crypto.createDecipheriv(
    algorithm,
    key,
    Buffer.from(ivText, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function getSecretKey() {
  const raw = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("TOKEN_ENCRYPTION_KEY is required in production.");
    }
    return null;
  }

  return crypto.createHash("sha256").update(raw).digest();
}
