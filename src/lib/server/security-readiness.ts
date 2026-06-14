type Severity = "critical" | "warning";

export type SecurityReadinessCheck = {
  key: string;
  title: string;
  detail: string;
  ok: boolean;
  severity: Severity;
};

const placeholderValues = new Set([
  "",
  "generate-a-long-random-value-and-keep-it-secret",
  "admin@example.com",
  "changeme",
  "change-me",
]);

export function buildSecurityReadiness() {
  const checks: SecurityReadinessCheck[] = [
    secretCheck({
      key: "token-encryption",
      title: "Cifrado de tokens",
      envName: "TOKEN_ENCRYPTION_KEY",
      minLength: 32,
      detail: "Necesario para guardar tokens Meli cifrados.",
    }),
    secretCheck({
      key: "cron-secret",
      title: "Cron protegido",
      envName: "CRON_SECRET",
      minLength: 32,
      detail: "Protege sincronizaciones automaticas y jobs internos.",
    }),
    secretCheck({
      key: "meli-webhook-secret",
      title: "Webhook protegido",
      envName: "MELI_WEBHOOK_SECRET",
      minLength: 32,
      detail: "Evita que cualquiera pueda simular eventos Meli.",
      severity: "warning",
    }),
    {
      key: "platform-admin",
      title: "Admin explicito",
      detail: "PLATFORM_ADMIN_EMAILS debe estar configurado con emails reales.",
      ok: hasNonPlaceholderValue(process.env.PLATFORM_ADMIN_EMAILS ?? process.env.SUPER_ADMIN_EMAILS),
      severity: "critical",
    },
    {
      key: "production-url",
      title: "URL publica segura",
      detail: "APP_URL debe apuntar al dominio HTTPS de produccion.",
      ok:
        process.env.NODE_ENV !== "production" ||
        Boolean(process.env.APP_URL?.startsWith("https://")),
      severity: "warning",
    },
  ];

  const failed = checks.filter((check) => !check.ok);
  const criticalOpen = failed.filter((check) => check.severity === "critical").length;
  const warningOpen = failed.filter((check) => check.severity === "warning").length;

  return {
    checks,
    ok: criticalOpen === 0,
    criticalOpen,
    warningOpen,
    passed: checks.length - failed.length,
  };
}

function secretCheck(input: {
  key: string;
  title: string;
  envName: string;
  minLength: number;
  detail: string;
  severity?: Severity;
}): SecurityReadinessCheck {
  const value = process.env[input.envName]?.trim() ?? "";
  return {
    key: input.key,
    title: input.title,
    detail: input.detail,
    ok: hasNonPlaceholderValue(value) && value.length >= input.minLength,
    severity: input.severity ?? "critical",
  };
}

function hasNonPlaceholderValue(value: string | undefined) {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized.length > 0 && !placeholderValues.has(normalized);
}
