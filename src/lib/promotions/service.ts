import type { ClientSession } from "mongoose";
import { connectDB } from "../db/connect";
import { Promotion, PromotionRedemption } from "./models";

export type PriceQuote = {
  merchandiseSubtotalPaise: number;
  merchandiseSavingsPaise: number;
  promotionDiscountPaise: number;
  deliveryPaise: number;
  totalPaise: number;
  appliedPromotion?: { id: string; name: string; code?: string };
  rejectedCodeReason?: string;
};

type PricedLine = {
  pricePaise: number;
  mrpPaise?: number;
  quantity: number;
};

function promotionDiscount(
  promotion: {
    discountType: "fixed" | "percentage";
    discountValue: number;
    maximumDiscountPaise?: number;
  },
  subtotal: number,
) {
  const calculated =
    promotion.discountType === "fixed"
      ? promotion.discountValue
      : Math.floor((subtotal * promotion.discountValue) / 100);
  return Math.max(
    0,
    Math.min(
      subtotal,
      promotion.maximumDiscountPaise
        ? Math.min(calculated, promotion.maximumDiscountPaise)
        : calculated,
    ),
  );
}

export async function bestPromotion(
  subtotal: number,
  code?: string,
  customerId?: string,
  session?: ClientSession,
) {
  await connectDB();
  const now = new Date();
  const requestedCode = code?.trim().toUpperCase();
  const query = Promotion.find({
    active: true,
    startsAt: { $lte: now },
    endsAt: { $gte: now },
    minimumSubtotalPaise: { $lte: subtotal },
    $and: [
      {
        $or: [
          { globalLimit: { $exists: false } },
          { $expr: { $lt: ["$redemptionCount", "$globalLimit"] } },
        ],
      },
      requestedCode
        ? { $or: [{ kind: "automatic" }, { kind: "code", code: requestedCode }] }
        : { kind: "automatic" },
    ],
  });
  if (session) query.session(session);
  let promotions = await query;
  if (customerId && promotions.length) {
    const countQuery = PromotionRedemption.aggregate([
      {
        $match: {
          customerId: new (await import("mongoose")).default.Types.ObjectId(
            customerId,
          ),
          promotionId: { $in: promotions.map((item) => item._id) },
        },
      },
      { $group: { _id: "$promotionId", count: { $sum: 1 } } },
    ]);
    if (session) countQuery.session(session);
    const counts = await countQuery;
    promotions = promotions.filter((promotion) => {
      const used = counts.find(
        (item) => String(item._id) === String(promotion._id),
      )?.count;
      return (used ?? 0) < promotion.perCustomerLimit;
    });
  }
  const ranked = promotions
    .map((promotion) => ({
      promotion,
      discountPaise: promotionDiscount(promotion, subtotal),
    }))
    .sort((a, b) => b.discountPaise - a.discountPaise);
  const selected = ranked[0];
  const matchedCode = requestedCode
    ? promotions.some(
        (promotion) =>
          promotion.kind === "code" && promotion.code === requestedCode,
      )
    : true;
  return {
    selected,
    rejectedCodeReason:
      requestedCode && !matchedCode
        ? "That code is invalid, expired, already used, or needs a larger basket."
        : undefined,
  };
}

export async function quoteCart(
  lines: PricedLine[],
  options: {
    code?: string;
    customerId?: string;
    deliveryPaise?: number;
  } = {},
): Promise<PriceQuote> {
  const subtotal = lines.reduce(
    (sum, line) => sum + line.pricePaise * line.quantity,
    0,
  );
  const merchandiseSavingsPaise = lines.reduce(
    (sum, line) =>
      sum + Math.max(0, (line.mrpPaise ?? line.pricePaise) - line.pricePaise) * line.quantity,
    0,
  );
  const { selected, rejectedCodeReason } = await bestPromotion(
    subtotal,
    options.code,
    options.customerId,
  );
  const promotionDiscountPaise = selected?.discountPaise ?? 0;
  const deliveryPaise = options.deliveryPaise ?? 0;
  return {
    merchandiseSubtotalPaise: subtotal,
    merchandiseSavingsPaise,
    promotionDiscountPaise,
    deliveryPaise,
    totalPaise: subtotal - promotionDiscountPaise + deliveryPaise,
    ...(selected
      ? {
          appliedPromotion: {
            id: String(selected.promotion._id),
            name: selected.promotion.name,
            code: selected.promotion.code,
          },
        }
      : {}),
    rejectedCodeReason,
  };
}
