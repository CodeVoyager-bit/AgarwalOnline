// The bottom of a product page, at desktop and phone width: real orders fill the "Often bought
// together" box and "Add all 3" puts everything in the basket, for a guest and a signed-in shopper;
// an item with too few sales gets "Popular in this category" instead, with no "Add all"; Similar
// items and Other items follow, and no row scrolls the page sideways.
import { test, expect, type Page } from "@playwright/test";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { Category, InventoryItem, Product, ProductVariant, User } from "../../src/lib/db/models";
import { CartLine, Order } from "../../src/lib/commerce/models";

const uri = "mongodb://127.0.0.1:27028/ags_test_e2e?replicaSet=ags-local";
const PASSWORD = "Local-test-password-123";
const SHOPPER = { name: "Related Shopper", email: "related-shopper@e2e.test", phone: "9000000431" };
const out = process.env.SHOT_DIR;
const packs = new Map<string, mongoose.Types.ObjectId>();

async function addProduct(slug: string, name: string, categorySlug: string, price: number) {
  const category = await Category.findOne({ slug: categorySlug });
  const product = await Product.create({
    slug,
    name: { en: name, mr: name },
    description: { en: "A test item", mr: "चाचणी वस्तू" },
    brand: "RELATED",
    categoryId: category!._id,
    categorySlug,
    status: "published",
  });
  const pack = await ProductVariant.create({
    productId: product._id,
    sku: `RELATED-${slug}`,
    label: "1 piece",
    unit: "piece",
    packQuantity: 1,
    pricePaise: price * 100,
    mrpPaise: price * 100,
  });
  await InventoryItem.create({ variantId: pack._id, onHand: 50 });
  packs.set(slug, pack._id);
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  await Category.create([
    { slug: "notebooks", name: { en: "Notebooks", mr: "वह्या" } },
    { slug: "geometry", name: { en: "Geometry", mr: "भूमिती" } },
    { slug: "toys", name: { en: "Toys", mr: "खेळणी" } },
  ]);
  await addProduct("long-book", "Long Book", "notebooks", 60);
  await addProduct("graph-book", "Graph Book", "notebooks", 45);
  await addProduct("drawing-book", "Drawing Book", "notebooks", 40);
  await addProduct("gel-pen", "Gel Pen", "notebooks", 10);
  await addProduct("eraser", "Soft Eraser", "toys", 5);
  await addProduct("toy-car", "Toy Car", "toys", 99);
  await addProduct("ruler", "Steel Ruler", "geometry", 20);
  await addProduct("set-square", "Set Square", "geometry", 25);
  await addProduct("protractor", "Protractor", "geometry", 15);
  // two different customers ordered the pen and the eraser with the long book
  await Order.collection.insertMany(
    ["a", "b"].map((customer) => ({
      customerId: new mongoose.Types.ObjectId(customer.padStart(24, "0")),
      number: `AGS-RELATED-${customer}`,
      idempotencyKey: `related-${customer}`,
      items: ["long-book", "gel-pen", "eraser"].map((slug) => ({
        variantId: packs.get(slug),
        name: slug,
        label: "1 piece",
        quantity: 1,
        pricePaise: 1000,
        linePaise: 1000,
      })),
      orderStatus: "confirmed",
      createdAt: new Date(),
    })),
  );
  await User.create({
    ...SHOPPER,
    roles: ["customer"],
    emailVerified: true,
    passwordHash: await bcrypt.hash(PASSWORD, 12),
  });
  await mongoose.connection.collection("ratelimits").deleteMany({});
});
test.afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

const shot = async (page: Page, name: string) => {
  if (out) await page.screenshot({ path: `${out}/${test.info().project.name}_related-${name}.png`, fullPage: true });
};
const box = (page: Page) => page.locator(".together-box");
const settled = (page: Page) => expect(box(page)).toHaveAttribute("aria-busy", "false");

