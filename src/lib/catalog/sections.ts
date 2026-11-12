import { connectDB } from "../db/connect";
import { Category, Product, parentsOf } from "../db/models";
import { notDeleted } from "./deleted";

/**
 * The shop's own plan for its categories: five categories, and the subcategories inside each. A
 * subcategory can sit in two (Pens in Stationery and in Office). Used once, to sort a shop whose
 * subcategories all sit loose: by the owner's "Sort them for me" on Admin → Categories, or by
 * scripts/migrate-shelves.ts. After that the owners change it by hand.
 */
export const SHOP_PLAN = [
  {
    slug: "stationery",
    en: "Stationery",
    mr: "स्टेशनरी",
    shelves: ["pens", "pencils", "colours-markers", "notebooks", "long-books", "diaries", "project-paper", "school-essentials", "art-craft"],
  },
  { slug: "office", en: "Office", mr: "कार्यालय", shelves: ["office-supplies", "pens", "long-books", "diaries"] },
  {
    slug: "toys-games",
    en: "Toys and games",
    mr: "खेळणी व खेळ",
    shelves: ["games-puzzles", "learning-toys", "building-sets", "outdoor-play", "pretend-play", "baby-toddler"],
  },
  { slug: "gifts-party", en: "Gifts and party", mr: "भेटवस्तू व पार्टी", shelves: ["party-gifting", "chocolates-sweets", "diaries", "art-craft"] },
  { slug: "home-pooja", en: "Home and pooja", mr: "घर व पूजा", shelves: ["pooja-needs", "home-essentials"] },
];

/**
 * Puts subcategories into the plan's categories. Safe to run again: what is already in place is
 * left alone, a subcategory the shop doesn't have is skipped, and nothing set by hand is removed.
 * `moves` counts the subcategories it placed (or, with `write` off, would place).
 */
export async function groupShelves(write: boolean, plan = SHOP_PLAN) {
  await connectDB();
  const done: string[] = [];
  let moves = 0;
  for (const section of plan) {
    let parent = await Category.findOne({ slug: section.slug });
    const shelves = await Category.find({ slug: { $in: section.shelves } });
    // a category nobody has subcategories for isn't added
    if (!parent && !shelves.length) continue;
    if (!parent) {
      done.push(`New category: ${section.en}`);
      if (write) parent = await Category.create({ slug: section.slug, name: { en: section.en, mr: section.mr } });
    } else {
      const own = await Product.countDocuments({ categoryId: parent._id, ...notDeleted });
      if (own) done.push(`Check: "${section.en}" has ${own} product(s) of its own. A category lists only its subcategories, so move them into one.`);
    }
    for (const slug of section.shelves) {
      const shelf = shelves.find((item) => item.slug === slug);
      if (!shelf) {
        done.push(`Skipped: no subcategory called "${slug}"`);
        continue;
      }
      const parents = parentsOf(shelf);
      if (parent && parents.includes(String(parent._id))) continue;
      moves += 1;
      done.push(`${shelf.name.en} → ${section.en}`);
      // the old "Inside another category" box is cleared, not carried over: it put shelves with products inside each other
      if (write && parent)
        await Category.updateOne({ _id: shelf._id }, { $set: { parentIds: [...parents, String(parent._id)], parentId: null } });
    }
  }
  return { done, moves };
}
