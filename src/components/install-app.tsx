"use client";
import { useState, useSyncExternalStore, type ReactNode } from "react";

type InstallPrompt = Event & { prompt: () => Promise<void> };
declare global {
  interface Window {
    /** Set by the root layout's inline script, whichever page Chrome's install offer fires on. */
    __installPrompt?: InstallPrompt;
    __appInstalled?: boolean;
  }
}

function subscribe(change: () => void) {
  addEventListener("beforeinstallprompt", change);
  addEventListener("appinstalled", change);
  return () => {
    removeEventListener("beforeinstallprompt", change);
    removeEventListener("appinstalled", change);
  };
}

/** Opened as the installed app (or the Android app) or installed just now; offered by the browser; or neither. */
function readState() {
  const standalone =
    matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone || window.__appInstalled) return "installed";
  return window.__installPrompt ? "offer" : "none";
}

/**
 * The browser's own "Install app" (Chrome and Edge on Android and desktop), shown only when the
 * browser offers it; `children` are the other ways in (APK, iPhone). Inside the app there is
 * nothing left to install.
 */
export function InstallApp({ mr, children }: { mr: boolean; children: ReactNode }) {
  const state = useSyncExternalStore(subscribe, readState, () => "none");
  // the browser's offer can be shown only once
  const [asked, setAsked] = useState(false);
  if (state === "installed")
    return (
      <p role="status" className="success-message">
        {mr ? "तुम्ही Agarwal ॲप वापरत आहात." : "You’re using the Agarwal app."}
      </p>
    );
  return (
    <>
      {state === "offer" && !asked && (
        <button
          type="button"
          className="primary-button"
          onClick={() => {
            setAsked(true);
            void window.__installPrompt?.prompt();
          }}
        >
          {mr ? "ॲप इन्स्टॉल करा" : "Install the app"}
        </button>
      )}
      {children}
    </>
  );
}
