import { z } from "zod";
import {
  requestIdentity,
  syncConversation,
  sendMessage,
  markReceipt,
  setTyping,
  type ChatIdentity,
} from "@/lib/chat/service";
import { rateLimit } from "@/lib/auth/rate-limit";
import { isAllowedOrigin } from "@/lib/auth/origin";
import { getEnv } from "@/lib/env";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };
const noStore = { "Cache-Control": "no-store" };
const fail = (status: number, error: string) =>
  Response.json({ ok: false, error }, { status, headers: noStore });

// Every call re-checks the Better Auth session, so a revoked session stops receiving messages on its next poll.
async function handle(
  request: Request,
  run: (user: ChatIdentity) => Promise<unknown>,
) {
  let user: ChatIdentity;
  try {
    user = await requestIdentity(request.headers);
  } catch {
    return fail(401, "Sign in to continue.");
  }
  try {
    await rateLimit(`chat-event:${user.id}`, 120, 60000);
    return Response.json(
      { ok: true, data: await run(user) },
      { headers: noStore },
    );
  } catch {
    return fail(
      400,
      "This request is unavailable. Check your connection and permissions.",
    );
  }
}

export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  const after = Number(new URL(request.url).searchParams.get("after") ?? 0);
  return handle(request, (user) =>
    syncConversation(user, { conversationId: id, after }),
  );
}

const postBody = z
  .object({ type: z.enum(["send", "receipt", "typing"]) })
  .passthrough();

export async function POST(request: Request, { params }: Context) {
  if (!isAllowedOrigin(request.headers.get("origin"), getEnv().APP_ORIGIN))
    return fail(403, "Invalid request origin.");
  const { id } = await params;
  return handle(request, async (user) => {
    const { type, ...input } = postBody.parse(await request.json());
    const data = { ...input, conversationId: id };
    if (type === "send") return sendMessage(user, data);
    if (type === "receipt") return markReceipt(user, data);
    return setTyping(user, data);
  });
}
