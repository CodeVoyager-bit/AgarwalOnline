import Link from "next/link";
import { currentLocale } from "@/lib/i18n";

export default async function NotFound() {
  const mr = (await currentLocale()) === "mr";
  return (
    <div className="auth-card empty-state">
      <span className="eyebrow">404</span>
      <h1>{mr ? "हे पान सापडले नाही." : "We couldn’t find that page."}</h1>
      <p>{mr ? "पान हलवले असेल किंवा ही वस्तू आता दुकानात नसेल." : "The page may have moved or the item is no longer listed."}</p>
      <div className="split-actions utility-actions">
        <Link className="primary-button" href="/catalog">
          {mr ? "दुकान पाहा" : "Browse the store"}
        </Link>
        <Link className="secondary-button" href="/">
          {mr ? "मुख्य पानावर जा" : "Go home"}
        </Link>
      </div>
    </div>
  );
}
