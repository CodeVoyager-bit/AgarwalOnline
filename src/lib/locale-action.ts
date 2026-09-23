"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { currentUser } from "./auth/session";
import { User } from "./db/models";

export async function setLocaleAction(form: FormData) {
  const locale = z.enum(["en", "mr"]).parse(form.get("locale"));
  const returnTo = z
    .string()
    .regex(/^\/(?!\/)/)
    .max(500)
    .catch("/")
    .parse(form.get("returnTo"));
  (await cookies()).set("ags_locale", locale, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 365 * 86400,
  });
  const user = await currentUser();
  if (user) await User.updateOne({ _id: user.id }, { $set: { locale } });
  redirect(returnTo);
}
