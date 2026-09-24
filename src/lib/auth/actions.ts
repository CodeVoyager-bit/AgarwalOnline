"use server";
import { z } from "zod";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuditLog, User } from "../db/models";
import { getEnv } from "../env";
import { connectDB } from "../db/connect";
import { phoneSchema } from "./otp";
import { getAuth } from "./better-auth";
import {
  ensureStaffCredential,
  hashStaffPassword,
  upsertCredential,
} from "./staff-credentials";
import { rateLimit } from "./rate-limit";
import { digest } from "./crypto";
import { log } from "../logger";
import { isAllowedOrigin } from "./origin";
import { staffHome, type Role } from "./permissions";
export type AuthState = {
  error?: string;
  challengeId?: string;
  phone?: string;
  email?: string;
  newAccount?: boolean;
};
async function checkOrigin() {
  const origin = (await headers()).get("origin");
  if (!isAllowedOrigin(origin, getEnv().APP_ORIGIN))
    throw new Error("Invalid request origin.");
}
function safeError(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0].message;
  const message = error instanceof Error ? error.message : "";
  if (
    /^(Too many|Invalid email|Invalid.*(?:code|OTP)|This code|This account|SMS service|Unable to send)/i.test(
      message,
    )
  )
    return message;
  log("error", "auth.unexpected-error", { error });
  return "Unable to sign in. Please try again later.";
}
/** Staff go straight to their workspace; everyone else to the account, or the basket when a guest basket was merged. */
function landing(roles: readonly Role[], mergedBasket: boolean) {
  return mergedBasket ? "/cart" : (staffHome(roles) ?? "/account");
}
export async function customerPasswordLoginAction(
  _previous: AuthState,
  form: FormData,
): Promise<AuthState> {
  let target = "/account";
  try {
    await checkOrigin();
    await connectDB();
    const input = z
      .object({
        phone: phoneSchema,
        password: z.string().min(1).max(128),
      })
      .parse(Object.fromEntries(form));
    await rateLimit(`customer-password:${digest(input.phone)}`, 5);
    const user = await User.findOne({ phone: input.phone, active: true });
    if (!user)
      return { error: "Invalid mobile number or password.", phone: input.phone };
    try {
      await getAuth().api.signInPhoneNumber({
        body: { phoneNumber: input.phone, password: input.password },
        headers: await headers(),
      });
    } catch {
      return { error: "Invalid mobile number or password.", phone: input.phone };
    }
    const { mergeGuestCart } = await import("../commerce/guest-cart");
    const merged = await mergeGuestCart(String(user._id));
    target = landing(user.roles as Role[], merged.added > 0);
    await AuditLog.create({ actorId: user._id, action: "auth.customer.password_login" });
  } catch (error) {
    return { error: safeError(error) };
  }
  redirect(target);
}
export async function customerEmailLoginAction(
  _previous: AuthState,
  form: FormData,
): Promise<AuthState> {
  let target = "/account";
  try {
    await checkOrigin();
    await connectDB();
    const input = z
      .object({
        email: z.string().trim().toLowerCase().email(),
        password: z.string().min(1).max(128),
      })
      .parse(Object.fromEntries(form));
    await rateLimit(`customer-email:${digest(input.email)}`, 5);
    const user = await User.findOne({ email: input.email, active: true });
    if (!user) return { error: "Invalid email or password.", email: input.email };
    try {
      await ensureStaffCredential(String(user._id));
      await getAuth().api.signInEmail({
        body: { email: input.email, password: input.password },
        headers: await headers(),
      });
    } catch {
      return { error: "Invalid email or password.", email: input.email };
    }
    const { mergeGuestCart } = await import("../commerce/guest-cart");
    const merged = await mergeGuestCart(String(user._id));
    target = landing(user.roles as Role[], merged.added > 0);
    await AuditLog.create({ actorId: user._id, action: "auth.customer.email_login" });
  } catch (error) {
    return { error: safeError(error) };
  }
  redirect(target);
}
export async function sendOTPAction(
  _previous: AuthState,
  form: FormData,
): Promise<AuthState> {
  try {
    await checkOrigin();
    await connectDB();
    const phone = phoneSchema.parse(form.get("phone"));
    const intent = z.enum(["signup", "signin"]).parse(form.get("intent"));
    const email =
      intent === "signup"
        ? z.string().trim().toLowerCase().email().parse(form.get("email"))
        : undefined;
    await rateLimit(`otp:${digest(phone)}`, 3);
    const existing = await User.findOne({ phone });
    if (existing && !existing.active)
      throw new Error("This account is not active. Please contact the store.");
    if (intent === "signup" && existing)
      return { error: "An account already exists for this number. Sign in instead." };
    if (intent === "signin" && !existing)
      return { error: "No account found for this number. Create an account first." };
    if (email && (await User.exists({ email })))
      return { error: "An account already exists for this email. Sign in instead." };
    if (existing && !existing.email)
      await User.updateOne(
        { _id: existing._id },
        {
          $set: {
            email: `${phone}@phone.ags.invalid`,
            emailVerified: false,
          },
        },
      );
    await getAuth().api.sendPhoneNumberOTP({
      body: { phoneNumber: phone },
      headers: await headers(),
    });
    return { phone, email, challengeId: "better-auth", newAccount: !existing };
  } catch (error) {
    return { error: safeError(error) };
  }
}
export async function verifyOTPAction(
  _previous: AuthState,
  form: FormData,
): Promise<AuthState> {
  let target = "/account";
  try {
    await checkOrigin();
    await connectDB();
    const phone = phoneSchema.parse(form.get("phone"));
    const code = z
      .string()
      .regex(/^\d{6}$/)
      .parse(form.get("code"));
    const nameValue = form.get("name");
    const name = nameValue
      ? z.string().trim().min(2).max(80).parse(nameValue)
      : undefined;
    const existingBeforeVerification = await User.findOne({ phone });
    const email = existingBeforeVerification
      ? undefined
      : z.string().trim().toLowerCase().email().parse(form.get("email"));
    if (email && (await User.exists({ email })))
      return { error: "An account already exists for this email. Sign in instead." };
    const passwordValue = form.get("password");
    const password = existingBeforeVerification
      ? undefined
      : z.string().min(8).max(128).parse(passwordValue);
    // the client blocks a mismatch, but the client is not the authority
    if (password && form.get("confirmPassword") !== password)
      return { error: "Passwords do not match." };
    await rateLimit(`verify:${digest(phone)}`, 10);
    const result = await getAuth().api.verifyPhoneNumber({
      body: { phoneNumber: phone, code },
      headers: await headers(),
    });
    if (!result.user) throw new Error("Invalid or expired code.");
    if (name || email) {
      await User.updateOne(
        { _id: result.user.id },
        { $set: { ...(name ? { name } : {}), ...(email ? { email } : {}) } },
      );
    }
    if (password)
      await upsertCredential(result.user.id, await hashStaffPassword(password));
    const { mergeGuestCart } = await import("../commerce/guest-cart");
    const merged = await mergeGuestCart(result.user.id);
    const signedIn = await User.findById(result.user.id).select("roles");
    target = landing((signedIn?.roles ?? []) as Role[], merged.added > 0);
    await AuditLog.create({
      actorId: result.user.id,
      action: "auth.customer.login",
    });
  } catch (error) {
    return { error: safeError(error) };
  }
  redirect(target);
}
export async function logoutAction() {
  await checkOrigin();
  await getAuth().api.signOut({ headers: await headers() });
  redirect("/");
}
