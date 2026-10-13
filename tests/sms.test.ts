import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendCode } from "../src/lib/auth/sms";

describe("MiniMoth code delivery", () => {
  beforeEach(() => {
    vi.stubEnv("MONGODB_URI", "mongodb://localhost/test");
    vi.stubEnv("APP_ORIGIN", "https://example.test");
    vi.stubEnv("AUTH_SECRET", "a".repeat(32));
    vi.stubEnv("MOCK_OTP", "false");
    vi.stubEnv("MINIMOTH_HOOK_URL", "https://hooks.example.test/otp");
    vi.stubEnv("MINIMOTH_HOOK_TOKEN", "tok-123");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  const reply = (status: number, body = "") =>
    vi.fn<typeof fetch>(async () => new Response(body, { status }));

  it("posts our own code with the hook token", async () => {
    const fetch = reply(200);
    vi.stubGlobal("fetch", fetch);
    await sendCode("9876543210", "123456");
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://hooks.example.test/otp");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer tok-123");
    expect(JSON.parse(String(init?.body))).toEqual({ phone: "+919876543210", code: "123456" });
  });
  it("fails, and logs MiniMoth's reason, when the hook refuses", async () => {
    vi.stubGlobal("fetch", reply(402, '{"code":"INSUFFICIENT_BALANCE"}'));
    await expect(sendCode("9876543210", "123456")).rejects.toThrow("Unable to send your code");
    expect(console.error).toHaveBeenCalledWith("MiniMoth OTP failed:", '402 {"code":"INSUFFICIENT_BALANCE"}');
  });
  it("refuses without the hook, and sends nothing for test codes", async () => {
    vi.stubEnv("MINIMOTH_HOOK_URL", "");
    vi.stubEnv("MINIMOTH_HOOK_TOKEN", "");
    await expect(sendCode("9876543210", "123456")).rejects.toThrow("not configured");
    vi.stubEnv("MOCK_OTP", "true");
    const fetch = reply(200);
    vi.stubGlobal("fetch", fetch);
    await sendCode("9876543210", "123456");
    expect(fetch).not.toHaveBeenCalled();
  });
});
