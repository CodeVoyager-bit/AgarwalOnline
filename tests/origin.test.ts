import { describe, expect, it } from "vitest";
import { isAllowedOrigin, originVariants } from "../src/lib/auth/origin";

const LOCAL = "http://127.0.0.1:3000";
const PROD = "https://shop.example.test";

describe("request origin guard", () => {
  it("accepts an exact match", () => {
    expect(isAllowedOrigin(LOCAL, LOCAL)).toBe(true);
    expect(isAllowedOrigin(PROD, PROD)).toBe(true);
  });

  it("treats the two loopback spellings as the same local machine", () => {
    expect(isAllowedOrigin("http://localhost:3000", LOCAL)).toBe(true);
    expect(isAllowedOrigin(LOCAL, "http://localhost:3000")).toBe(true);
  });

  it("still separates loopback origins by port and protocol", () => {
    expect(isAllowedOrigin("http://localhost:3001", LOCAL)).toBe(false);
    expect(isAllowedOrigin("https://localhost:3000", LOCAL)).toBe(false);
  });

  it("never relaxes a non-loopback origin", () => {
    expect(isAllowedOrigin("https://evil.test", PROD)).toBe(false);
    expect(isAllowedOrigin("http://localhost:3000", PROD)).toBe(false);
    expect(isAllowedOrigin(PROD, LOCAL)).toBe(false);
    // a host that merely contains the configured one must not pass
    expect(isAllowedOrigin("https://shop.example.test.evil.test", PROD)).toBe(false);
  });

  it("rejects a missing or unparseable origin", () => {
    expect(isAllowedOrigin(null, LOCAL)).toBe(false);
    expect(isAllowedOrigin("", LOCAL)).toBe(false);
    expect(isAllowedOrigin("not a url", LOCAL)).toBe(false);
  });

  it("lists both spellings for a local origin and only itself for a real one", () => {
    expect(originVariants(LOCAL).sort()).toEqual(
      ["http://127.0.0.1:3000", "http://localhost:3000"].sort(),
    );
    expect(originVariants(PROD)).toEqual([PROD]);
  });
});
