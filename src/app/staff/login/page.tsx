import { redirect } from "next/navigation";
/** Staff sign in on the same page as everyone else; the account menu opens their workspace. */
export default function StaffLogin() {
  redirect("/login");
}
