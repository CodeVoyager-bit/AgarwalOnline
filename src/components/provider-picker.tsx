"use client";
import { useState } from "react";

export type ProviderOption = { id: string; name: string; town: string; status: "pending" | "active" | "declined" };

/**
 * "Provided by" on the Add and Edit product forms: our own stock, a provider, or a new one typed
 * in right here, so a half-filled product isn't left to go and add the provider first. The server
 * adds the new provider in the same step (waiting for an owner when staff add it).
 */
export function ProviderPicker({
  providers,
  value = "",
  owner,
}: {
  providers: ProviderOption[];
  /** The product's provider id, or "" for our own stock. */
  value?: string;
  owner: boolean;
}) {
  const [choice, setChoice] = useState(value);
  const live = providers.filter((provider) => provider.status === "active");
  const other = providers.filter((provider) => provider.status !== "active");
  return (
    <>
      <label>
        Provided by <small>Our own stock, or another shop&rsquo;s</small>
        <select name="providerId" value={choice} onChange={(event) => setChoice(event.target.value)}>
          <option value="">Agarwal (our own stock)</option>
          {live.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.name}, {provider.town}
            </option>
          ))}
          {other.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.name}, {provider.town} · {provider.status === "pending" ? "waiting for owner" : "declined"}
            </option>
          ))}
          <option value="new">+ Add a new provider…</option>
        </select>
      </label>
      {choice === "new" && (
        <fieldset className="new-provider">
          <legend>New provider</legend>
          <div className="staff-form-grid">
            <label>
              Shop name
              <input name="newProviderName" required minLength={2} maxLength={60} placeholder="Sharma Stationers" />
            </label>
            <label>
              Town
              <input name="newProviderTown" required minLength={2} maxLength={40} placeholder="Roha" />
            </label>
          </div>
          <p className="muted">
            {owner
              ? "Saved with this product. Shoppers see the name and town under the item."
              : "Saved with this product. An owner approves the new provider before shoppers see it."}
          </p>
        </fieldset>
      )}
    </>
  );
}
