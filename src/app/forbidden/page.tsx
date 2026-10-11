import Link from "next/link";
import { currentLocale } from "@/lib/i18n";
export const metadata = { title: "Access restricted", robots: { index: false } };

export default async function Forbidden() {
  const mr = (await currentLocale()) === "mr";
  return (
    <section className="auth-card empty-state utility-card">
      <span className="eyebrow">{mr ? "परवानगी आवश्यक" : "PERMISSION REQUIRED"}</span>
      <h1>{mr ? "प्रवेश मर्यादित" : "Access restricted"}</h1>
      <p>{mr ? "हे पान उघडण्याची परवानगी तुमच्या खात्याला नाही." : "Your account does not have permission to open this page."}</p>
      <Link className="primary-button" href="/account">
        {mr ? "तुमच्या खात्यावर जा" : "Go to your account"}
      </Link>
    </section>
  );
}
