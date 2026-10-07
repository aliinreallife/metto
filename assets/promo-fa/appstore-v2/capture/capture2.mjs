// Second pass: richer real states (schedule dialog, nearby result, map, EN UI, app icon).
// Run from the repo root:  node brag-output-fa-appstore-v2/capture/capture2.mjs
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE_URL ?? "https://metto.ir";
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "shots");
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
  geolocation: { latitude: 35.7194, longitude: 51.4091 },
  permissions: ["geolocation"],
});
const page = await ctx.newPage();
const settle = async (ms = 1500) => {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(ms);
};
const shot = async (name) => {
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log("saved", name);
};

// App icon from the live site
for (const f of ["icon.svg", "apple-icon.png"]) {
  const r = await ctx.request.get(`${BASE}/${f}`);
  if (r.ok()) {
    writeFileSync(join(OUT, f), await r.body());
    console.log("saved", f);
  }
}

// Station schedule dialog
await page.goto(`${BASE}/stations`);
await settle();
try {
  await page.getByRole("button", { name: "برنامه" }).first().click({ timeout: 8000 });
  await settle(1200);
  await shot("07-schedule-dialog");
} catch (e) {
  console.log("schedule dialog failed:", e.message.split("\n")[0]);
}

// Map with the offline notice dismissed
await page.goto(`${BASE}/map`);
await settle(3000);
try {
  await page.locator("button:has(svg.lucide-x)").first().click({ timeout: 3000 });
} catch {}
await page.waitForTimeout(1500);
await shot("08-map-clean");

// Nearby with a real result
await page.goto(`${BASE}/nearby`);
await settle();
try {
  await page.getByRole("button", { name: /استفاده از موقعیت من/ }).click({ timeout: 8000 });
  await settle(3500);
  await shot("09-nearby-result");
} catch (e) {
  console.log("nearby failed:", e.message.split("\n")[0]);
}

// English UI of the planner
await page.goto(`${BASE}/?from=Tajrish&to=${encodeURIComponent("Tehran (Sadeghiyeh)")}`);
await settle(2000);
try {
  await page.getByRole("button", { name: /EN/ }).first().click({ timeout: 5000 });
  await settle(2000);
  await shot("10-route-en");
} catch (e) {
  console.log("EN toggle failed:", e.message.split("\n")[0]);
}

await browser.close();
