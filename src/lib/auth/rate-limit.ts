import { RateLimit } from "../db/models";
import { connectDB } from "../db/connect";
export async function rateLimit(
  key: string,
  limit: number,
  windowMs = 15 * 60 * 1000,
) {
  await connectDB();
  const now = Date.now();
  const bucket = Math.floor(now / windowMs);
  const record = await RateLimit.findOneAndUpdate(
    { key: `${key}:${bucket}` },
    {
      $inc: { count: 1 },
      $setOnInsert: { expiresAt: new Date((bucket + 1) * windowMs) },
    },
    { upsert: true, returnDocument: "after" },
  );
  if (record.count > limit)
    throw new Error("Too many attempts. Please try again later.");
}
