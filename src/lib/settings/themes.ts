/*
 * The shop's colour themes. An owner picks one in Customize → Shop front and every page follows
 * at once: the root layout writes the theme's colours onto <html> as CSS variables, which the
 * stylesheets already read (src/app/studio.css, src/app/shop.css).
 *
 * A theme is five decisions: the header band, the colour of buttons and links, one light
 * highlight (badges, the basket bar's button), the page behind the cards, and a pale tint for
 * each section's block on the home page. Every pair that carries words is measured in
 * tests/themes.test.ts, so a theme that would be hard to read in sunlight can't be added.
 *
 * `action` is for themes whose buttons are a light colour (amber, saffron, highlighter): white
 * words fail on those, so buttons take the light colour with dark words, and `brand` stays a dark
 * colour for links and icons.
 */
export type Theme = {
  readonly id: string;
  /** As the owner reads it in the list. */
  readonly name: string;
  readonly band: string;
  readonly onBand: string;
  readonly brand: string;
  readonly offer: string;
  readonly page: string;
  readonly tints: readonly [string, string, string, string, string];
  readonly action?: string;
};

const INK = "#1b1b1f";
const WHITE = "#ffffff";

export const THEMES: readonly Theme[] = [
  // bright headers
  { id: "pencil", name: "Pencil and pen: yellow header, blue buttons", band: "#ffd43b", onBand: INK, brand: "#1d4ed8", offer: "#ffd43b", page: "#f3f4f7", tints: ["#fff6d1", "#e8eefc", "#fde8ef", "#efe9fb", "#fdeee0"] },
  { id: "marigold", name: "Marigold and leaf: yellow header, green buttons", band: "#f8cb46", onBand: INK, brand: "#0c831f", offer: "#f8cb46", page: "#f6f6f2", tints: ["#fff3c9", "#e6f4e8", "#fde9d9", "#f1ecff", "#e5f1fb"] },
  { id: "sky", name: "Sky and saffron: blue header, saffron buttons", band: "#1552f0", onBand: WHITE, brand: "#1552f0", action: "#ff5a0a", offer: "#ffa35c", page: "#f3f6ff", tints: ["#e4ecff", "#ffe9dc", "#e6f6ee", "#fdf0c8", "#f1e9ff"] },
  { id: "crayon", name: "Crayon box: orange header, blue buttons", band: "#ff8a1f", onBand: INK, brand: "#0b63ce", offer: "#ffd43b", page: "#fffaf3", tints: ["#ffe9c9", "#dcecff", "#ffe0ef", "#e3f6df", "#efe6ff"] },
  { id: "poppy", name: "Poppy: pink-red header, black buttons", band: "#e11d48", onBand: WHITE, brand: INK, offer: "#ffd43b", page: "#fff7f8", tints: ["#ffe4ea", "#fff3c9", "#e7eefb", "#efe9fb", "#e6f4ea"] },
  { id: "mango", name: "Mango and chilli: mango header, red buttons", band: "#ffb703", onBand: INK, brand: "#c81e1e", offer: "#ffb703", page: "#fffbf0", tints: ["#ffefc2", "#e3edf5", "#fde3e3", "#e8f3e6", "#f3e9fb"] },
  { id: "kite", name: "Kite festival: sky blue header, pink buttons", band: "#12a5e6", onBand: INK, brand: "#d81b60", offer: "#ffd43b", page: "#f3fafe", tints: ["#d9f1fc", "#ffe3ee", "#fff4c7", "#e6f6e3", "#efe8fb"] },
  { id: "classroom", name: "Classroom: blue header, yellow buttons", band: "#2563eb", onBand: WHITE, brand: "#1d4ed8", action: "#ffd43b", offer: "#ffd43b", page: "#f2f6ff", tints: ["#e1eaff", "#fff3c4", "#ffe2ee", "#e4f5e8", "#efe8fb"] },
  // soft headers
  { id: "grape", name: "Grape soda: violet header, purple buttons", band: "#efe6ff", onBand: "#2a1454", brand: "#6d28d9", offer: "#ffd43b", page: "#faf8ff", tints: ["#efe6ff", "#ffe8f0", "#e6f4ea", "#fff3d6", "#e3f1ff"] },
  { id: "aqua", name: "Aqua and rose: aqua header, rose buttons", band: "#cdf3f6", onBand: "#0b3b40", brand: "#d81b60", offer: "#ffd43b", page: "#f5fbfc", tints: ["#d8f5f7", "#ffe3ee", "#e6f4ea", "#fff3d6", "#ece8fb"] },
  { id: "denim", name: "Denim and coral: pale blue header, blue buttons", band: "#e3ecfd", onBand: "#12235a", brand: "#1d4ed8", offer: "#ffb4a2", page: "#f7f9fd", tints: ["#e3ecfd", "#ffe7e2", "#fff3c9", "#e6f4ea", "#efe9fb"] },
  { id: "bubblegum", name: "Bubblegum: pink header, deep pink buttons", band: "#ffd6e8", onBand: "#4a0d2b", brand: "#be185d", offer: "#ffe24a", page: "#fff7fb", tints: ["#ffe0ee", "#fff5c2", "#e2ecff", "#e5f5e6", "#f0e8fb"] },
  { id: "garden", name: "Garden: mint header, green buttons", band: "#e1f5e4", onBand: "#0d3b17", brand: "#15803d", offer: "#fbbf24", page: "#f7fbf7", tints: ["#e1f5e4", "#fff3c9", "#e5ecfb", "#fde9e3", "#efe9fb"] },
  { id: "redpen", name: "Red pen: blush header, red buttons", band: "#fff0ef", onBand: "#4a0f0c", brand: "#d32323", offer: "#ffd43b", page: "#fffafa", tints: ["#ffe6e3", "#fff3c9", "#e5ecfb", "#e6f4ea", "#efe9fb"] },
  // dark headers
  { id: "bus", name: "School bus: navy header, amber buttons", band: "#1e3a8a", onBand: WHITE, brand: "#1e3a8a", action: "#fbbf24", offer: "#fbbf24", page: "#f6f7fa", tints: ["#fff4cf", "#e7ecfa", "#fdeaea", "#e9f5ef", "#f2ecfb"] },
  { id: "midnight", name: "Midnight and mango: black header, mango buttons", band: "#14161c", onBand: WHITE, brand: INK, action: "#fbbf24", offer: "#fbbf24", page: "#f4f5f7", tints: ["#fff1c4", "#e6eaf2", "#fde6e6", "#e8f3ec", "#eee9fa"] },
  { id: "graphite", name: "Graphite and highlighter: grey header, highlighter buttons", band: "#2b2d33", onBand: WHITE, brand: INK, action: "#d7f205", offer: "#d7f205", page: "#f4f4f1", tints: ["#f1fac0", "#e6e9ee", "#fde6e6", "#e7f2ea", "#eeeaf6"] },
  // white headers
  { id: "paper", name: "Paper and ink: white header, black buttons", band: WHITE, onBand: INK, brand: INK, offer: "#ffd43b", page: "#f5f5f2", tints: ["#fbf3d3", "#e9edf3", "#f8e6e6", "#e7f1ea", "#eeeaf6"] },
  { id: "penpaper", name: "Pen on paper: white header, blue buttons", band: WHITE, onBand: INK, brand: "#1d4ed8", offer: "#ffd43b", page: "#f4f5f8", tints: ["#fff6d1", "#e8eefc", "#fde8ef", "#efe9fb", "#fdeee0"] },
];

export const DEFAULT_THEME = "pencil";
/** For the settings list: every theme by name. */
export const THEME_CHOICES = THEMES.map((theme) => ({ value: theme.id, label: theme.name }));
/** The saved theme, or the shop's own when the saved one is gone. */
export const themeOf = (id: string | undefined) => THEMES.find((theme) => theme.id === id) ?? THEMES[0];

/** The theme as CSS variables for <html>: they outrank every stylesheet's own values. */
export function themeVars(theme: Theme): Record<string, string> {
  return {
    "--band": theme.band,
    "--on-band": theme.onBand,
    "--brand": theme.brand,
    "--offer": theme.offer,
    "--page": theme.page,
    ...Object.fromEntries(theme.tints.map((tint, index) => [`--tint-${index + 1}`, tint])),
    // light buttons carry dark words
    ...(theme.action ? { "--action": theme.action, "--on-action": INK } : {}),
  };
}
