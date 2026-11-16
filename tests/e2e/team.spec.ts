// The developer credit, at desktop and phone width: every shop page ends with a "Developed by" card
// that leads to /p/team; only Tech sees Settings → Developer and team, and what Tech saves there
// shows on the card and the team page. An owner without Tech doesn't get the section.
import { test, expect, type Browser, type TestInfo } from "@playwright/test";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User } from "../../src/lib/db/models";

const uri = "mongodb://127.0.0.1:27028/ags_test_e2e?replicaSet=ags-local";
const PASSWORD = "Local-test-password-123";
const PEOPLE = {
  tech: { name: "Team Tech", email: "team-tech@e2e.test", phone: "9000000141", roles: ["customer", "super-admin", "tech"] },
  owner: { name: "Team Owner", email: "team-owner@e2e.test", phone: "9000000142", roles: ["customer", "super-admin"] },
};
type Who = keyof typeof PEOPLE;
const out = process.env.SHOT_DIR;

test.beforeAll(async () => {
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  await User.create(Object.values(PEOPLE).map((person) => ({ ...person, passwordHash, emailVerified: true })));
});
test.afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function signedIn(browser: Browser, info: TestInfo, who: Who) {
  const { baseURL, viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = info.project.use;
  const page = await (await browser.newContext({ baseURL, viewport, isMobile, hasTouch, userAgent, deviceScaleFactor })).newPage();
  await page.goto("/login");
  await page.getByRole("button", { name: "Email", exact: true }).click();
  await page.getByLabel("Email address").fill(PEOPLE[who].email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in with email" }).click();
  await page.waitForURL((url) => url.pathname !== "/login", { timeout: 30_000 });
  return page;
}

test("every shop page ends with the developer's card, which leads to the team", async ({ page }, info) => {
  await page.goto("/p");
  const card = page.getByRole("region", { name: "Developed by Krish Modi" });
  await expect(card.getByText("Lead developer")).toBeVisible();
  await expect(card.getByRole("link", { name: "Email" })).toHaveAttribute("href", "mailto:krishmodi3030@gmail.com");
  // nothing filled in yet: no empty WhatsApp or LinkedIn buttons
  await expect(card.getByRole("link", { name: "WhatsApp" })).toHaveCount(0);
  if (out) {
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/${info.project.name}_dev-card.png`, fullPage: false });
  }
  await card.getByRole("link", { name: "Meet the team" }).click();
  await expect(page).toHaveURL(/\/p\/team$/);
  await expect(page.getByRole("heading", { name: "The team behind the site" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Swarnabh" })).toBeVisible();
  await expect(page.getByRole("link", { name: "krishmodi3030@gmail.com" })).toBeVisible();
  if (out) await page.screenshot({ path: `${out}/${info.project.name}_team-page.png`, fullPage: true });
});

test("only Tech changes the credits, and the card shows what Tech saves", async ({ browser }, info) => {
  const owner = await signedIn(browser, info, "owner");
  await owner.goto("/super-admin");
  await expect(owner.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(owner.getByRole("link", { name: /Developer and team/ })).toHaveCount(0);
  await owner.context().close();

  const tech = await signedIn(browser, info, "tech");
  await tech.goto("/super-admin#team");
  const section = tech.locator("#team");
  await expect(section.getByRole("heading", { name: "Developer and team" })).toBeVisible();
  await section.getByLabel("WhatsApp number").fill("9876543210");
  await section.getByRole("button", { name: "Save developer and team" }).click();
  await expect(section.getByText("Developer and team saved.")).toBeVisible();
  await tech.goto("/p/team");
  await expect(tech.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", "https://wa.me/919876543210");
  // the footer card leaves the team page alone, and carries the number everywhere else
  await expect(tech.getByRole("region", { name: "Developed by Krish Modi" })).toBeHidden();
  await tech.goto("/p");
  await expect(tech.getByRole("region", { name: "Developed by Krish Modi" }).getByRole("link", { name: "WhatsApp" })).toBeVisible();
  await tech.context().close();
});
