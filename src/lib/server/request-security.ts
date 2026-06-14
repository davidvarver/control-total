import crypto from "node:crypto";

export function timingSafeTextEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function hasValidSharedSecret(input: {
  request: Request;
  expectedSecret: string | undefined;
  headerName?: string;
}) {
  const expectedSecret = input.expectedSecret?.trim();
  if (!expectedSecret) {
    return "missing" as const;
  }

  const headerName = input.headerName ?? "x-webhook-secret";
  const headerSecret = input.request.headers.get(headerName)?.trim();
  const authSecret = extractBearerToken(input.request.headers.get("authorization"));
  const providedSecret = headerSecret || authSecret;

  if (!providedSecret) {
    return "invalid" as const;
  }

  return timingSafeTextEqual(providedSecret, expectedSecret) ? "valid" : "invalid";
}

function extractBearerToken(value: string | null) {
  if (!value) {
    return "";
  }

  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}
