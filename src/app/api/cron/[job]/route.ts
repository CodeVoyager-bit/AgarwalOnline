import { timingSafeEqual } from "node:crypto";
import { expireReservations } from "@/lib/payments/service";
import { publishScheduled } from "@/lib/governance/service";
import { runRetention } from "@/lib/retention";
import { sendLowStockReport } from "@/lib/inventory/low-stock";
import { getEnv } from "@/lib/env";

export const runtime = "nodejs";

// Scheduled in vercel.json. On other hosts, run the matching npm scripts from cron instead.
const jobs: Record<string, () => Promise<unknown>> = {
  "expire-reservations": async () => ({ released: await expireReservations() }),
  "publish-scheduled": async () => ({ published: await publishScheduled() }),
  retention: runRetention,
  // vercel.json calls this once in every hour (stock-report-00 … -23); it sends at the owners' chosen hour
  "stock-report": () => sendLowStockReport(),
};

// Vercel Cron sends "Authorization: Bearer $CRON_SECRET". Without a configured secret, every call is refused.
function authorized(request: Request) {
  const secret = getEnv().CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ job: string }> },
) {
  if (!authorized(request))
    return new Response("Unauthorized", { status: 401 });
  const { job: asked } = await params;
  const job = /^stock-report-\d{2}$/.test(asked) ? "stock-report" : asked;
  if (!Object.hasOwn(jobs, job)) return new Response("Not found", { status: 404 });
  return Response.json(await jobs[job](), {
    headers: { "Cache-Control": "no-store" },
  });
}
