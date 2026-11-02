import { Store } from "lucide-react";
import type { ProviderLabel } from "@/lib/providers/models";

/**
 * "Sharma Stationers, Roha" with a shop icon, under an item another shop provides: on cards, in
 * the basket and on orders. Nothing for our own stock. Screen readers hear "Provided by" first.
 */
export function ProviderLine({
  provider,
  mr = false,
  className,
}: {
  provider?: ProviderLabel | null;
  mr?: boolean;
  className?: string;
}) {
  if (!provider?.name) return null;
  return (
    <span className={className ? `provider-line ${className}` : "provider-line"}>
      <Store size={13} aria-hidden="true" />
      <span>
        <span className="sr-only">{mr ? "पुरवठा: " : "Provided by "}</span>
        {provider.name}
        {provider.town ? `, ${provider.town}` : ""}
      </span>
    </span>
  );
}
