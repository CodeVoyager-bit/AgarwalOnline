import { describe, expect, it } from "vitest";
import { parseEnv } from "../src/lib/env";
import { hasPermission, assertPermission } from "../src/lib/auth/permissions";
import { digest, otpDigest, equalHash, token } from "../src/lib/auth/crypto";
const env = {
  MONGODB_URI: "mongodb://localhost/test",
  APP_ORIGIN: "https://example.test",
  AUTH_SECRET: "a".repeat(32),
};
describe("security boundaries", () => {
  it("forbids mock authentication in production", () => {
    expect(() =>
      parseEnv({ ...env, NODE_ENV: "production", MOCK_OTP: "true" }),
    ).toThrow();
  });
  it("requires secure production origin and secret", () => {
    expect(() =>
      parseEnv({
        ...env,
        NODE_ENV: "production",
        APP_ORIGIN: "http://example.test",
      }),
    ).toThrow();
    expect(() => parseEnv({ ...env, AUTH_SECRET: "short" })).toThrow();
    expect(() => parseEnv({ ...env, BETTER_AUTH_SECRET: "short" })).toThrow();
  });
  it("denies customer and delivery access to operations", () => {
    expect(hasPermission("customer", "order:manage")).toBe(false);
    expect(hasPermission("delivery", "analytics:read")).toBe(false);
    expect(() => assertPermission("admin", "settings:write")).toThrow(
      "FORBIDDEN",
    );
    expect(hasPermission("super-admin", "settings:write")).toBe(true);
  });
  it("separates OTP subjects and uses opaque high-entropy session tokens", () => {
    expect(
      equalHash(
        otpDigest("a", "123456", "secret"),
        otpDigest("b", "123456", "secret"),
      ),
    ).toBe(false);
    const a = token();
    expect(a.length).toBeGreaterThan(40);
    expect(a).not.toBe(token());
    expect(digest(a)).not.toBe(a);
  });
});
