import bcrypt from "bcryptjs";
import { ObjectId, MongoClient } from "mongodb";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { phoneNumber } from "better-auth/plugins";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { getEnv } from "../env";
import { originVariants } from "./origin";
import { sendLoginCode } from "./sms";

type AuthInstance = ReturnType<typeof buildAuth>;
const instances = new Map<string, AuthInstance>();
const mockChallenges = new Map<
  string,
  { expiresAt: number; attempts: number }
>();

function objectId(value: string): ObjectId {
  return new ObjectId(value);
}

function buildAuth() {
  const env = getEnv();
  const client = new MongoClient(env.MONGODB_URI);
  const db = client.db();

  return betterAuth({
    appName: "AGARWAL GENERAL STORES",
    baseURL: env.APP_ORIGIN,
    secret: env.BETTER_AUTH_SECRET ?? env.AUTH_SECRET,
    trustedOrigins: originVariants(env.APP_ORIGIN),
    database: mongodbAdapter(db, { client, transaction: true }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      password: {
        hash: (password) => bcrypt.hash(password, 12),
        verify: ({ hash, password }) => bcrypt.compare(password, hash),
      },
    },
    user: {
      modelName: "users",
      additionalFields: {
        // everyone is a customer; staff carry one extra role, granted only from the Super Admin page
        roles: {
          type: "string[]",
          required: true,
          defaultValue: ["customer"],
          input: false,
        },
        active: {
          type: "boolean",
          required: true,
          defaultValue: true,
          input: false,
        },
        locale: {
          type: ["en", "mr"],
          required: true,
          defaultValue: "en",
        },
      },
    },
    session: {
      modelName: "authSessions",
      expiresIn: 7 * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
      freshAge: 12 * 60 * 60,
    },
    account: { modelName: "authAccounts" },
    verification: {
      modelName: "authVerifications",
      storeIdentifier: "hashed",
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      modelName: "authRateLimits",
      window: 60,
      max: 100,
      customRules: {
        "/phone-number/send-otp": { window: 60, max: 3 },
        "/phone-number/verify": { window: 60, max: 10 },
        "/sign-in/phone-number": { window: 60, max: 5 },
        "/sign-in/email": { window: 60, max: 5 },
      },
    },
    advanced: {
      cookies: {
        session_token: {
          name: "ags_session",
          attributes: { sameSite: "lax", httpOnly: true, path: "/" },
        },
      },
      database: { generateId: false, joins: true },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const user = await db.collection("users").findOne({
              _id: objectId(session.userId),
              active: true,
            });
            if (!user) return false;
            if ((user.roles as string[] | undefined)?.some((role) => role !== "customer"))
              return {
                data: {
                  ...session,
                  expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
                },
              };
          },
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (
          ctx.path === "/phone-number/send-otp" ||
          ctx.path === "/phone-number/verify" ||
          ctx.path === "/sign-in/phone-number"
        ) {
          const phone = String(ctx.body?.phoneNumber ?? "");
          const user = await db.collection("users").findOne({ phone });
          if (user && user.active !== true)
            throw new APIError("FORBIDDEN", {
              message: "This account is not active. Please contact the store.",
            });
          if (user && !user.email)
            await db.collection("users").updateOne(
              { _id: user._id },
              {
                $set: {
                  email: `${phone}@phone.ags.invalid`,
                  emailVerified: false,
                },
              },
            );
        }
        if (ctx.path === "/sign-in/email") {
          const email = String(ctx.body?.email ?? "").toLowerCase();
          const user = await db.collection("users").findOne({ email });
          if (!user || user.active !== true)
            throw new APIError("UNAUTHORIZED", {
              message: "Invalid email or password.",
            });
        }
      }),
    },
    plugins: [
      phoneNumber({
        otpLength: 6,
        expiresIn: 5 * 60,
        allowedAttempts: 5,
        phoneNumberValidator: (phone) => /^[6-9]\d{9}$/.test(phone),
        sendOTP: async ({ phoneNumber, code }) => {
          if (env.MOCK_OTP === "true") {
            mockChallenges.set(phoneNumber, {
              expiresAt: Date.now() + 5 * 60 * 1000,
              attempts: 0,
            });
            return;
          }
          await sendLoginCode(phoneNumber, code);
        },
        ...(env.MOCK_OTP === "true"
          ? {
              verifyOTP: ({ phoneNumber, code }) => {
                const challenge = mockChallenges.get(phoneNumber);
                if (
                  !challenge ||
                  challenge.expiresAt <= Date.now() ||
                  challenge.attempts >= 5
                ) {
                  mockChallenges.delete(phoneNumber);
                  return false;
                }
                challenge.attempts += 1;
                if (code !== env.MOCK_OTP_CODE) return false;
                mockChallenges.delete(phoneNumber);
                return true;
              },
            }
          : {}),
        signUpOnVerification: {
          getTempEmail: (phone) => `${phone}@phone.ags.invalid`,
          getTempName: () => "Neighbour",
        },
        schema: {
          user: {
            fields: {
              phoneNumber: "phone",
              phoneNumberVerified: "phoneVerified",
            },
          },
        },
      }),
      nextCookies(),
    ],
    telemetry: { enabled: false },
  });
}

/** Staff sessions last 12 hours from sign-in. Better Auth extends `expiresAt` on activity, so the create hook alone
 *  cannot enforce that; the cap is checked on every read and an over-age staff session is deleted. */
export const STAFF_SESSION_MS = 12 * 60 * 60 * 1000;
export async function sessionUserId(headers: Headers): Promise<string | null> {
  const auth = getAuth();
  const found = await auth.api.getSession({ headers });
  if (!found) return null;
  const roles = (found.user as { roles?: string[] }).roles ?? [];
  const age = Date.now() - new Date(found.session.createdAt).getTime();
  if (roles.some((role) => role !== "customer") && age > STAFF_SESSION_MS) {
    await (await auth.$context).internalAdapter.deleteSession(found.session.token);
    return null;
  }
  return found.user.id;
}

export function getAuth() {
  const env = getEnv();
  const key = `${env.MONGODB_URI}|${env.APP_ORIGIN}|${env.BETTER_AUTH_SECRET ?? env.AUTH_SECRET}`;
  let auth = instances.get(key);
  if (!auth) {
    auth = buildAuth();
    instances.set(key, auth);
  }
  return auth;
}
