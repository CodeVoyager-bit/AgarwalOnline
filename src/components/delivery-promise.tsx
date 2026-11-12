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
  promise,
}: {
  cutoffHour: number;
  initialMinutes: number;
  locale: Locale;
  /** From deliveryPromise(): no countdown on a holiday or a closed date, and the next open day named. */
  promise?: { today: boolean; now: string; later: string };
}) {
  const [minutes, setMinutes] = useState(initialMinutes);
  useEffect(() => {
    const sync = () => setMinutes(minutesUntilCutoff(cutoffHour));
    sync();
    const timer = window.setInterval(sync, 60_000);
    return () => window.clearInterval(timer);
  }, [cutoffHour]);
  const text = copy[locale];
  const open = (promise?.today ?? true) && minutes > 0;
  // after the cutoff, or on a closed day: when an order placed now arrives ("tomorrow", "on Monday")
  const nextDay = promise ? (promise.today ? promise.later : promise.now) : "tomorrow";
  return (
    <p className="delivery-promise" data-open={open}>
      <Clock3 size={16} aria-hidden="true" />
      <span>
        {open ? text.orderWithin(formatDuration(minutes, locale)) : `Ordering now for delivery ${nextDay}`}
      </span>
    </p>
  );
}
