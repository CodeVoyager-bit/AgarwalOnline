import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db/connect";
import { GET } from "../src/app/api/cron/[job]/route";

const uri = process.env.TEST_MONGODB_URI;
const secret = "cron-test-secret-0123456789";
const call = (job: string, authorization?: string) =>
  GET(
    new Request(`http://127.0.0.1:3000/api/cron/${job}`, {
      headers: authorization ? { authorization } : {},
    }),
    { params: Promise.resolve({ job }) },
  );

describe("cron route authorization", () => {
  beforeAll(() => {
    Object.assign(process.env, {
      MONGODB_URI: uri ?? "mongodb://127.0.0.1:1/unused",
      APP_ORIGIN: "http://127.0.0.1:3000",
      AUTH_SECRET: "test-secret-".repeat(4),
    });
  });
  it("refuses every call when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    expect((await call("retention", `Bearer ${secret}`)).status).toBe(401);
  });
  it("refuses a missing or wrong secret and unknown jobs", async () => {
    process.env.CRON_SECRET = secret;
    expect((await call("retention")).status).toBe(401);
    expect((await call("retention", "Bearer wrong")).status).toBe(401);
    expect((await call("constructor", `Bearer ${secret}`)).status).toBe(404);
  });
});

describe.skipIf(!uri)("cron jobs against a database", () => {
  beforeAll(async () => {
    if (!uri?.includes("/ags_test")) throw Error("Isolated DB required");
    process.env.MONGODB_URI = uri;
    process.env.CRON_SECRET = secret;
    await connectDB();
    await mongoose.connection.dropDatabase();
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  it("runs each job and retention removes expired records only", async () => {
    const sessions = mongoose.connection.collection("authSessions");
    await sessions.insertMany([
      { token: "expired", expiresAt: new Date(Date.now() - 1000) },
      { token: "live", expiresAt: new Date(Date.now() + 60000) },
    ]);
    // better-auth's sign-in attempt rows carry the IP address and only a lastRequest time
    const attempts = mongoose.connection.collection("authRateLimits");
    await attempts.insertMany([
      { key: "203.0.113.9|/sign-in/email", count: 1, lastRequest: Date.now() - 2 * 86400 * 1000 },
      { key: "203.0.113.9|/sign-in/phone-number", count: 1, lastRequest: Date.now() },
    ]);
    for (const job of ["expire-reservations", "publish-scheduled"]) {
      const response = await call(job, `Bearer ${secret}`);
      expect(response.status).toBe(200);
    }
    const retention = await call("retention", `Bearer ${secret}`);
    expect(retention.status).toBe(200);
    const removed = await retention.json();
    expect(removed.authSessions).toBe(1);
    expect(removed.authRateLimits).toBe(1);
    expect((await attempts.find().toArray()).map((a) => a.key)).toEqual(["203.0.113.9|/sign-in/phone-number"]);
    expect(
      (await sessions.find().toArray()).map((s) => s.token),
    ).toEqual(["live"]);
  });
});
