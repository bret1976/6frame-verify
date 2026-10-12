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
): Promise<PageCapture & { evidence: { uri: string; content_hash: string; name: string }[] }> {
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

  const evidence: { uri: string; content_hash: string; name: string }[] = [];
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
  let loadMs: number | undefined;
  let links: string[] = [];
  let imagesTotal = 0;
  let imagesMissingAlt = 0;
  let ogTitle: string | null = null;
  let ogImage: string | null = null;
  let hasViewportMeta = false;
  let hasFavicon = false;

  for (const path of input.required_paths.length ? input.required_paths : ["/"]) {
    const target = new URL(path, base).toString();
    const redirectSafe = await assertSafePublicHttpsUrl(target);
    if (!redirectSafe.ok) {
      pathStatuses[path] = 0;
      continue;
    }
    const t0 = Date.now();
    const resp = await page.goto(target, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    const elapsed = Date.now() - t0;
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
      loadMs = elapsed;
      await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => null);
      const sig = await page.evaluate(() => {
        const d = (globalThis as unknown as { document: any }).document;
        const meta = (sel: string) => d.querySelector(sel)?.getAttribute("content") ?? null;
        const imgs = Array.from(d.querySelectorAll("img")) as any[];
        const hrefs = (Array.from(d.querySelectorAll("a[href]")) as any[])
          .map((a) => a.href as string)
          .filter((h) => /^https?:/i.test(h));
        return {
          links: hrefs,
          imagesTotal: imgs.length,
          imagesMissingAlt: imgs.filter((i) => !i.hasAttribute("alt")).length,
          ogTitle: meta('meta[property="og:title"]'),
          ogImage: meta('meta[property="og:image"]'),
          hasViewportMeta: Boolean(d.querySelector('meta[name="viewport"]')),
          hasFavicon: Boolean(d.querySelector('link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]')),
        };
      });
      links = sig.links;
      imagesTotal = sig.imagesTotal;
      imagesMissingAlt = sig.imagesMissingAlt;
      ogTitle = sig.ogTitle;
      ogImage = sig.ogImage;
      hasViewportMeta = sig.hasViewportMeta;
      hasFavicon = sig.hasFavicon;
      if (!hasFavicon) {
        const fav = await fetchStatus(new URL("/favicon.ico", landed).toString());
        hasFavicon = fav >= 200 && fav < 400;
      }
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
    // JPEG keeps full-page captures small enough to persist in Postgres for report pages.
    let shot = await page.screenshot({ fullPage: true, type: "jpeg", quality: 60 });
    if (shot.length > 3_500_000) {
      shot = await page.screenshot({ fullPage: false, type: "jpeg", quality: 60 });
    }
    const name = `viewport-${vp.name}.jpg`;
    const stored = await storeEvidence(jobId, name, shot);
    evidence.push({ uri: stored.uri, content_hash: stored.content_hash, name });
  }

  await context.close();

  const { checked: linksChecked, broken: brokenLinks } = await checkLinks(links, finalUrl);

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
    loadMs,
    linksChecked,
    brokenLinks,
    imagesTotal,
    imagesMissingAlt,
    ogTitle,
    ogImage,
    hasViewportMeta,
    hasFavicon,
    evidence,
  };
}

export async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

const UA = "Mozilla/5.0 (compatible; 6FrameVerify/1.1; +https://siteverify.dev)";

async function fetchStatus(url: string): Promise<number> {
  if (!/^https:/i.test(url)) return 0;
  const safe = await assertSafePublicHttpsUrl(url);
  if (!safe.ok) return -1;
  for (const method of ["HEAD", "GET"] as const) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const r = await fetch(url, { method, redirect: "follow", signal: ctrl.signal, headers: { "user-agent": UA } });
      clearTimeout(t);
      if (method === "HEAD" && (r.status === 405 || r.status === 403 || r.status === 400 || r.status === 501)) continue;
      if (method === "GET") await r.body?.cancel().catch(() => null);
      return r.status;
    } catch {
      if (method === "GET") return 0;
    }
  }
  return 0;
}

/** Check up to 25 unique links (same-site first). Skips non-https and SSRF-blocked targets. */
async function checkLinks(all: string[], pageUrl: string) {
  const origin = (() => { try { return new URL(pageUrl).origin; } catch { return ""; } })();
  const uniq = Array.from(new Set(all.map((h) => h.split("#")[0]!).filter(Boolean)));
  const same = uniq.filter((h) => h.startsWith(origin));
  const other = uniq.filter((h) => !h.startsWith(origin));
  const targets = [...same, ...other].filter((h) => /^https:/i.test(h)).slice(0, 25);
  const broken: { url: string; status: number }[] = [];
  let checked = 0;
  const queue = [...targets];
  async function workerLoop() {
    while (queue.length) {
      const u = queue.shift()!;
      const st = await fetchStatus(u);
      if (st === -1) continue; // blocked by SSRF policy: not checked
      checked += 1;
      // 401/403/429 often mean bot protection, not a broken link
      if (st === 0 || st === 404 || st === 410 || st >= 500) broken.push({ url: u, status: st });
    }
  }
  await Promise.all(Array.from({ length: 5 }, workerLoop));
  return { checked, broken };
}
