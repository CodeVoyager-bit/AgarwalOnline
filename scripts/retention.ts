import { createHash } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db/connect";
import { getEnv } from "../src/lib/env";
import { UploadedEvidence } from "../src/lib/evidence/models";
import { AuditLog } from "../src/lib/db/models";
import { Notification } from "../src/lib/engagement/models";
import { log } from "../src/lib/logger";

const env = getEnv();
await connectDB();
const now = new Date();
const expired = await UploadedEvidence.find({
  expiresAt: { $lte: now },
}).select("provider storageKey");
for (const file of expired) {
  if (file.provider === "local")
    await unlink(
      path.join(process.cwd(), ".local", "uploads", file.storageKey),
    ).catch(() => undefined);
  else if (
    env.CLOUDINARY_CLOUD_NAME &&
    env.CLOUDINARY_API_KEY &&
    env.CLOUDINARY_API_SECRET
  ) {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHash("sha1")
      .update(
        `public_id=${file.storageKey}&timestamp=${timestamp}${env.CLOUDINARY_API_SECRET}`,
      )
      .digest("hex");
    const body = new FormData();
    body.set("public_id", file.storageKey);
    body.set("timestamp", String(timestamp));
    body.set("api_key", env.CLOUDINARY_API_KEY);
    body.set("signature", signature);
    await fetch(
      `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/destroy`,
      {
        method: "POST",
        body,
        signal: AbortSignal.timeout(15000),
      },
    ).catch(() => undefined);
  }
}
const [
  evidence,
  notifications,
  audits,
  authSessions,
  authVerifications,
  authRateLimits,
] = await Promise.all([
  UploadedEvidence.deleteMany({ expiresAt: { $lte: now } }),
  Notification.deleteMany({ expiresAt: { $lte: now } }),
  AuditLog.deleteMany({
    at: {
      $lte: new Date(now.getTime() - env.AUDIT_RETENTION_DAYS * 86400 * 1000),
    },
  }),
  mongoose.connection
    .collection("authSessions")
    .deleteMany({ expiresAt: { $lte: now } }),
  mongoose.connection
    .collection("authVerifications")
    .deleteMany({ expiresAt: { $lte: now } }),
  mongoose.connection
    .collection("authRateLimits")
    .deleteMany({ expiresAt: { $lte: now } }),
]);
log("info", "retention.completed", {
  evidence: evidence.deletedCount,
  notifications: notifications.deletedCount,
  audits: audits.deletedCount,
  authSessions: authSessions.deletedCount,
  authVerifications: authVerifications.deletedCount,
  authRateLimits: authRateLimits.deletedCount,
});
await mongoose.disconnect();
