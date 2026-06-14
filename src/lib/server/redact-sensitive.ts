const sensitiveKeyPattern =
  /(^|_)(accessToken|refreshToken|token|tokenEncrypted|refreshTokenEncrypted|secret|password|passwordHash|passwordSalt|clientSecret|authorization)(_|$)/i;

export function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => redactSensitive(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        sensitiveKeyPattern.test(key) ? "[redacted]" : redactSensitive(entry),
      ]),
    );
  }

  return value;
}
