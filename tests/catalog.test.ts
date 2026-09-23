import { expect, it } from "vitest";
import { normalizeSearch, expandSearch } from "../src/lib/catalog/search";
it("normalizes case, whitespace and punctuation without dropping Marathi vowel marks", () => {
  expect(normalizeSearch("  RICE!!!  ")).toBe("rice");
  expect(normalizeSearch("तांदूळ")).toBe("तांदूळ");
});
it("maps Rice, Chawal and तांदूळ equivalently", () => {
  for (const q of ["Rice", "Chawal", "तांदूळ"])
    expect(expandSearch(q)).toEqual(
      expect.arrayContaining(["rice", "chawal", "तांदूळ"]),
    );
});
it("supports maintained mappings and never expands unrelated terms", () => {
  expect(expandSearch("chai")).toContain("tea");
  expect(expandSearch("unrelated")).toEqual(["unrelated"]);
  expect(expandSearch("sabun", [["soap", "sabun"]])).toContain("soap");
});
