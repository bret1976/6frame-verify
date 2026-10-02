import { chromium, type Browser } from "playwright";
import {
  assertSafePublicHttpsUrl,
  type PageCapture,
} from "@6frame/evaluators";
import type { WebsiteAcceptanceInput } from "@6frame/contracts";
import { storeEvidence } from "./storage.js";

let browser: Browser | null = null;

async function getBrowser() {
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--disable-dev-shm-usage",
        "--no-sandbox",
        "--disable-gpu",
        "--disable-extensions",
      ],
    });
  }
  return browser;
}

export async function captureWebsite(
  jobId: string,
  input: WebsiteAcceptanceInput,
): Promise<PageCapture & { evidencePaths: string[] }> {
  const safe = await assertSafePublicHttpsUrl(input.target_url);
  if (!safe.ok) {
    throw Object.assign(new Error(safe.message), { code: safe.code });
  }

  const b = await getBrowser();
  const context = await b.newContext({
    javaScriptEnabled: true,
    acceptDownloads: false,
    permissions: [],
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  const evidencePaths: string[] = [];
  const pathStatuses: Record<string, number> = {};

  const base = new URL(input.target_url);
  let primaryStatus = 0;
  let finalUrl = input.target_url;
  let title = "";
  let metaDescription: string | null = null;
  let h1Count = 0;
  let bodyText = "";
  let ctaTexts: string[] = [];
  let overflowX = false;

  for (const path of input.required_paths.length ? input.required_paths : ["/"]) {
    const target = new URL(path, base).toString();
    const redirectSafe = await assertSafePublicHttpsUrl(target);
    if (!redirectSafe.ok) {
      pathStatuses[path] = 0;
      continue;
    }
    const resp = await page.goto(target, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    // Re-check final URL against SSRF
    const landed = page.url();
    const landedSafe = await assertSafePublicHttpsUrl(landed);
    if (!landedSafe.ok) {
      throw Object.assign(new Error(`Redirect blocked: ${landedSafe.message}`), {
        code: "ssrf_redirect",
      });
    }
    const status = resp?.status() ?? 0;
    pathStatuses[path] = status;
    if (path === input.required_paths[0] || path === "/") {
      primaryStatus = status;
      finalUrl = landed;
      title = await page.title();
      metaDescription = await page
        .locator('meta[name="description"]')
        .first()
        .getAttribute("content")
        .catch(() => null);
      h1Count = await page.locator("h1").count();
      bodyText = await page.locator("body").innerText().catch(() => "");
      ctaTexts = await page
        .locator("a, button")
        .allTextContents()
        .then((t) => t.map((x) => x.trim()).filter(Boolean).slice(0, 200));
    }
  }

  for (const vp of input.viewport_matrix) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(300);
    const hasOverflow = await page.evaluate(() => {
      const el = (globalThis as unknown as { document: { documentElement: { scrollWidth: number; clientWidth: number } } }).document.documentElement;
      return el.scrollWidth > el.clientWidth + 2;
    });
    if (hasOverflow) overflowX = true;
    const shot = await page.screenshot({ fullPage: true, type: "png" });
    const stored = await storeEvidence(jobId, `viewport-${vp.name}.png`, shot);
    evidencePaths.push(stored.uri);
  }

  await context.close();

  return {
    url: input.target_url,
    finalUrl,
    status: primaryStatus,
    title,
    metaDescription,
    h1Count,
    bodyText,
    ctaTexts,
    consoleErrors,
    overflowX,
    pathStatuses,
    evidencePaths,
  };
}

export async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}
