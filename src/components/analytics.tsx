"use client";
import Link from "next/link";
import Script from "next/script";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { Locale } from "@/lib/locale-types";

/** "yes" or "no" once the shopper has answered. Nothing loads from Google before a "yes". */
const KEY = "ags-analytics";
/** A link to this hash ("Cookie choices" in the footer, the privacy policy) asks again. */
export const COOKIE_CHOICES = "cookie-choices";

// a private window can refuse storage: the answer then lasts until the tab closes
let inMemory: string | null = null;
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}
function stored() {
  try {
    return window.localStorage.getItem(KEY) ?? inMemory;
  } catch {
    return inMemory;
  }
}
function store(value: "yes" | "no") {
  inMemory = value;
  try {
    window.localStorage.setItem(KEY, value);
  } catch {
    // kept in memory above
  }
  listeners.forEach((listener) => listener());
}

/** Google's own off switch for a tag already on the page, and its cookies gone. */
function stopTracking(id: string, off: boolean) {
  (window as unknown as Record<string, boolean>)[`ga-disable-${id}`] = off;
  if (!off) return;
  const site = window.location.hostname.replace(/^www\./, "");
  for (const name of document.cookie.split(/;\s*/).map((pair) => pair.split("=")[0])) {
    if (!name.startsWith("_ga")) continue;
    for (const domain of ["", `; domain=.${site}`]) document.cookie = `${name}=; Max-Age=0; path=/${domain}`;
  }
}

/**
 * Google Analytics 4, only after the shopper says yes (the DPDP Act wants consent first), with
 * Google signals and ad personalisation off so the privacy policy's "no advertising" stays true.
 * Page changes inside the app are counted by the GA4 stream's enhanced measurement (browser
 * history events), so nothing here tracks route changes.
 */
export function Analytics({ id, locale }: { id: string; locale: Locale }) {
  // the server can't see the answer: nothing renders until the browser has read it
  const choice = useSyncExternalStore(subscribe, stored, () => "unknown");
  const [asking, setAsking] = useState(
    () => typeof window !== "undefined" && window.location.hash === `#${COOKIE_CHOICES}`,
  );
  useEffect(() => {
    const clearHash = () => {
      if (window.location.hash !== `#${COOKIE_CHOICES}`) return false;
      // the same link must work again next time
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
      return true;
    };
    clearHash();
    const ask = () => {
      if (clearHash()) setAsking(true);
    };
    window.addEventListener("hashchange", ask);
    return () => window.removeEventListener("hashchange", ask);
  }, []);

  const answer = (value: "yes" | "no") => {
    stopTracking(id, value === "no");
    store(value);
    setAsking(false);
  };
  const mr = locale === "mr";
  return (
    <>
      {choice === "yes" && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${id}`} strategy="afterInteractive" />
          <Script id="google-analytics" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${id}',{allow_google_signals:false,allow_ad_personalization_signals:false});`}
          </Script>
        </>
      )}
      {choice !== "unknown" && (choice === null || asking) && (
        <section className="consent-banner" id={COOKIE_CHOICES} aria-labelledby="consent-title" lang={locale}>
          <h2 id="consent-title">{mr ? "तुमची भेट मोजू का?" : "Can we count your visit?"}</h2>
          <p>
            {mr
              ? "लोक कोणती पाने वापरतात हे पाहून दुकान सुधारण्यासाठी आम्हाला Google Analytics कुकीज वापरायच्या आहेत. जाहिराती नाहीत, काहीही विकले जात नाही. "
              : "We'd like to use Google Analytics cookies to see which pages people use, so we can make the shop better. No ads, and nothing is sold. "}
            <Link href="/p/privacy-policy#cookies">{mr ? "अधिक माहिती" : "How we use it"}</Link>
          </p>
          <div>
            <button type="button" className="secondary-button" onClick={() => answer("no")}>
              {mr ? "नको" : "No thanks"}
            </button>
            <button type="button" className="primary-button" onClick={() => answer("yes")}>
              {mr ? "चालेल" : "Allow"}
            </button>
          </div>
        </section>
      )}
    </>
  );
}
