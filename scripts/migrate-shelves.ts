// One-time, safe to run again: groups the shop's shelves under five sections, so a shelf can show
// under more than one (Pens under Stationery and under Office). A shelf it doesn't find is skipped,
// and nothing set by hand in Admin → Categories is removed. Without --write it only prints the plan.
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db/connect";
import { Category, Product, parentsOf } from "../src/lib/db/models";
import { notDeleted } from "../src/lib/catalog/deleted";

export const SECTIONS = [
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

/** What was (or with `write` off, would be) changed, a line each. */
export async function groupShelves(write: boolean, sections = SECTIONS) {
  await connectDB();
  const done: string[] = [];
  for (const section of sections) {
    let parent = await Category.findOne({ slug: section.slug });
    if (!parent) {
      done.push(`New section: ${section.en}`);
      if (write) parent = await Category.create({ slug: section.slug, name: { en: section.en, mr: section.mr } });
    } else {
      const own = await Product.countDocuments({ categoryId: parent._id, ...notDeleted });
      if (own) done.push(`Check: "${section.en}" has ${own} product(s) of its own. A section lists only its shelves, so move them to a shelf.`);
    }
    for (const slug of section.shelves) {
      const shelf = await Category.findOne({ slug });
      if (!shelf) {
        done.push(`Skipped: no shelf called "${slug}"`);
        continue;
      }
      const parents = parentsOf(shelf);
      if (parent && parents.includes(String(parent._id))) continue;
      done.push(`${shelf.name.en} → ${section.en}`);
      // the old single "inside" is carried into the list, then cleared
      if (write && parent)
        await Category.updateOne({ _id: shelf._id }, { $set: { parentIds: [...parents, String(parent._id)], parentId: null } });
    }
  }
  return done;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/migrate-shelves.ts")) {
  const write = process.argv.includes("--write");
  const done = await groupShelves(write);
  console.log(`Database "${mongoose.connection.name}"${write ? "" : " (plan only; add --write to apply)"}:`);
  console.log(done.length ? done.join("\n") : "Nothing to change.");
  await mongoose.disconnect();
}
