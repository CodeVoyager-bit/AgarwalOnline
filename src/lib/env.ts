import { z } from "zod";
const schema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    MONGODB_URI: z.string().startsWith("mongodb"),
    APP_ORIGIN: z.string().url(),
    AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_SECRET: z.string().min(32).optional(),
    MOCK_OTP: z.enum(["true", "false"]).default("false"),
    MOCK_OTP_CODE: z
      .string()
      .regex(/^\d{6}$/)
      .default("246810"),
    CRON_SECRET: z.string().min(16).optional(),
    SMS_API_URL: z.string().optional(),
    SMS_API_TOKEN: z.string().optional(),
    CLOUDINARY_CLOUD_NAME: z.string().optional(),
    CLOUDINARY_API_KEY: z.string().optional(),
    CLOUDINARY_API_SECRET: z.string().optional(),
    EVIDENCE_RETENTION_DAYS: z.coerce
      .number()
      .int()
      .min(7)
      .max(3650)
      .default(90),
    AUDIT_RETENTION_DAYS: z.coerce
      .number()
      .int()
      .min(90)
      .max(3650)
      .default(730),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && env.MOCK_OTP === "true")
      ctx.addIssue({
        code: "custom",
        message: "Mock OTP is forbidden in production",
        path: ["MOCK_OTP"],
      });
    if (env.NODE_ENV === "production" && !env.APP_ORIGIN.startsWith("https://"))
      ctx.addIssue({
        code: "custom",
        message: "Production requires HTTPS",
        path: ["APP_ORIGIN"],
      });
    if (Boolean(env.SMS_API_URL) !== Boolean(env.SMS_API_TOKEN))
      ctx.addIssue({
        code: "custom",
        message: "SMS URL and token must be configured together",
        path: ["SMS_API_URL"],
      });
    const cloudinary = [
      env.CLOUDINARY_CLOUD_NAME,
      env.CLOUDINARY_API_KEY,
      env.CLOUDINARY_API_SECRET,
    ].filter(Boolean);
    if (cloudinary.length > 0 && cloudinary.length < 3)
      ctx.addIssue({
        code: "custom",
        message: "All Cloudinary credentials are required",
        path: ["CLOUDINARY_CLOUD_NAME"],
      });
  });
export function parseEnv(source: Record<string, string | undefined>) {
  return schema.parse(source);
}
export function getEnv() {
  return parseEnv(process.env);
}
export function databaseConfigured() {
  return Boolean(process.env.MONGODB_URI);
}
