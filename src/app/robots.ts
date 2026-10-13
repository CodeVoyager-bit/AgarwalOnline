import type { MetadataRoute } from "next";
import { getEnv } from "@/lib/env";

// built per request: the catalog changes without a deploy, and builds should not need the database
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const origin = getEnv().APP_ORIGIN;
  return {
    rules: {
      userAgent: "*",
      // uploaded product photos are served from /api/evidence; the private ones answer 404 to anyone signed out
      allow: ["/", "/api/evidence/"],
      // /q/<code> is a quotation's view-only link: private to whoever was sent it
      disallow: ["/account", "/admin", "/super-admin", "/delivery", "/checkout", "/cart", "/school", "/q/", "/api/"],
    },
    sitemap: `${origin}/sitemap.xml`,
  };
}