test("a guest sees what's bought together, and adds it all in one tap", async ({ page }) => {
  await page.goto("/products/long-book");
  await expect(page.getByRole("heading", { name: "Often bought together" })).toBeVisible();
  await shot(page, "bundle");

  // the button follows the ticks and the total
  const addAll = box(page).getByRole("button", { name: "Add all 3 · ₹75" });
  await expect(addAll).toBeVisible();
  await box(page).getByRole("checkbox", { name: "Include Soft Eraser" }).uncheck();
  await expect(box(page).getByRole("button", { name: "Add 2 · ₹70" })).toBeVisible();
  await box(page).getByRole("checkbox", { name: "Include Long Book" }).uncheck();
  await box(page).getByRole("checkbox", { name: "Include Gel Pen" }).uncheck();
  await expect(box(page).getByRole("button", { name: "Choose an item" })).toBeDisabled();
  for (const name of ["Long Book", "Gel Pen", "Soft Eraser"])
    await box(page).getByRole("checkbox", { name: `Include ${name}` }).check();

  await addAll.click();
  await expect(box(page).getByRole("link", { name: "View basket" })).toBeVisible();
  await expect(box(page).getByText("In basket")).toHaveCount(3);
  await settled(page);
  await shot(page, "bundle-added");

  // the basket really has all three, after a full page load
  await page.goto("/cart");
  const basket = page.locator("main");
  for (const name of ["Long Book", "Gel Pen", "Soft Eraser"]) await expect(basket.getByRole("link", { name }).first()).toBeVisible();

  // back on the page, the box remembers
  await page.goto("/products/long-book");
  await expect(box(page).getByText("In basket")).toHaveCount(3);
});

test("adding part of the box leaves the rest to add", async ({ page }) => {
  await page.goto("/products/long-book");
  await box(page).getByRole("checkbox", { name: "Include Soft Eraser" }).uncheck();
  await box(page).getByRole("button", { name: "Add 2 · ₹70" }).click();
  await expect(box(page).getByText("In basket")).toHaveCount(2);
  await settled(page);
  // only the eraser is still open: one tap adds it, and everything is in the basket
  await box(page).getByRole("checkbox", { name: "Include Soft Eraser" }).check();
  await box(page).getByRole("button", { name: "Add 1 · ₹5" }).click();
  await expect(box(page).getByRole("link", { name: "View basket" })).toBeVisible();
  await settled(page);
});

test("a signed-in shopper's bundle is saved to their own basket", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Email", exact: true }).click();
  await page.getByLabel("Email address").fill(SHOPPER.email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in with email" }).click();
  await page.waitForURL((url) => url.pathname !== "/login", { timeout: 30_000 });

  await page.goto("/products/long-book");
  await box(page).getByRole("button", { name: "Add all 3 · ₹75" }).click();
  await expect(box(page).getByRole("link", { name: "View basket" })).toBeVisible();
  await settled(page);
  const shopper = await User.findOne({ email: SHOPPER.email });
  await expect.poll(() => CartLine.countDocuments({ customerId: shopper!._id })).toBe(3);
});

test("Similar items and Other items follow, each item once, and nothing scrolls the page sideways", async ({ page }) => {
  await page.goto("/products/long-book");
  const similar = page.getByRole("region", { name: "Similar items" });
  await expect(similar.getByText("In Notebooks")).toBeVisible();
  await expect(similar.getByRole("link", { name: /Graph Book/ })).toBeVisible();
  await expect(similar.getByRole("link", { name: /Drawing Book/ })).toBeVisible();
  // already in the box above
  await expect(similar.getByRole("link", { name: /Gel Pen/ })).toHaveCount(0);

  const others = page.getByRole("region", { name: "Other items" });
  await expect(others.getByRole("link", { name: /Toy Car/ })).toBeVisible();
  await expect(others.getByRole("link", { name: /Steel Ruler/ })).toBeVisible();
  await expect(others.getByRole("link", { name: /Soft Eraser/ })).toHaveCount(0);
  await expect(others.getByRole("link", { name: "See all" })).toHaveAttribute("href", "/catalog");

  // the row's own Add button works
  await others.getByRole("button", { name: "Add Toy Car to basket" }).click();
  await expect(others.getByLabel("Quantity of Toy Car in basket")).toContainText("1");

  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(wide).toBeLessThanOrEqual(0);
  await page.getByRole("heading", { name: "Other items", exact: true }).scrollIntoViewIfNeeded();
  await shot(page, "rows");
});

test("an item with too few sales shows popular items, with no Add all", async ({ page }) => {
  await page.goto("/products/ruler");
  await expect(page.getByRole("heading", { name: "Popular in this category" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Often bought together" })).toHaveCount(0);
  await expect(page.locator(".together-box")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Other items", exact: true })).toBeVisible();
  await shot(page, "popular");
});

test("works in Marathi", async ({ page }) => {
  await page.goto("/products/long-book?lang=mr");
  await expect(page.getByRole("heading", { name: "अनेकदा एकत्र घेतल्या जातात" })).toBeVisible();
  await expect(box(page).getByRole("button", { name: "सर्व 3 जोडा · ₹75" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "अशाच वस्तू" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "इतर वस्तू" })).toBeVisible();
});
