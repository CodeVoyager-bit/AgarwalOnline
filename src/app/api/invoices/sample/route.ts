import { currentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { sampleBills } from "@/lib/documents/sample-bill";
import { Provider } from "@/lib/providers/models";

/**
 * Customize → Bills' preview: a made-up order of three products from the shelves, billed with the
 * settings saved now. `?style=` tries another bill style before saving it; `?kind=estimate` shows the
 * kaccha bill. Owners only; nothing is stored. With ?provider=<id>, the bill that provider gives in its
 * own name with its saved tax details (Providers → Tax and billing), for anyone who edits providers.
 */
export async function GET(request: Request) {
  const user = await currentUser();
  const query = new URL(request.url).searchParams;
  const providerId = query.get("provider");
  const allowed = providerId ? hasPermission(user?.roles ?? [], "catalog:write") : hasPermission(user?.roles ?? [], "settings:write");
  if (!user || !allowed) return new Response(providerId ? "Staff only" : "Owners only", { status: 403 });
  let provider;
  if (providerId) {
    if (!/^[a-f\d]{24}$/i.test(providerId)) return new Response("Provider not found", { status: 404 });
    const found = await Provider.findById(providerId).select("name billing").lean<{
      name: string;
      billing?: { legalName?: string; address?: string; gstin?: string; registration?: string };
    }>();
    if (!found) return new Response("Provider not found", { status: 404 });
    provider = {
      legalName: found.billing?.legalName || found.name,
      address: found.billing?.address,
      gstin: found.billing?.gstin,
      composition: found.billing?.registration === "composition",
    };
  }
  const style = query.get("style");
  const [html] = await sampleBills([
    { style: style && style !== "same" ? style : undefined, estimate: !provider && query.get("kind") === "estimate", provider },
  ]);
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
