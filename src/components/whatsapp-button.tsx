"use client";
import type { ReactNode } from "react";

/**
 * "Send on WhatsApp" for a message that carries a secret link (a shared basket, a family invite). A
 * button, not a link: Google Analytics counts taps on links to other sites with their whole address,
 * and that address would hold the secret code.
 */
export function WhatsAppButton({ text, className = "primary-button", children }: { text: string; className?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer")}
    >
      {children}
    </button>
  );
}
