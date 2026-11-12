import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it, expect } from "vitest";

// On Vercel the indexes are built once per deployment from the list in src/lib/db/indexes.ts, not by
// each model as it loads; a file of models left off that list would never get its indexes there.
describe("index build", () => {
  it("lists every file that defines a model", () => {
    const listed = readFileSync("src/lib/db/indexes.ts", "utf8");
    const files = (readdirSync("src", { recursive: true }) as string[]).filter(
      (file) => /\.tsx?$/.test(file) && /\bmodel[<(]/.test(readFileSync(join("src", file), "utf8")),
    );
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      const path = relative("src/lib/db", join("src", file)).replace(/\.tsx?$/, "");
      expect(listed, file).toContain(`import("${path.startsWith(".") ? path : `./${path}`}")`);
    }
  });
});
