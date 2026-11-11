import { cache } from "react";
import { connectDB } from "../db/connect";
import { ServiceArea } from "../db/models";
import { shared } from "../db/shop-cache";

/**
 * Names of the areas the store delivers to right now, as the owner set them in Store settings.
 * Memoised per request: the layout's footer, the homepage and the area check all ask. Shoppers
 * used to be shown five hard-coded names, including areas that were switched off. Kept in the
 * shop cache, which a change to an area empties.
 */
export const liveAreaNames = cache(() =>
  shared("area-names", async () => {
    await connectDB();
    const areas = await ServiceArea.find({ enabled: true }).sort({ name: 1 }).select("name");
    return areas.map((area) => area.name as string);
  }),
);

/** Each live area's delivery fee, for the home page's questions. Shop-cached like the names. */
export const liveAreaFees = cache(() =>
  shared("area-fees", async () => {
    await connectDB();
    const areas = await ServiceArea.find({ enabled: true }).select("feePaise");
    return areas.map((area) => area.feePaise as number);
  }),
);
