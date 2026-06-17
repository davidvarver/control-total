import { describe, expect, it } from "vitest";
import { hasSuspiciousAuthUserAgent, rateLimitRuleFor } from "./proxy";

describe("proxy rate-limit policy", () => {
  it("uses a strict window for login and register", () => {
    expect(ruleFor("/api/auth/login", "POST").name).toBe("auth");
    expect(ruleFor("/api/auth/login", "POST").limit).toBe(10);
    expect(ruleFor("/api/auth/register", "POST").name).toBe("auth");
  });

  it("tightens auth limits for automated user agents", () => {
    const request = requestFor("/api/auth/login", "POST", "curl/8.0");

    expect(hasSuspiciousAuthUserAgent(request)).toBe(true);
    expect(rateLimitRuleFor(request).name).toBe("suspicious-auth");
    expect(rateLimitRuleFor(request).limit).toBe(3);
  });

  it("separates expensive operational routes from regular API reads", () => {
    expect(ruleFor("/api/assistant", "POST").name).toBe("assistant");
    expect(ruleFor("/api/integrations/meli/sync-ui", "POST").name).toBe("sync");
    expect(ruleFor("/api/cron/meli-hourly", "GET").name).toBe("sync");
    expect(ruleFor("/api/import/preview", "POST").name).toBe("imports");
    expect(ruleFor("/api/export/orders", "GET").name).toBe("exports");
    expect(ruleFor("/api/products/update", "POST").name).toBe("mutation");
    expect(ruleFor("/api/products", "GET").name).toBe("general");
  });
});

function ruleFor(pathname: string, method: string) {
  return rateLimitRuleFor(requestFor(pathname, method));
}

function requestFor(pathname: string, method: string, userAgent = "Mozilla/5.0") {
  const headers = new Headers({
    "user-agent": userAgent,
    "x-forwarded-for": "203.0.113.10",
  });

  return {
    method,
    headers,
    nextUrl: new URL(`https://control-total.test${pathname}`),
    cookies: {
      get: () => ({ value: "session-id" }),
    },
  } as never;
}
