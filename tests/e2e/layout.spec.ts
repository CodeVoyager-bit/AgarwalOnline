// Every page, at both widths. The route list is read from src/app, so a page
// added later is checked on desktop (chromium project) and phone (mobile
// project) without anyone remembering to add it here. A new dynamic segment
// fails loudly until it gets a sample below.
//
// Set SHOT_DIR to also write a full-page screenshot of every route.
import { test, expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readdirSync, writeFileSync } from "node:fs";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User, Product, ProductVariant } from "../../src/lib/db/models";
import { ShoppingList } from "../../src/lib/lists/models";
import { Address, Order } from "../../src/lib/commerce/models";
import { ChatConversation } from "../../src/lib/chat/models";
import { QuoteBasket, QuoteRequest, School } from "../../src/lib/schools/models";
import { istDatePlus, quoteTotals } from "../../src/lib/schools/quote-math";
import { DEFAULT_TAX_PROFILE } from "../../src/lib/tax/gst";
import { Family, SchoolKit } from "../../src/lib/family/models";
import { OrderFeedback } from "../../src/lib/feedback/models";
import { LEGAL_PAGES, POLICIES_HOME } from "../../src/lib/legal/pages";

const uri = "mongodb://127.0.0.1:27028/ags_test_e2e?replicaSet=ags-local";
const out = process.env.SHOT_DIR;
const PASSWORD = "Local-test-password-123";
const EMAILS = {
  customer: "customer@demo.ags.test",
  delivery: "delivery@demo.ags.test",
  owner: "super-admin@demo.ags.test",
};
type Who = keyof typeof EMAILS | "guest";

const routes = readdirSync("src/app", { recursive: true, encoding: "utf8" })
  .filter((file) => file.endsWith("page.tsx"))
  .map((file) => "/" + file.replace(/\\/g, "/").replace(/\/?page\.tsx$/, ""))
  .sort();

function whoFor(route: string): Who {
  if (route.startsWith("/admin") || route.startsWith("/super-admin")) return "owner";
  if (route.startsWith("/delivery")) return "delivery";
  // the demo customer represents the seeded school
  if (route.startsWith("/account") || route === "/checkout" || route.startsWith("/school")) return "customer";
  return "guest";
}

const samples: Record<string, string> = {};

