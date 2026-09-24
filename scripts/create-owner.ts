// One-time bootstrap: creates (or resets) the store owner, a super-admin who can then add staff.
// Usage: npm run owner:create   (answers are prompted; the password is typed hidden and never logged)
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import mongoose from "mongoose";
import { z } from "zod";
import { connectDB } from "../src/lib/db/connect";
import { AuditLog, User } from "../src/lib/db/models";
import {
  hashStaffPassword,
  revokeStaffSessions,
  setStaffCredential,
} from "../src/lib/auth/staff-credentials";

async function ask(question: string) {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

/** Reads a line with echo off, so the password never shows on screen or in scrollback. */
function askSecret(question: string) {
  return new Promise<string>((resolve, reject) => {
    if (!stdin.isTTY)
      return reject(new Error("Run this in an interactive terminal."));
    stdout.write(question);
    let value = "";
    const done = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", onData);
      stdout.write("\n");
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\u0003") {
          done();
          process.exit(130);
        } else if (ch === "\r" || ch === "\n") {
          done();
          resolve(value);
          return;
        } else if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    stdin.on("data", onData);
  });
}

const input = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(180),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number."),
  password: z.string().min(8).max(128),
});

const data = input.parse({
  name: await ask("Owner name: "),
  email: await ask("Owner email: "),
  phone: await ask("Owner mobile (10 digits): "),
  password: await askSecret("Password (min 8, hidden): "),
});
if ((await askSecret("Confirm password: ")) !== data.password)
  throw new Error("Passwords do not match.");

await connectDB();
const { name: database, host } = mongoose.connection;
const byEmail = await User.findOne({ email: data.email });
const byPhone = await User.findOne({ phone: data.phone });
if (byPhone && String(byPhone._id) !== String(byEmail?._id))
  throw new Error(`Mobile ${data.phone} already belongs to another account.`);

const user =
  byEmail ??
  (await User.create({
    name: data.name,
    email: data.email,
    phone: data.phone,
    role: "super-admin",
    emailVerified: true,
    active: true,
  }));
if (byEmail)
  await User.updateOne(
    { _id: user._id },
    { $set: { name: data.name, phone: data.phone, role: "super-admin", emailVerified: true, active: true } },
  );
await setStaffCredential(String(user._id), await hashStaffPassword(data.password));
await revokeStaffSessions(String(user._id)); // a reset signs out every older session
await AuditLog.create({
  actorId: user._id,
  action: byEmail ? "staff.owner.reset" : "staff.owner.create",
  target: String(user._id),
  details: { email: data.email, role: "super-admin", source: "scripts/create-owner.ts" },
});
console.log(
  `${byEmail ? "Updated" : "Created"} owner ${data.email} (super-admin) on database "${database}" at ${host}. Sign in at /staff/login.`,
);
await mongoose.disconnect();
