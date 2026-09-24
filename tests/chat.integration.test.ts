import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { makeSignature } from "better-auth/crypto";
import { connectDB } from "../src/lib/db/connect";
import { User } from "../src/lib/db/models";
import { ChatConversation, ChatMessage, ChatReceipt } from "../src/lib/chat/models";
import { getAuth } from "../src/lib/auth/better-auth";
import { GET, POST } from "../src/app/api/chat/[id]/route";
const uri = process.env.TEST_MONGODB_URI;
describe.skipIf(!uri)("Support chat polling security and recovery", () => {
  const origin = "http://127.0.0.1:3002";
  let customerId: string;
  let conversationId: string;
  let cookies: Record<string, string>;
  beforeAll(async () => {
    if (!uri?.includes("/ags_test")) throw Error("Isolated DB required");
    Object.assign(process.env, {
      MONGODB_URI: uri,
      APP_ORIGIN: origin,
      AUTH_SECRET: "test-secret-".repeat(4),
      MOCK_OTP: "true",
    });
    await connectDB();
    for (const m of [User, ChatConversation, ChatMessage, ChatReceipt])
      await m.init();
  });
  beforeEach(async () => {
    for (const m of Object.values(mongoose.models)) await m.deleteMany({});
    await mongoose.connection.collection("authSessions").deleteMany({});
    const users = await User.create([
      { phone: "9000000091", name: "Customer", roles: ["customer"] },
      { phone: "9000000092", name: "Other customer", roles: ["customer"] },
      { phone: "9000000093", name: "Admin", roles: ["customer", "admin"] },
    ]);
    customerId = String(users[0]._id);
    // same signing as better-auth's test-utils plugin, without adding it to the app config
    const ctx = await getAuth().$context;
    cookies = {};
    for (const [i, name] of ["customer", "other", "admin"].entries()) {
      const { token } = await ctx.internalAdapter.createSession(
        String(users[i]._id),
      );
      cookies[name] =
        `${ctx.authCookies.sessionToken.name}=${token}.${await makeSignature(token, ctx.secret)}`;
    }
    const c = await ChatConversation.create({
      customerId,
      title: "Fictional support conversation",
    });
    conversationId = String(c._id);
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  const context = () => ({ params: Promise.resolve({ id: conversationId }) });
  async function poll(cookie: string, after = 0) {
    const response = await GET(
      new Request(`${origin}/api/chat/${conversationId}?after=${after}`, {
        headers: { cookie },
      }),
      context(),
    );
    return { status: response.status, ...(await response.json()) };
  }
  async function post(
    cookie: string,
    body: Record<string, unknown>,
    from = origin,
  ) {
    const response = await POST(
      new Request(`${origin}/api/chat/${conversationId}`, {
        method: "POST",
        headers: { cookie, origin: from, "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      context(),
    );
    return { status: response.status, ...(await response.json()) };
  }
  const send = (cookie: string, body: string, internal = false, id = crypto.randomUUID()) =>
    post(cookie, { type: "send", clientMessageId: id, body, internal });

  it("rejects unauthenticated, cross-site and other-customer requests", async () => {
    expect((await poll("ags_session=bad-token")).status).toBe(401);
    expect((await poll("")).status).toBe(401);
    expect((await poll(cookies.other)).ok).toBe(false);
    expect((await send(cookies.other, "Not my conversation")).ok).toBe(false);
    const crossSite = await post(
      cookies.customer,
      { type: "send", clientMessageId: crypto.randomUUID(), body: "hi" },
      "https://evil.example",
    );
    expect(crossSite.status).toBe(403);
    expect(await ChatMessage.countDocuments()).toBe(0);
  });

  it("never returns internal notes to the customer", async () => {
    expect((await send(cookies.customer, "Where is my order?")).ok).toBe(true);
    expect((await send(cookies.customer, "Sneaky note", true)).ok).toBe(false);
    expect((await send(cookies.admin, "Internal investigation note", true)).ok).toBe(true);
    expect((await send(cookies.admin, "It leaves today.")).ok).toBe(true);
    const customerView = (await poll(cookies.customer)).data.messages.map(
      (m: { body: string }) => m.body,
    );
    expect(customerView).toEqual(["Where is my order?", "It leaves today."]);
    expect((await poll(cookies.admin)).data.messages).toHaveLength(3);
  });

  it("deduplicates retries, resumes from the cursor and records receipts", async () => {
    const id = crypto.randomUUID();
    const first = await send(cookies.customer, "Hello", false, id);
    const retry = await send(cookies.customer, "Hello", false, id);
    expect(retry.data.id).toBe(first.data.id);
    expect(await ChatMessage.countDocuments()).toBe(1);
    const synced = await poll(cookies.admin);
    await send(cookies.admin, "Hi, how can we help?");
    const next = await poll(cookies.admin, synced.data.cursor);
    expect(next.data.messages.map((m: { body: string }) => m.body)).toEqual([
      "Hi, how can we help?",
    ]);
    await post(cookies.customer, { type: "receipt", sequence: 2, read: true });
    const receipt = (await poll(cookies.admin)).data.receipts.find(
      (r: { userId: string }) => r.userId === customerId,
    );
    expect(receipt).toMatchObject({ delivered: 2, read: 2 });
    expect((await post(cookies.customer, { type: "receipt", sequence: 99, read: true })).ok).toBe(false);
  });

  it("shows typing to the other side only, and clears it", async () => {
    await post(cookies.customer, { type: "typing", typing: true });
    expect((await poll(cookies.admin)).data.typing).toBe(true);
    expect((await poll(cookies.customer)).data.typing).toBe(false);
    await post(cookies.customer, { type: "typing", typing: false });
    expect((await poll(cookies.admin)).data.typing).toBe(false);
  });

  it("stops delivery as soon as the session is revoked", async () => {
    expect((await poll(cookies.customer)).ok).toBe(true);
    await (await getAuth().$context).internalAdapter.deleteUserSessions(
      customerId,
    );
    await send(cookies.admin, "Must not reach a revoked session");
    expect((await poll(cookies.customer)).status).toBe(401);
  });
});
