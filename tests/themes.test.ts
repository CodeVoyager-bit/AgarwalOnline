import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, THEMES, themeOf, themeVars } from "../src/lib/settings/themes";

const INK = "#1b1b1f";
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("the shop's colour themes", () => {
  it("has the shop's own theme first, and falls back to it for a theme that is gone", () => {
    expect(THEMES[0].id).toBe(DEFAULT_THEME);
    expect(themeOf("no-such-theme").id).toBe(DEFAULT_THEME);
    expect(themeOf(undefined).id).toBe(DEFAULT_THEME);
    expect(new Set(THEMES.map((theme) => theme.id)).size).toBe(THEMES.length);
  });

  // 4.5:1 is the WCAG AA line for ordinary text
  it.each(THEMES.map((theme) => [theme.id, theme] as const))("%s keeps every word readable", (_id, theme) => {
    const pairs: [string, string, string][] = [
      ["words on the header", theme.band, theme.onBand],
      ["links on the page", theme.page, theme.brand],
      ["links on a card", "#ffffff", theme.brand],
      ["ink on the highlight", theme.offer, INK],
      ["ink on the page", theme.page, INK],
      ...theme.tints.map((tint, index): [string, string, string] => [`ink on section tint ${index + 1}`, tint, INK]),
      // buttons: white words on the brand colour, or dark words on a light button colour
      theme.action ? ["dark words on the button", theme.action, INK] : ["white words on the button", theme.brand, "#ffffff"],
    ];
    for (const [what, background, text] of pairs) expect(contrast(background, text), `${theme.id}: ${what}`).toBeGreaterThanOrEqual(4.5);
  });

  it("hands the page its colours as CSS variables, with a button colour only where the theme has one", () => {
    const pencil = themeVars(themeOf("pencil"));
    expect(pencil["--band"]).toBe("#ffd43b");
    expect(pencil["--tint-5"]).toBe("#fdeee0");
    expect(pencil["--action"]).toBeUndefined();
    expect(themeVars(themeOf("bus"))["--action"]).toBe("#fbbf24");
  });
});
