import { Product, ProductVariant } from "../db/models";
import type { LineFacts } from "./invoice";

/**
 * A line's facts for its bill: as kept when the bill was issued, or, before that, as set today. The
 * map is by pack, so it can't hold two orders' kept facts; this looks at the line itself first.
 */
export function factsOf(line: { variantId?: unknown; billed?: LineFacts | null }, live: Map<string, LineFacts>): LineFacts {
  const kept = line.billed;
  if (kept && Object.values(kept).some((value) => value !== undefined && value !== null)) return kept;
  return live.get(String(line.variantId)) ?? {};
}

/** Each line's MRP (from its pack) and HSN code, GST rate and Marathi name (from its product), as set today. */
export async function lineFacts(items: { variantId?: unknown }[]) {
  const ids = items.map((item) => item.variantId).filter(Boolean);
  const packs = await ProductVariant.find({ _id: { $in: ids } })
    .select("productId mrpPaise")
    .lean<{ _id: unknown; productId: unknown; mrpPaise?: number }[]>();
  const products = await Product.find({ _id: { $in: packs.map((pack) => pack.productId) } })
    .select("hsnCode gstRatePercent name.mr")
    .lean<{ _id: unknown; hsnCode?: string; gstRatePercent?: number; name?: { mr?: string } }[]>();
  const byProduct = new Map(products.map((product) => [String(product._id), product]));
  return new Map<string, LineFacts>(
    packs.map((pack) => {
      const product = byProduct.get(String(pack.productId));
      return [
        String(pack._id),
        { mrpPaise: pack.mrpPaise, hsnCode: product?.hsnCode, gstRatePercent: product?.gstRatePercent, nameMr: product?.name?.mr },
      ];
    }),
  );
}
