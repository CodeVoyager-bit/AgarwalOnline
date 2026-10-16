import Link from "next/link";
import { currentLocale } from "@/lib/i18n";
import { currentUser } from "@/lib/auth/session";
export const metadata = { title: "Access restricted", robots: { index: false } };

export default async function Forbidden() {
  const [mr, user] = [(await currentLocale()) === "mr", await currentUser()];
  // someone signed out has no account to blame yet: they need to sign in first
  return (
    <section className="auth-card empty-state utility-card">
      <span className="eyebrow">{mr ? "परवानगी आवश्यक" : "PERMISSION REQUIRED"}</span>
      <h1>{mr ? "प्रवेश मर्यादित" : "Access restricted"}</h1>
      <p>
        {user
          ? mr
            ? "हे पान उघडण्याची परवानगी तुमच्या खात्याला नाही."
            : "Your account does not have permission to open this page."
          : mr
            ? "हे पान उघडण्यासाठी आधी साइन इन करा."
            : "Sign in to open this page."}
      </p>
      <Link className="primary-button" href={user ? "/account" : "/login"}>
        {user ? (mr ? "तुमच्या खात्यावर जा" : "Go to your account") : mr ? "साइन इन करा" : "Sign in"}
      </Link>
    </section>
  );
}
