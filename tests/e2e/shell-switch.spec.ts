// Signing in or out re-renders the whole page, and the page it lands on can have a different shell
// (shop or school marketplace, see AdaptiveShell). The header and footer stream in separately. If a
// piece arrives in the instant after React paused on it, React goes through the component's children
// again without forgetting what it had already marked for removal, removes the old nodes twice and
// the page crashes ("removeChild ... not a child of this node", then "The store didn't load.").
// That instant lasts a few milliseconds, so in ordinary runs this failed about one time in three.
// Here the footer is held back and let go exactly then, so a return of the bug fails every time.
import { test, expect, type Page } from "@playwright/test";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User } from "../../src/lib/db/models";
import { School } from "../../src/lib/schools/models";

const uri = "mongodb://127.0.0.1:27028/ags_test_e2e?replicaSet=ags-local";
const PASSWORD = "Local-test-password-123";
const EMAIL = "shell-switch@e2e.test";
const TOKEN = "e2e-shell-switch-token-1";
const JOIN = `/school/join/${TOKEN}`;

type Fiber = { type?: { name?: string } | string; return?: Fiber } | null;
type Held = { __holdFooter?: boolean; __reactPaused?: (fiber: Fiber) => void; __letGoInTime?: boolean };

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  const user = await User.create({
    name: "Shell Switch",
    email: EMAIL,
    phone: "9000000131",
    roles: ["customer"],
    passwordHash: await bcrypt.hash(PASSWORD, 12),
    emailVerified: true,
  });
  await School.create({ name: "E2E Shell School", stateCode: "27", joinToken: TOKEN, createdBy: user._id });
});
test.afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

/** React's development bundle, in this browser only: tells the page when React pauses on a piece that hasn't arrived. */
const PAUSE = 'if (null !== x && "object" === typeof x && "function" === typeof x.then) throw suspendedThenable = x';
async function reportReactPauses(page: Page) {
  let hooked = false;
  await page.route("**/*react-dom*.js", async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    hooked ||= body.includes(PAUSE);
    await route.fulfill({
      response,
      body: body.replace(PAUSE, () => PAUSE.replace(") throw", " && (window.__reactPaused?.(workInProgress), true)) throw")),
    });
  });
  // fails loudly after a React upgrade moves this code, rather than quietly testing nothing
  return () => expect(hooked, "the line this test adds to React is no longer there").toBe(true);
}

/**
 * Runs in the page. A server action's answer is a stream of rows, each filling in one piece of the
 * page, in any order. While `__holdFooter` is on, the whole answer arrives at once except the footer's
 * row. That row follows in the gap after React's second pause on it: by then the first pause has left
 * React listening for it, so React sees it as ready and picks up where it stopped instead of starting over.
 */
function holdFooterRowOfActions() {
  const win = window as unknown as Held;
  const original = window.fetch;
  let pauses = 0;
  let letGo: (() => void) | undefined;
  win.__reactPaused = (fiber) => {
    const inShell = (node: Fiber | undefined) => typeof node?.type === "function" && node.type.name === "AdaptiveShell";
    if (!letGo || !(inShell(fiber) || inShell(fiber?.return))) return;
    if (++pauses !== 2) return;
    win.__letGoInTime = true;
    queueMicrotask(letGo);
  };
  window.fetch = async (input, init) => {
    const response = await original(input, init);
    if (!win.__holdFooter || !new Headers(init?.headers).has("next-action") || !response.body) return response;
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let text = "";
    const body = response.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk) {
          text += decoder.decode(chunk, { stream: true });
        },
        async flush(controller) {
          // every row ends in a newline and nothing may be added: a stray one is read as the next row's start
          const footer = text.split("\n").filter((row) => row.includes('"className":"site-footer"'));
          controller.enqueue(encoder.encode(footer.reduce((rest, row) => rest.replace(`${row}\n`, () => ""), text)));
          // the page must carry on if React never pauses here
          await new Promise<void>((resolve) => {
            letGo = resolve;
            setTimeout(resolve, 2000);
          });
          controller.enqueue(encoder.encode(footer.map((row) => `${row}\n`).join("")));
        },
      }),
    );
    return new Response(body, response);
  };
}

/** Whatever crashed the page, by name: "The store didn't load." alone doesn't say why. */
function pageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}
async function holdFooter(page: Page) {
  await page.evaluate(() => {
    (window as unknown as Held).__holdFooter = true;
  });
}
/** Fails if the footer wasn't let go in the gap: the test would then pass without testing anything. */
async function expectFooterLetGoInTime(page: Page) {
  expect(await page.evaluate(() => (window as unknown as Held).__letGoInTime)).toBe(true);
}
async function signIn(page: Page) {
  await page.getByRole("button", { name: "Email", exact: true }).click();
  await page.getByLabel("Email address").fill(EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in with email" }).click();
}

test("signing in moves from the shop's shell to the school's when the footer comes at the worst moment", async ({ page }) => {
  const errors = pageErrors(page);
  const expectReactHooked = await reportReactPauses(page);
  await page.addInitScript(holdFooterRowOfActions);
  await page.goto(`/login?then=${encodeURIComponent(JOIN)}`);
  await holdFooter(page);
  await signIn(page);
  await expect(page).toHaveURL(JOIN);
  await expect(page.locator("main")).toBeVisible();
  // a moment for a crash to show itself, then it is named before anything else is checked
  await page.waitForLoadState("networkidle").catch(() => {});
  expect(errors).toEqual([]);
  await expect(page.getByLabel("A line for the store")).toBeVisible();
  expectReactHooked();
  await expectFooterLetGoInTime(page);
  // the shop's header went, the school's came, and there is one footer, last on the page
  await expect(page.locator("header.school-header")).toHaveCount(1);
  await expect(page.locator("header.header:not(.school-header)")).toHaveCount(0);
  await expect(page.locator("body > main ~ footer.site-footer")).toHaveCount(1);
});

test("signing out moves from the school's shell to the shop's when the footer comes at the worst moment", async ({ page }) => {
  const errors = pageErrors(page);
  const expectReactHooked = await reportReactPauses(page);
  await page.addInitScript(holdFooterRowOfActions);
  await page.goto(`/login?then=${encodeURIComponent(JOIN)}`);
  await signIn(page);
  await expect(page.getByLabel("A line for the store")).toBeVisible();
  await holdFooter(page);
  // at phone width this menu's button isn't on screen; which button sends the form doesn't matter here
  await page
    .locator(".account-menu form", { has: page.locator(".account-menu-signout") })
    .evaluate((form: HTMLFormElement) => form.requestSubmit());
  await expect(page).toHaveURL("/");
  await page.waitForLoadState("networkidle").catch(() => {});
  expect(errors).toEqual([]);
  await expect(page.locator("header.header:not(.school-header)")).toHaveCount(1);
  expectReactHooked();
  await expectFooterLetGoInTime(page);
  await expect(page.locator("header.school-header")).toHaveCount(0);
  await expect(page.locator("body > main ~ footer.site-footer")).toHaveCount(1);
});
