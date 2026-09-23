"use client";
import { useEffect, useState } from "react";
import { Clock3 } from "lucide-react";
import { formatDuration, minutesUntilCutoff } from "@/lib/display";
import { copy, type Locale } from "@/lib/locale-types";

/**
 * Honest urgency: counts down to the store's real same-day cutoff.
 * Renders the server's value first, then re-syncs after mount so hydration
 * never mismatches on a minute boundary.
 */
export function DeliveryPromise({
  cutoffHour,
  initialMinutes,
  locale,
}: {
  cutoffHour: number;
  initialMinutes: number;
  locale: Locale;
}) {
  const [minutes, setMinutes] = useState(initialMinutes);
  useEffect(() => {
    const sync = () => setMinutes(minutesUntilCutoff(cutoffHour));
    sync();
    const timer = window.setInterval(sync, 60_000);
    return () => window.clearInterval(timer);
  }, [cutoffHour]);
  const text = copy[locale];
  const open = minutes > 0;
  return (
    <p className="delivery-promise" data-open={open}>
      <Clock3 size={16} aria-hidden="true" />
      <span>
        {open ? text.orderWithin(formatDuration(minutes, locale)) : text.orderTomorrow}
      </span>
    </p>
  );
}