test.beforeAll(async () => {
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  // the fictional demo catalog: 41 products, 8 orders, promotions, staff
  execFileSync("npx", ["tsx", "scripts/seed.ts", "--demo-accounts"], {
    env: {
      ...process.env,
      MONGODB_URI: uri,
      AUTH_SECRET: "e2e-local-only-secret-repeated-000000000",
      APP_ORIGIN: "http://127.0.0.1:3002",
      SEED_DEMO: "true",
      NODE_ENV: "test",
    },
    stdio: "ignore",
    // on Windows npx is a .cmd script, which Node only starts through a shell (else: spawnSync npx ENOENT)
    shell: process.platform === "win32",
  });
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  // the seed hands its demo orders to whichever user it finds first; give them to the plain customer
  const customer = await User.findOneAndUpdate(
    { roles: ["customer"] },
    { email: EMAILS.customer, passwordHash },
    { returnDocument: "after" },
  );
  await User.updateMany({ email: { $in: [EMAILS.delivery, EMAILS.owner] } }, { passwordHash });
  await Order.updateMany({}, { customerId: customer!._id });
  await Address.updateMany({}, { customerId: customer!._id });
  // every page is checked as it is, without the "How did we do?" popup over it: the demo
  // customer has already said "Not now" about each delivery the seed didn't rate
  const rated = await OrderFeedback.distinct("orderId");
  for (const unrated of await Order.find({ deliveryStatus: "delivered", _id: { $nin: rated } }).select("number"))
    await OrderFeedback.create({ orderId: unrated._id, orderNumber: unrated.number, state: "skipped" });
  const order = await Order.findOne({ assignedTo: { $exists: true } });
  const chat = await ChatConversation.create({ customerId: customer!._id, title: "Where is my order?" });
  const product = (await Product.findOne({ status: "published", showToCustomers: { $ne: false } }))!;
  samples["/products/[slug]"] = `/products/${product.slug}`;
  samples["/admin/products/[id]"] = `/admin/products/${product._id}`;
  samples["/account/orders/[id]"] = `/account/orders/${order!._id}`;
  samples["/admin/orders/[id]"] = `/admin/orders/${order!._id}`;
  samples["/admin/orders/[id]/slip"] = `/admin/orders/${order!._id}/slip`;
  samples["/delivery/orders/[id]"] = `/delivery/orders/${order!._id}`;
  samples["/account/support/[id]"] = `/account/support/${chat._id}`;
  const firstPack = (await ProductVariant.findOne())!._id;
  const board = await ShoppingList.create({
    ownerId: customer!._id,
    kind: "board",
    name: "Diwali gifts",
    shareToken: "layout-share-token-00000",
    inviteToken: "layout-invite-token-0000",
    items: [{ variantId: firstPack, quantity: 2, addedBy: customer!._id }],
  });
  // a shared basket, so /cart shows its pills
  await ShoppingList.create({
    ownerId: customer!._id,
    kind: "basket",
    name: "School list",
    shareToken: "layout-basket-share-0000",
    inviteToken: "layout-basket-invite-000",
    items: [{ variantId: firstPack, quantity: 1, addedBy: customer!._id }],
  });
  samples["/account/lists/[id]"] = `/account/lists/${board._id}`;
  // a signed-out visitor on the invite link: the page with the most on it
  samples["/lists/[token]"] = `/lists/${board.inviteToken}`;
  samples["/admin/support/[id]"] = `/admin/support/${chat._id}`;
  // the school area: a basket with a line, and a quotation sent once, with a draft on the desk
  const owner = (await User.findOne({ email: EMAILS.owner }))!;
  const school = (await School.findOne({ name: "Fictional Vidya Mandir" }))!;
  const packs = await ProductVariant.find({ sku: /^AGS-S-/ }).sort({ sku: 1 });
  const schoolProducts = await Product.find({ _id: { $in: packs.map((pack) => pack.productId) } });
  await QuoteBasket.create({
    schoolId: school._id,
    items: [{ variantId: packs[0]._id, quantity: 120, addedBy: customer!._id }],
    rev: 1,
  });
  const items = packs.map((pack) => {
    const item = schoolProducts.find((entry) => String(entry._id) === String(pack.productId))!;
    return {
      variantId: pack._id,
      productId: item._id,
      name: item.name.en,
      label: pack.label,
      sku: pack.sku,
      quantity: 250,
      schoolPricePaise: pack.schoolPricePaise ?? undefined,
      shopPricePaise: pack.pricePaise,
      gstRatePercent: item.gstRatePercent ?? undefined,
      hsnCode: item.hsnCode ?? undefined,
      addedBy: customer!._id,
    };
  });
  const lines = items.map((item) => ({
    variantId: item.variantId,
    name: item.name,
    label: item.label,
    hsnCode: item.hsnCode,
    quantity: item.quantity,
    unitPricePaise: item.schoolPricePaise ?? 8000,
    gstRatePercent: item.gstRatePercent ?? 18,
  }));
  const totals = quoteTotals(lines, { type: "percent", percent: 5 }, "intra");
  const validUntil = istDatePlus(15);
  const quote = await QuoteRequest.create({
    number: "AGSQ-20261002-00001",
    shareToken: "layout-quote-token-00000",
    schoolId: school._id,
    requestedBy: customer!._id,
    note: "Deliver to the school office, please",
    neededBy: validUntil,
    status: "quoted",
    items,
    draft: {
      lines,
      discountType: "percent",
      discountValue: 5,
      validUntil,
      note: "Delivered in two lots",
      updatedBy: owner._id,
      updatedAt: new Date(),
      sentAsVersion: 1,
    },
    currentVersion: 1,
    versions: [
      {
        version: 1,
        sentAt: new Date(),
        sentBy: owner._id,
        validUntil,
        note: "Delivered in two lots",
        supply: "intra",
        seller: { name: DEFAULT_TAX_PROFILE.legalName, address: DEFAULT_TAX_PROFILE.address, stateCode: "27" },
        buyer: { name: school.name, address: school.address, pin: school.pin, stateCode: "27" },
        lines: lines.map((line, index) => ({ ...line, ...totals.lines[index] })),
        taxes: totals.taxes,
        subtotalPaise: totals.subtotalPaise,
        discountPaise: totals.discountPaise,
        discountLabel: "Discount (5%)",
        taxablePaise: totals.taxablePaise,
        cgstPaise: totals.cgstPaise,
        sgstPaise: totals.sgstPaise,
        igstPaise: totals.igstPaise,
        totalPaise: totals.totalPaise,
        emailed: { sent: 0, noEmail: 1, failed: 0 },
      },
    ],
  });
  samples["/school/join/[token]"] = `/school/join/${school.joinToken}`;
  samples["/school/quotations/[id]"] = `/school/quotations/${quote._id}`;
  samples["/school/[...missing]"] = "/school/no-such-page";
  // a school-only item's own page in the school marketplace
  samples["/school/products/[slug]"] = `/school/products/${schoolProducts.find((p) => p.showToCustomers === false)?.slug ?? schoolProducts[0].slug}`;
  samples["/super-admin/quotations/[id]"] = `/super-admin/quotations/${quote._id}`;
  // the quotation's view-only link, opened signed out
  samples["/q/[code]"] = `/q/${quote.shareToken}`;
  samples["/super-admin/schools/[id]"] = `/super-admin/schools/${school._id}`;
  // a family with a child, and the demo orders in its spend, so /account/family has every part
  const home = await Family.create({
    name: "Sharma family",
    ownerId: customer!._id,
    adults: [customer!._id],
    inviteToken: "layout-family-invite-000",
    children: [{ name: "Aarav", school: "Demo School", className: "5", year: "2026-27" }],
  });
  await Order.updateMany({}, { familyId: home._id });
  // Aarav's kit this year, and next year's out already, so the card shows the kit and the class question
  const staff = (await User.findOne({ email: EMAILS.owner }))!;
  const kitPacks = await ProductVariant.find().limit(4);
  for (const [className, year] of [["5", "2026-27"], ["6", "2027-28"]])
    await SchoolKit.create({
      school: "Demo School",
      className,
      year,
      status: "published",
      publishedAt: new Date(),
      updatedBy: staff._id,
      items: kitPacks.map((pack) => ({ variantId: pack._id, quantity: 2 })),
    });
  // a signed-out visitor on the family invite link
  samples["/family/[token]"] = `/family/${home.inviteToken}`;
});
test.afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

