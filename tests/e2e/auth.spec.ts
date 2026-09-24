import { test, expect, type Page } from "@playwright/test";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User } from "../../src/lib/db/models";

const uri = "mongodb://127.0.0.1:27028/ags_test_e2e?replicaSet=ags-local";
const CUSTOMER = { phone: "9000000031", email: "auth-customer@e2e.test", name: "Auth Customer" };
const STAFF = { phone: "9000000032", email: "auth-admin@e2e.test", name: "Auth Admin" };
const PAUSED = { phone: "9000000033", name: "Paused Person" };
const PASSWORD = "Local-test-password-123";
const OTP = "246810";
const phones = [CUSTOMER.phone, STAFF.phone, PAUSED.phone];

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await mongoose.connect(uri);
  await User.deleteMany({ phone: { $in: phones } });
  // OTP sends are limited per phone per 15 minutes; earlier runs must not eat this run's budget
  for (const name of ["ratelimits", "authRateLimits"])
    await mongoose.connection.collection(name).deleteMany({});
  await User.create([
    { ...STAFF, roles: ["customer", "admin"], passwordHash: await bcrypt.hash(PASSWORD, 12) },
    { ...PAUSED, roles: ["customer"], active: false },
  ]);
});
test.afterAll(async () => {
  await User.deleteMany({ phone: { $in: phones } });
  await mongoose.disconnect();
});

async function signOut(page: Page) {
  await page.goto("/account");
  await page.locator("main").getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("link", { name: "Sign in" }).first()).toBeVisible();
}
async function menu(page: Page) {
  const details = page.locator(".account-menu");
  if (!(await details.isVisible())) return null; // phones use the bottom nav instead
  await details.locator("summary").click();
  return details;
}

test("signs up by OTP with a password and lands on the account", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Email address").fill(CUSTOMER.email);
  await page.getByLabel("Mobile number").fill(CUSTOMER.phone);
  await page.getByRole("button", { name: "Start account creation" }).click();
  await page.getByLabel("Your name").fill(CUSTOMER.name);
  await page.getByLabel("Create password").fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await page.getByLabel("Verification code").fill(OTP);
  await page.getByRole("button", { name: "Verify & continue" }).click();
  await expect(page).toHaveURL("/account");
  await expect(page.getByRole("heading", { name: `Hello, ${CUSTOMER.name}` })).toBeVisible();
  const opened = await menu(page);
  if (opened) {
    await expect(opened.getByRole("link", { name: "Orders", exact: true })).toBeVisible();
    await expect(opened.getByText("Store workspace")).toHaveCount(0);
    await opened.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL("/");
  } else await signOut(page);
  const stored = await User.findOne({ phone: CUSTOMER.phone });
  expect(stored?.roles).toEqual(["customer"]);
});

test("mobile number and password: rejects a wrong password, accepts the right one", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Mobile number").fill(CUSTOMER.phone);
  await page.getByLabel("Password", { exact: true }).fill("not-the-password-1");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator(".error-message")).toContainText("Invalid mobile number or password.");
  // the number typed before the failed attempt is still there
  await expect(page.getByLabel("Mobile number")).toHaveValue(CUSTOMER.phone);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("/account");
  await signOut(page);
});

test("email and password signs a customer in", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Email", exact: true }).click();
  await page.getByLabel("Email address").fill(CUSTOMER.email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in with email" }).click();
  await expect(page).toHaveURL("/account");
  await signOut(page);
});

test("OTP signs an existing customer in, and refuses a paused account", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /Use OTP/ }).click();
  await page.getByLabel("Mobile number").fill(PAUSED.phone);
  await page.getByRole("button", { name: "Sign in with OTP" }).click();
  await expect(page.locator(".error-message")).toContainText("not active");
  await page.getByLabel("Mobile number").fill(CUSTOMER.phone);
  await page.getByRole("button", { name: "Sign in with OTP" }).click();
  await page.getByLabel("Verification code").fill(OTP);
  await page.getByRole("button", { name: "Verify & continue" }).click();
  await expect(page).toHaveURL("/account");
  await signOut(page);
});

test("staff sign in on the same page, land in their workspace and can switch from the menu", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Email", exact: true }).click();
  await page.getByLabel("Email address").fill(STAFF.email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in with email" }).click();
  await expect(page).toHaveURL("/admin");
  await page.goto("/");
  const opened = await menu(page);
  if (opened) {
    await expect(opened.getByText("Store workspace")).toBeVisible();
    await opened.getByRole("link", { name: "Operations" }).click();
    await expect(page).toHaveURL("/admin");
  } else {
    await page.goto("/account");
    await page.getByRole("link", { name: /Open your workspace/ }).click();
    await expect(page).toHaveURL("/admin");
  }
  await page.goto("/super-admin/staff");
  await expect(page).toHaveURL("/forbidden");
  await signOut(page);
});

test("staff can also sign in by OTP, and /staff/login now redirects", async ({ page }) => {
  await page.goto("/staff/login");
  await expect(page).toHaveURL("/login");
  await page.getByRole("button", { name: /Use OTP/ }).click();
  await page.getByLabel("Mobile number").fill(STAFF.phone);
  await page.getByRole("button", { name: "Sign in with OTP" }).click();
  await page.getByLabel("Verification code").fill(OTP);
  await page.getByRole("button", { name: "Verify & continue" }).click();
  await expect(page).toHaveURL("/admin");
  // staff sessions end 12 hours after sign-in: age this one in the database and the next request signs out
  const staffId = (await User.findOne({ phone: STAFF.phone }))!._id;
  await mongoose.connection
    .collection("authSessions")
    .updateMany({ userId: staffId }, { $set: { createdAt: new Date(Date.now() - 13 * 3600000) } });
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login/);
  expect(await mongoose.connection.collection("authSessions").countDocuments({ userId: staffId })).toBe(0);
});
