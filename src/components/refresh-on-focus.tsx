"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-fetches the page when the tab regains focus, and every couple of minutes while it stays open. */
export function RefreshOnFocus({ everyMs = 120000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(onVisible, everyMs);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [router, everyMs]);
  return null;
}