/**
 * With SHOT_DIR set (a bug bash), what each page throws or logs as an error, the requests that fail,
 * and links to pages that don't exist, written beside the screenshots. Normal runs don't collect it.
 */
const noise: Record<string, string[]> = {};
function note(path: string, line: string) {
  const lines = (noise[path] ??= []);
  if (!lines.includes(line)) lines.push(line);
}
function listen(page: Page) {
  const at = () => new URL(page.url(), "http://x").pathname;
  page.on("pageerror", (error) => note(at(), `page error: ${error.message.split("\n")[0]}`));
  page.on("console", (message) => {
    if (message.type() === "error") note(at(), `console error: ${message.text().slice(0, 240)}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) note(at(), `${response.status()} ${response.url().slice(0, 160)}`);
  });
  page.on("requestfailed", (request) => {
    const why = request.failure()?.errorText ?? "";
    if (!why.includes("ERR_ABORTED")) note(at(), `request failed (${why}): ${request.url().slice(0, 160)}`);
  });
}

async function signedIn(browser: Browser, who: Who, use: TestInfo["project"]["use"]): Promise<Page> {
  const { baseURL, viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = use;
  const page = await (
    await browser.newContext({ baseURL, viewport, isMobile, hasTouch, userAgent, deviceScaleFactor })
  ).newPage();
  if (out) listen(page);
  if (who === "guest") return page;
  await page.goto("/login");
  await page.getByRole("button", { name: "Email", exact: true }).click();
  await page.getByLabel("Email address").fill(EMAILS[who]);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in with email" }).click();
  await page.waitForURL((url) => url.pathname !== "/login", { timeout: 30_000 });
  return page;
}

/** Things that break a layout at any width; each entry names the offender. */
function layoutProblems() {
  const width = document.documentElement.clientWidth;
  const problems: string[] = [];
  const name = (el: Element) => {
    const label = el.getAttribute("aria-label") ?? el.getAttribute("name");
    return `${el.tagName.toLowerCase()}${[...el.classList].map((c) => `.${c}`).join("")}${label ? `[${label}]` : ""}`;
  };
  const clipped = (el: Element | null): boolean => {
    for (; el && el !== document.body; el = el.parentElement)
      if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(el).overflowX)) return true;
    return false;
  };
  if (document.documentElement.scrollWidth > width)
    problems.push(`page scrolls sideways: ${document.documentElement.scrollWidth}px wide in ${width}px`);
  for (const el of document.body.querySelectorAll("*")) {
    const box = el.getBoundingClientRect();
    if (!box.width || !box.height || getComputedStyle(el).visibility === "hidden") continue;
    if (el.closest(".sr-only, .skip-link")) continue;
    // content poking past the edge outside any scroller or clip
    if ((box.right > width + 1 || box.left < -1) && !clipped(el.parentElement))
      problems.push(`${name(el)} runs off the ${box.left < -1 ? "left" : "right"} edge`);
    // WCAG 2.2 target size (minimum): 24px; links inside running text are exempt
    if (
      el.matches(
        "button, select, summary, input:not([type=hidden], [type=checkbox], [type=radio]), a:not(:is(p, li, td, small, label) a)",
      ) &&
      box.height < 24
    )
      problems.push(`${name(el)} is a ${Math.round(box.height)}px tap target`);
  }
  return [...new Set(problems)].slice(0, 8);
}

/**
 * Controls drawn wrong: their own words or icon running past their border ("Save" through the pill's
 * edge), or a parent cutting part of them off (a pill whose bottom a nav row clips).
 */
function controlProblems() {
  const problems: string[] = [];
  const name = (el: Element) =>
    `${el.tagName.toLowerCase()}${[...el.classList].map((c) => `.${c}`).join("")}[${(el.textContent ?? "").trim().slice(0, 30)}]`;
  const px = (value: string) => parseFloat(value) || 0;
  const edged = (width: string, color: string) => px(width) > 0 && !/transparent|rgba\(.*, 0\)$/.test(color);
  for (const el of document.body.querySelectorAll("a, button, summary")) {
    const box = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    if (!box.width || !box.height || style.visibility === "hidden" || el.closest(".sr-only, .skip-link")) continue;
    if (el.matches(":is(p, li, td, small, label) a")) continue;
    // what's drawn inside: text and icons, cut to any clipping box on the way (an ellipsis is fine)
    const left = box.left + px(style.borderLeftWidth);
    const right = box.right - px(style.borderRightWidth);
    let [first, last] = [Infinity, -Infinity];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (node) =>
        node instanceof Element && (node.matches(".sr-only") || getComputedStyle(node).display === "none")
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT,
    });
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const isText = node.nodeType === Node.TEXT_NODE;
      if (!isText && !(node instanceof SVGSVGElement || node instanceof HTMLImageElement)) continue;
      if (isText && !node.textContent?.trim()) continue;
      let rects: DOMRect[];
      if (isText) {
        const range = document.createRange();
        range.selectNodeContents(node);
        rects = [...range.getClientRects()];
      } else rects = [(node as Element).getBoundingClientRect()];
      let clipL = left, clipR = right;
      for (let p = node.parentElement; p && p !== el; p = p.parentElement)
        if (getComputedStyle(p).overflowX !== "visible") {
          const pb = p.getBoundingClientRect();
          [clipL, clipR] = [Math.max(clipL, pb.left), Math.min(clipR, pb.right)];
        }
      for (const r of rects)
        if (r.width) [first, last] = [Math.min(first, Math.max(r.left, clipL)), Math.max(last, Math.min(r.right, clipR))];
    }
    const spill = Math.max(last - right, left - first);
    if (spill > 1) problems.push(`${name(el)}: its contents run ${Math.round(spill)}px past its border`);
    // a bordered button needs room inside its outline, or the words sit on the line
    else if (edged(style.borderLeftWidth, style.borderLeftColor) && edged(style.borderRightWidth, style.borderRightColor) && Math.min(first - left, right - last) < 4)
      problems.push(`${name(el)}: its words touch its border`);
    // cut off by a parent: hidden overflow, or a scroller that only scrolls a few pixels (an accident)
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ps = getComputedStyle(p);
      if (ps.overflowX === "visible" && ps.overflowY === "visible") continue;
      const pb = p.getBoundingClientRect();
      const top = pb.top + px(ps.borderTopWidth), bottom = top + p.clientHeight;
      const lft = pb.left + px(ps.borderLeftWidth), rgt = lft + p.clientWidth;
      const accident = (overflow: string, extra: number) => /hidden|clip/.test(overflow) || extra <= 12;
      const shown = box.bottom > top && box.top < bottom && box.right > lft && box.left < rgt;
      const cutY = (box.top < top - 1 || box.bottom > bottom + 1) && accident(ps.overflowY, p.scrollHeight - p.clientHeight);
      const cutX = (box.left < lft - 1 || box.right > rgt + 1) && accident(ps.overflowX, p.scrollWidth - p.clientWidth);
      if (shown && (cutY || cutX)) {
        problems.push(`${name(el)} is cut off by ${p.tagName.toLowerCase()}.${[...p.classList].join(".")}`);
        break;
      }
    }
  }
  return [...new Set(problems)].slice(0, 8);
}

/** Both checks, on the page as it settled. */
async function problemsOn(page: Page) {
  return [...(await page.evaluate(layoutProblems)), ...(await page.evaluate(controlProblems))];
}

test("every page holds its layout", async ({ browser }, info) => {
  test.setTimeout(20 * 60_000); // a cold dev server compiles all 40 pages
  const pages = new Map<Who, Page>();
  const report: Record<string, string[]> = {};
  const links = new Map<string, { who: Who; from: string }>();
  for (const route of routes) {
    const path = route.includes("[") ? samples[route] : route;
    if (!path) {
      report[route] = ["dynamic segment without a sample: add one in layout.spec.ts"];
      continue;
    }
    const who = whoFor(route);
    if (!pages.has(who)) pages.set(who, await signedIn(browser, who, info.project.use));
    const page = pages.get(who)!;
    const response = await page.goto(path);
    // support chat polls for messages and never goes idle
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    // a redirect that arrives just after "load" (/staff/login → /login on a slow server) restarts the
    // page under the measurement: measure the page it settled on
    const problems = await problemsOn(page).catch(async () => {
      await page.waitForLoadState("load");
      return problemsOn(page);
    });
    if ((response?.status() ?? 0) >= 500) problems.unshift(`answered ${response?.status()}`);
    // a page that crashed while rendering still lays out fine: its error screen is the failure
    if (await page.getByRole("heading", { name: "This page needs another try." }).count()) problems.unshift("shows the error page");
    if (problems.length) report[path] = problems;
    if (out) {
      await page.screenshot({
        path: `${out}/${info.project.name}${route.replace(/[/[\]]+/g, "_") || "_home"}.png`,
        fullPage: true,
      });
      for (const href of await page.$$eval("a[href^='/']", (as) => as.map((a) => a.getAttribute("href")!.split("#")[0])))
        if (!links.has(href)) links.set(href, { who, from: path });
    }
  }
  // signed in, the shopping pages grow more controls: Save to a board, another basket, the school pill
  const customer = pages.get("customer") ?? (await signedIn(browser, "customer", info.project.use));
  for (const path of ["/", "/catalog", samples["/products/[slug]"], "/cart"]) {
    await customer.goto(path);
    await customer.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    const problems = await problemsOn(customer);
    if (problems.length) report[`${path} (signed in)`] = problems;
    if (out)
      await customer.screenshot({
        path: `${out}/${info.project.name}-signed-in${path.replace(/[/[\]]+/g, "_") || "_home"}.png`,
        fullPage: true,
      });
  }
  // the shop and the policies come in full Marathi too: longer words, same layout rules
  const marathi = await signedIn(browser, "guest", info.project.use);
  await marathi.context().addCookies([{ name: "ags_locale", value: "mr", url: info.project.use.baseURL! }]);
  for (const href of ["/", "/catalog", samples["/products/[slug]"], "/cart", "/login", POLICIES_HOME.href, ...LEGAL_PAGES.map((policy) => policy.href)]) {
    await marathi.goto(href);
    await marathi.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    const problems = await problemsOn(marathi);
    if (problems.length) report[`${href} (mr)`] = problems;
    if (out)
      await marathi.screenshot({
        path: `${out}/${info.project.name}${href.replace(/\//g, "_")}_mr.png`,
        fullPage: true,
      });
  }
  if (out) {
    // every link a page offers should lead somewhere, opened as the person who saw it
    for (const [href, { who, from }] of links) {
      const page = pages.get(who) ?? marathi;
      const status = (await page.request.get(href, { maxRedirects: 0 }).catch(() => null))?.status() ?? 0;
      if (status === 404 || status >= 500 || !status) note(from, `link to ${href} answers ${status || "nothing"}`);
    }
    writeFileSync(`${out}/noise-${info.project.name}.json`, JSON.stringify(noise, null, 1));
    for (const key of Object.keys(noise)) delete noise[key];
  }
  expect(report).toEqual({});
});

// People who enlarge text (Android font scale, browser text size) still get a page that fits:
// the shopping path at double-size text, checked the same way.
test("the shopping path holds at 200% text", async ({ browser }, info) => {
  test.setTimeout(5 * 60_000);
  const report: Record<string, string[]> = {};
  for (const [who, paths] of [
    ["guest", ["/", "/catalog", samples["/products/[slug]"], "/cart"]],
    ["customer", ["/checkout", "/account", "/account/orders"]],
  ] as const) {
    const page = await signedIn(browser, who, info.project.use);
    for (const path of paths) {
      await page.goto(path);
      await page.addStyleTag({ content: "html { font-size: 200%; }" });
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
      const problems = await problemsOn(page);
      if (problems.length) report[path] = problems;
      if (out) await page.screenshot({ path: `${out}/${info.project.name}-200${path.replace(/[/[\]]+/g, "_")}.png` });
    }
  }
  expect(report).toEqual({});
});
