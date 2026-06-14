import { describe, expect, it } from "vitest";
import { hasValidSharedSecret, timingSafeTextEqual } from "./request-security";

describe("request security helpers", () => {
  it("compares same-length shared secrets safely", () => {
    expect(timingSafeTextEqual("secret-a", "secret-a")).toBe(true);
    expect(timingSafeTextEqual("secret-a", "secret-b")).toBe(false);
    expect(timingSafeTextEqual("secret-a", "short")).toBe(false);
  });

  it("accepts bearer or configured header secrets", () => {
    expect(
      hasValidSharedSecret({
        request: new Request("https://app.test", {
          headers: { authorization: "Bearer cron-secret" },
        }),
        expectedSecret: "cron-secret",
      }),
    ).toBe("valid");

    expect(
      hasValidSharedSecret({
        request: new Request("https://app.test", {
          headers: { "x-webhook-secret": "webhook-secret" },
        }),
        expectedSecret: "webhook-secret",
      }),
    ).toBe("valid");
  });
});
