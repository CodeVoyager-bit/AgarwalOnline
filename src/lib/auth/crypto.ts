import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
export function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
export function otpDigest(subject: string, code: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`${subject}:${code}`)
    .digest("hex");
}
export function token() {
  return randomBytes(32).toString("base64url");
}
export function otpCode() {
  return randomInt(100000, 1000000).toString();
}
export function equalHash(a: string, b: string) {
  const aa = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
