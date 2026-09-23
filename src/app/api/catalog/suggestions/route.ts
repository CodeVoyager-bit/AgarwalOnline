import { NextRequest } from "next/server";
import { catalog } from "@/lib/catalog/queries";
import { rateLimit } from "@/lib/auth/rate-limit";
import { digest } from "@/lib/auth/crypto";
import { z } from "zod";

export async function GET(request: NextRequest) {
  try {
    const query = z.string().trim().min(2).max(60).parse(request.nextUrl.searchParams.get("q"));
    await rateLimit(`suggest:${digest(request.headers.get("x-forwarded-for") ?? "local")}`, 30);
    const products = await catalog({ q: query });
    return Response.json(
      products.slice(0, 8).map((product) => ({
        slug: product.slug,
        name: product.name,
        brand: product.brand,
        image: product.image,
        pricePaise: product.variants[0]?.pricePaise,
      })),
      { headers: { "Cache-Control": "private, max-age=30" } },
    );
  } catch {
    return Response.json([], { status: 200 });
  }
}
