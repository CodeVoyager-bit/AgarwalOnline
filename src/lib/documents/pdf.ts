import "server-only";
import type { Browser, BrowserContext } from "playwright-core";
import { log } from "../logger";

/*
 * A bill page turned into a PDF by a real Chromium, so every bill style, the Marathi text and the page
 * sizes come out exactly as the page prints. On Vercel it uses @sparticuz/chromium, a Chromium built to
 * fit a serverless function; elsewhere Playwright's own Chromium (installed with the tests), or the one
 * at PDF_CHROME_PATH.
 *
 * One Chromium is kept running and shared by the bills made one after another, each in its own tab:
 * starting one costs a moment, and closing one can take many seconds (up to half a minute on Windows),
 * which a customer waiting for a PDF shouldn't sit through. It closes itself after a minute without bills.
 */

/**
 * Fonts for the PDF: Noto for Latin and Devanagari, fetched from Google Fonts at the time, since a
 * serverless Chromium has almost no fonts of its own and would print Marathi as empty boxes. The tabs
 * share one browser profile, so the fonts are fetched once and then come from its cache.
 */
const FONTS =
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;700&family=Noto+Sans+Devanagari:wght@400;700&family=Noto+Serif:wght@400;700&display=block">' +
  '<style>body,body *{font-family:"Noto Sans","Noto Sans Devanagari",Arial,Helvetica,sans-serif}.serif,.label,th,h1.serif{font-family:Georgia,"Noto Serif","Noto Sans Devanagari",serif}</style>';

/** How long the shared Chromium waits for another bill before closing. */
const IDLE_MS = 60_000;

type Shared = { context: Promise<BrowserContext> | null; busy: number; idle: ReturnType<typeof setTimeout> | null };
// on globalThis, so a reload of this file while developing doesn't leave a Chromium behind
const shared: Shared = ((globalThis as { __billPdf?: Shared }).__billPdf ??= { context: null, busy: 0, idle: null });

async function launch(): Promise<Browser> {
  const { chromium } = await import("playwright-core");
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_VERSION) {
    const serverless = (await import("@sparticuz/chromium")).default;
    // a bill draws no 3D: without the software graphics stack the single-process Chromium starts
    // sooner and has less to crash on
    serverless.setGraphicsMode = false;
    return chromium.launch({ executablePath: await serverless.executablePath(), args: serverless.args, headless: true });
  }
  return chromium.launch({ headless: true, ...(process.env.PDF_CHROME_PATH ? { executablePath: process.env.PDF_CHROME_PATH } : {}) });
}

/** The shared browser profile, started if there is none or the last one died. */
function context() {
  if (!shared.context) {
    const starting = launch().then(async (browser) => {
      browser.on("disconnected", () => {
        if (shared.context === starting) shared.context = null;
      });
      return browser.newContext();
    });
    // a Chromium that failed to start is tried again by the next bill, not kept as a failure
    starting.catch(() => {
      if (shared.context === starting) shared.context = null;
    });
    shared.context = starting;
  }
  return shared.context;
}

/** Closes the shared Chromium in the background once no bill has used it for a while. */
function release() {
  shared.busy -= 1;
  if (shared.busy > 0) return;
  shared.idle = setTimeout(() => {
    const closing = shared.context;
    shared.context = null;
    shared.idle = null;
    closing?.then((ctx) => ctx.browser()?.close()).catch(() => {});
  }, IDLE_MS);
  // a waiting close never keeps the server process alive on its own
  shared.idle.unref?.();
}

/** Throws the shared Chromium away (it crashed, or hung), so the next bill starts a fresh one. */
function discard(broken: Promise<BrowserContext> | null) {
  if (!broken || shared.context !== broken) return;
  shared.context = null;
  broken.then((ctx) => ctx.browser()?.close()).catch(() => {});
}

/** One bill page drawn as a PDF in a tab of the shared Chromium. */
async function render(html: string) {
  const current = context();
  try {
    const page = await (await current).newPage();
    try {
      // "domcontentloaded", not "load": the fonts and the logo come over the network, and waiting for all
      // of them used to fail the whole PDF when one was slow. They get a little time below, then are left out.
      await page.setContent(html.replace("</head>", `${FONTS}</head>`), { waitUntil: "domcontentloaded", timeout: 20_000 });
      await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => log("warn", "bill-pdf.slow-assets", {}));
      await page.evaluate(() => Promise.race([document.fonts.ready, new Promise((done) => setTimeout(done, 3_000))]));
      return await page.pdf({ printBackground: true, preferCSSPageSize: true, format: "A4" });
    } finally {
      await page.close().catch(() => {});
    }
  } catch (error) {
    discard(current);
    throw error;
  }
}

/** The PDF of a bill page's HTML. The page's own @page rule sets the paper (A4, A5 or the receipt roll). */
export async function htmlToPdf(html: string) {
  if (shared.idle) clearTimeout(shared.idle);
  shared.idle = null;
  shared.busy += 1;
  try {
    try {
      return await render(html);
    } catch (error) {
      // a Chromium that died since the last bill (on Vercel it runs as a single process, and a frozen
      // function can wake with it gone) is replaced, and the bill tried once more before giving up
      log("warn", "bill-pdf.retry", { error });
      return await render(html);
    }
  } finally {
    release();
  }
}
