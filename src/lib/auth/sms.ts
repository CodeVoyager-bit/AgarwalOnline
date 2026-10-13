import { getEnv } from "../env";

/**
 * Sends a 6-digit code (the login code or the delivery code) through MiniMoth (minimoth.dev):
 * WhatsApp first, then a text from MiniMoth's own DLT-registered sender, never a phone call. We make
 * and check the code ourselves; MiniMoth only delivers it, through the hook it offers auth systems
 * that own their codes (its "Auth0 hook": a POST of {phone, code} with the hook's token).
 */
export async function sendCode(phone: string, code: string) {
  const env = getEnv();
  if (env.MOCK_OTP === "true") return;
  if (!env.MINIMOTH_HOOK_URL || !env.MINIMOTH_HOOK_TOKEN)
    throw new Error("SMS service is not configured. Please contact the store.");

  try {
    const response = await fetch(env.MINIMOTH_HOOK_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.MINIMOTH_HOOK_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ phone: `+91${phone}`, code }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw new Error(`${response.status} ${(await response.text()).slice(0, 200)}`);
  } catch (error) {
    // MiniMoth's reason (bad token, low balance, too many codes for one number) for the server log
    console.error("MiniMoth OTP failed:", error instanceof Error ? error.message : error);
    throw new Error("Unable to send your code. Please try again later.");
  }
}
