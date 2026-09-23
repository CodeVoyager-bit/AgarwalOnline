import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectDB } from "../db/connect";
import { User } from "../db/models";

export function hashStaffPassword(password: string) {
  return bcrypt.hash(password, 12);
}

/** Create or replace the Better Auth credential record a user signs in with. */
export async function upsertCredential(
  userId: string,
  passwordHash: string,
  session?: mongoose.ClientSession,
) {
  await connectDB();
  const id = new mongoose.Types.ObjectId(userId);
  const now = new Date();
  await mongoose.connection.collection("authAccounts").updateOne(
    { userId: id, providerId: "credential", accountId: userId },
    {
      $set: { password: passwordHash, updatedAt: now },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true, ...(session ? { session } : {}) },
  );
}

export async function setStaffCredential(
  userId: string,
  passwordHash: string,
  session?: mongoose.ClientSession,
) {
  await upsertCredential(userId, passwordHash, session);
  const id = new mongoose.Types.ObjectId(userId);
  await User.updateOne(
    { _id: id },
    {
      $set: { emailVerified: true },
      $unset: { passwordHash: 1 },
    },
    { ...(session ? { session } : {}) },
  );
}

export async function ensureStaffCredential(userId: string) {
  await connectDB();
  const id = new mongoose.Types.ObjectId(userId);
  const existing = await mongoose.connection
    .collection("authAccounts")
    .findOne({ userId: id, providerId: "credential", accountId: userId });
  if (existing) return;
  const user = await User.findById(id).select("+passwordHash");
  if (!user?.passwordHash) throw new Error("Invalid email or password.");
  await setStaffCredential(userId, user.passwordHash);
}

export async function revokeStaffSessions(
  userId: string,
  session?: mongoose.ClientSession,
) {
  await connectDB();
  const id = new mongoose.Types.ObjectId(userId);
  const options = session ? { session } : {};
  await mongoose.connection
    .collection("authSessions")
    .deleteMany({ userId: id }, options);
  await mongoose.connection
    .collection("sessions")
    .deleteMany({ userId: id }, options);
}
