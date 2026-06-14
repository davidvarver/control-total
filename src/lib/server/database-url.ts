const databaseUrlCandidates = [
  "DATABASE_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL",
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL_NON_POOLING",
] as const;

export function getDatabaseUrl() {
  for (const name of databaseUrlCandidates) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }

  return "";
}

export function hasDatabaseUrl() {
  return getDatabaseUrl().length > 0;
}
