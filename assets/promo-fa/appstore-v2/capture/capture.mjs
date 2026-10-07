// Captures real mobile screens of the live metto app for the app-store video.
// Run from the repo root:  node brag-output-fa-appstore-v2/capture/capture.mjs
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE_URL ?? "https://metto.ir";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "shots");
mkdirSync(OUT, { recursive: true });

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;
const browser = await chromium.launch({ executablePath });
const ctx = await browser.newContext({
  viewport: { width: 412, height: 892 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: "fa-IR",
  timezoneId: "Asia/Tehran",
  colorScheme: "light",
  geolocation: { latitude: 35.7194, longitude: 51.4091 }, // near Vali-e Asr
  permissions: ["geolocation"],
});
const page = await ctx.newPage();

async function settle(ms = 1500) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(ms);
}
async function shot(name) {
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log("saved", name);
}

// 1. Planner (empty)
await page.goto(`${BASE}/`);
await settle();
await shot("01-planner-empty");

// 2. Planner with a real route (Tajrish -> Sadeghiyeh)
await page.goto(`${BASE}/?from=Tajrish&to=${encodeURIComponent("Tehran (Sadeghiyeh)")}`);
await settle(2500);
await shot("02-route-result");
await page.evaluate(() => {
  for (const el of document.querySelectorAll("main, main *")) {
    if (el.scrollHeight > el.clientHeight + 40 && getComputedStyle(el).overflowY !== "visible") {
      el.scrollTop = 420;
    }
  }
});
await page.waitForTimeout(600);
await shot("03-route-result-scrolled");

// 3. Stations list
await page.goto(`${BASE}/stations`);
await settle();
await shot("04-stations");

// 4. Map
await page.goto(`${BASE}/map`);
await settle(3500);
await shot("05-map");

// 5. Nearby
await page.goto(`${BASE}/nearby`);
await settle(3500);
await shot("06-nearby");

await browser.close();
