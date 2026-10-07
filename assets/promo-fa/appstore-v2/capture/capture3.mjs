// Third pass: split each page into [static header] + [tall scrollable middle] + [static bottom bar]
// so the video can animate real scrolling inside a phone frame.
// Run from the repo root:  node brag-output-fa-appstore-v2/capture/capture3.mjs
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE_URL ?? "https://metto.ir";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "shots");
mkdirSync(OUT, { recursive: true });

const W = 412;
const STD_H = 892;
const TALL_H = 1900;

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({
  viewport: { width: W, height: STD_H },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: "fa-IR",
  timezoneId: "Asia/Tehran",
  colorScheme: "light",
  geolocation: { latitude: 35.7194, longitude: 51.4091 },
  permissions: ["geolocation"],
});
const page = await ctx.newPage();
const settle = async (ms = 1500) => {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(ms);
};

// Header bottom edge + top edge of whatever is pinned to the bottom of the viewport.
const measure = () =>
  page.evaluate(() => {
    const vh = window.innerHeight;
    const headerBottom = Math.round(document.querySelector("header").getBoundingClientRect().bottom);
    let barTop = vh;
    for (const el of document.querySelectorAll("body *")) {
      const cs = getComputedStyle(el);
      if (cs.position !== "fixed" && cs.position !== "sticky") continue;
      const r = el.getBoundingClientRect();
      if (r.width < 300 || r.height < 10) continue;
      if (Math.abs(r.bottom - vh) <= 1) barTop = Math.min(barTop, Math.round(r.top));
    }
    return { vh, headerBottom, barTop };
  });

const meta = {};

async function split(name, url, prepare) {
  await page.setViewportSize({ width: W, height: STD_H });
  await page.goto(`${BASE}${url}`);
  await settle(2000);
  if (prepare) await prepare();
  const std = await measure();
  await page.screenshot({ path: join(OUT, `${name}-top.png`), clip: { x: 0, y: 0, width: W, height: std.headerBottom } });
  await page.screenshot({ path: join(OUT, `${name}-bottom.png`), clip: { x: 0, y: std.barTop, width: W, height: STD_H - std.barTop } });
  await page.screenshot({ path: join(OUT, `${name}-full.png`) });

  await page.setViewportSize({ width: W, height: TALL_H });
  await settle(1500);
  const tall = await measure();
  await page.screenshot({
    path: join(OUT, `${name}-mid.png`),
    clip: { x: 0, y: tall.headerBottom, width: W, height: tall.barTop - tall.headerBottom },
  });
  meta[name] = {
    headerH: std.headerBottom,
    bottomH: STD_H - std.barTop,
    midH: tall.barTop - tall.headerBottom,
    stdMidH: std.barTop - std.headerBottom,
  };
  console.log(name, meta[name]);
}

await split("route", `/?from=Tajrish&to=${encodeURIComponent("Tehran (Sadeghiyeh)")}`);
await split("stations", "/stations");
await split("nearby", "/nearby", async () => {
  await page.getByRole("button", { name: /استفاده از موقعیت من/ }).click({ timeout: 8000 });
  await settle(3000);
});
await split("map", "/map", async () => {
  try {
    await page.locator("button:has(svg.lucide-x)").first().click({ timeout: 3000 });
  } catch {}
  await page.waitForTimeout(1500);
});

// English route screen for the bilingual scene
await split("route-en", `/?from=Tajrish&to=${encodeURIComponent("Tehran (Sadeghiyeh)")}`, async () => {
  await page.getByRole("button", { name: /EN/ }).first().click({ timeout: 5000 });
  await settle(2000);
});

writeFileSync(join(OUT, "meta.json"), JSON.stringify(meta, null, 2));
await browser.close();
