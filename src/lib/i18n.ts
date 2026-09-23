import "server-only";
import { cookies } from "next/headers";
import type { Locale } from "./locale-types";

export async function currentLocale(): Promise<Locale> {
  return (await cookies()).get("ags_locale")?.value === "mr" ? "mr" : "en";
}
