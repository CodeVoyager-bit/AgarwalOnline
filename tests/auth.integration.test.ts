import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db/connect";
import { User } from "../src/lib/db/models";
import { getAuth } from "../src/lib/auth/better-auth";

const uri = process.env.TEST_MONGODB_URI;

describe.skipIf(!uri)("Better Auth MongoDB integration", () => {
  const requestHeaders = new Headers({
    origin: "http://127.0.0.1:3000",
    "x-forwarded-for": "127.0.0.42",
  });

  beforeAll(async () => {
    if (!uri?.includes("/ags_test"))
      throw new Error("Tests require a dedicated ags_test database");
    Object.assign(process.env, {
      MONGODB_URI: uri,
      APP_ORIGIN: "http://127.0.0.1:3000",
      AUTH_SECRET: "test-secret-".repeat(4),
      MOCK_OTP: "true",
      MOCK_OTP_CODE: "246810",
    });
    await connectDB();
    await User.init();
  });

  beforeEach(async () => {
    for (const name of [
      "users",
      "authSessions",
      "authAccounts",
      "authVerifications",
      "authRateLimits",
    ])
      await mongoose.connection.collection(name).deleteMany({});
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  const send = (phone = "9000000091") =>
    getAuth().api.sendPhoneNumberOTP({
      body: { phoneNumber: phone },
      headers: requestHeaders,
    });
  const verify = (code = "246810", phone = "9000000091") =>
    getAuth().api.verifyPhoneNumber({
      body: { phoneNumber: phone, code },
      headers: requestHeaders,
    });

  it("creates a customer and a database session only after OTP verification", async () => {
    await send();
    expect(await User.countDocuments()).toBe(0);
    const result = await verify();
    expect(result.user).toBeTruthy();
    const customer = await User.findOne({ role: "customer", active: true });
    expect(customer?.phone).toBe("9000000091");
    expect(
      await mongoose.connection.collection("authSessions").countDocuments(),
    ).toBe(1);
    await expect(verify()).rejects.toThrow();
  });

  it("locks a mock challenge after five invalid attempts", async () => {
    await send();
    for (let attempt = 0; attempt < 5; attempt += 1)
      await expect(verify("111111")).rejects.toThrow();
    await expect(verify()).rejects.toThrow();
  });

  it("allows only one concurrent successful OTP consumption", async () => {
    await send();
    const results = await Promise.allSettled([verify(), verify()]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
  });

  it("prevents staff authentication through the customer phone flow", async () => {
    await User.create({
      name: "Fictional Admin",
      email: "admin@example.test",
      emailVerified: true,
      phone: "9000000091",
      role: "admin",
      active: true,
    });
    await expect(send()).rejects.toThrow("staff");
  });

  it("uses Better Auth rate limits for repeated OTP sends", async () => {
    const request = () =>
      getAuth().handler(
        new Request("http://127.0.0.1:3000/api/auth/phone-number/send-otp", {
          method: "POST",
          headers: {
            ...Object.fromEntries(requestHeaders),
            "content-type": "application/json",
          },
          body: JSON.stringify({ phoneNumber: "9000000091" }),
        }),
      );
    expect((await request()).status).toBe(200);
    expect((await request()).status).toBe(200);
    expect((await request()).status).toBe(200);
    expect((await request()).status).toBe(429);
  });
});
