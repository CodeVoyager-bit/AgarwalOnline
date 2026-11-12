// One-time, safe to run again: sorts the shop's subcategories into the plan's categories, so a
// subcategory can show under more than one (Pens under Stationery and under Office). The plan and
// the work are in src/lib/catalog/sections.ts; owners can do the same from Admin → Categories
// ("Sort them for me"). Without --write this only prints the plan.
//
// ORDER MATTERS: run it with --write only once the code that knows about categories-with-
// subcategories is live. The older code lists every category flat, so on it the five new
// categories would show as five empty ones in the menu, the home tiles, the footer and the sitemap.
import mongoose from "mongoose";
import { groupShelves } from "../src/lib/catalog/sections";

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/migrate-shelves.ts")) {
  const write = process.argv.includes("--write");
  const { done } = await groupShelves(write);
  console.log(`Database "${mongoose.connection.name}"${write ? "" : " (plan only; add --write to apply)"}:`);
  console.log(done.length ? done.join("\n") : "Nothing to change.");
  await mongoose.disconnect();
}
