import { getEnv } from "../env";

export async function sendLoginCode(phone: string, code: string) {
  const env = getEnv();
  if (env.MOCK_OTP === "true") return;
  if (!env.SMS_API_URL || !env.SMS_API_TOKEN)
    throw new Error("SMS service is not configured. Please contact the store.");

  try {
    const response = await fetch(env.SMS_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.SMS_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: `+91${phone}`,
        message: `Your AGARWAL GENERAL STORES code is ${code}. Expires in 5 minutes.`,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("SMS_FAILED");
  } catch {
    throw new Error("Unable to send your code. Please try again later.");
  }
}
