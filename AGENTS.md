<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Every UI change ships for desktop and phone

Nineteen of twenty shoppers order from a phone, so a shop screen is designed and measured at phone width first. Anything new — a page, a section, a component, a form — still ships for both widths in the same change, not "phone now, desktop later".

- The shop's own screens are styled phone-first in `src/app/shop.css` (desktop added at 761px): the yellow header band, section tabs, the shelf rail, the welcome card, shelf tiles and the compact product card. Older phone rules live in the `@media (max-width: 760px)` blocks of `src/app/globals.css` (tablet steps at 1023/900px). Reuse the phone patterns already there before inventing one: bottom tab bar (Home, Categories, Family, Basket, You), the two-row header (name, promise and language scroll away; the search stays pinned), a rail of shelves beside two columns of products, swipe rails (`.home .product-grid`), the sticky basket bar with its free-delivery line, the pinned buy bar on single-pack product pages, the bottom sheet (`ShareSheet`), `DataTable` rows that become cards at phone width (760px and below; a phone turned sideways keeps the table).
- `.product-card`, `.price-row`, `.hero-card`, `.deal-card`, `.header`, `.top-strip` and `.catalog-chips` are shared with the school pages, shared lists, the wishlist and staff pages. Change them in place and look at those pages too; search for other users before deleting a rule.
- Colours come from the theme the owners pick in Customize → Shop front (`src/lib/settings/themes.ts`, written onto `<html>` by the root layout). Style with the tokens (`--brand`, `--offer`, `--band` / `--on-band`, `--page`, `--tint-1` to `--tint-5`), never a literal colour, and look at a dark-header theme too. A new theme goes in that file; `tests/themes.test.ts` refuses one whose words would be hard to read.
- Tap targets are at least 24px tall (44px for primary controls); no page may scroll sideways; fixed bars must not cover content (pad for `--bottom-nav-h` and `env(safe-area-inset-bottom)`).
- `tests/e2e/layout.spec.ts` finds every `page.tsx` under `src/app` and checks it at desktop (chromium) and phone (Pixel 7) width for sideways scroll, content running off the edge and small tap targets. A new dynamic route fails until it gets a sample there; a view of a page that lays out differently (a picked shelf) goes in `VIEWS`. Run it after any UI change: `npx playwright test tests/e2e/layout.spec.ts` (needs the local test MongoDB on 27028). `SHOT_DIR=.local/shots` also saves a screenshot of every page at both widths — look at them. `ONLY=/catalog,/catalog/shelf` checks just those routes, in about 90 seconds.

# Staff pages follow the same admin patterns

- A list of records is a `DataTable` with a `FilterBar` (search plus the one or two filters people need) and a count line; the first column is the record's name, linking to its own page or an `?edit=` panel above the table. Never render a stack of open edit forms or accordions, one per record.
- Page chrome is `PageHeading` (eyebrow "Run the store" or "Owner", a one-sentence lead, the primary action in `aside`) and a `breadcrumb` on detail pages.
- A new staff page goes into the menu (`STAFF_NAV` in `src/lib/staff/nav.ts`) and the workspace search (`src/lib/staff/search-index.ts`); a new setting gets an `id` anchor and a search entry pointing at it.
- Money is typed in rupees with `MoneyInput` (named `…Rupees`, converted by `formWithPaise`); number-like fields use `inputMode` + `pattern`, not `type="number"`.
- Validation errors go through `plainMessage` in `src/lib/form-errors.ts`, so they name the field in plain English.
- `ActionForm confirmMessage` only for money, publishing or hard-to-undo actions; the dialog reads "<submit>?" with a "Yes, …" button.
- Times use `<When at>` (relative, exact IST on hover); audit codes are shown through `auditLabel` with the raw code beside them.
