// Fourth pass: real map zoom frames + map with a highlighted route.
// Run from the repo root:  node brag-output-fa-appstore-v2/capture/capture4.mjs
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE_URL ?? "https://metto.ir";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "shots");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({
  viewport: { width: 412, height: 892 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: "fa-IR",
  timezoneId: "Asia/Tehran",
  colorScheme: "light",
});
const page = await ctx.newPage();
const settle = async (ms) => {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(ms);
};
async function map(name, query) {
  await page.goto(`${BASE}/map${query}`);
  await settle(3500);
  try {
    await page.locator("button:has(svg.lucide-x)").first().click({ timeout: 2500 });
  } catch {}
  await page.waitForTimeout(1800);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log("saved", name);
}

await map("map-z11", "?map=35.7000,51.4000,11");
await map("map-z12", "?map=35.7000,51.4000,12");
await map("map-z13", "?map=35.7000,51.4000,13");
await map("map-route", `?from=Tajrish&to=${encodeURIComponent("Tehran (Sadeghiyeh)")}`);

await browser.close();
