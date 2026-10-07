// Prints element rects (CSS px, relative to the scrollable middle area) so highlight
// boxes in the composition line up with the real UI.
// Run from the repo root:  node brag-output-fa-appstore-v2/capture/measure.mjs
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "https://metto.ir";
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({
  viewport: { width: 412, height: 1900 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
  locale: "fa-IR",
  timezoneId: "Asia/Tehran",
  geolocation: { latitude: 35.7194, longitude: 51.4091 },
  permissions: ["geolocation"],
});
const page = await ctx.newPage();
const settle = async (ms = 2000) => {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(ms);
};

async function rects(label, text, ups = [1, 2, 3, 4], nth = 0) {
  const out = await page.evaluate(
    ({ text, ups, nth }) => {
      const hb = document.querySelector("header").getBoundingClientRect().bottom;
      const all = [...document.querySelectorAll("body *")].filter(
        (el) => el.children.length === 0 && el.textContent.trim() === text,
      );
      const el = all[nth];
      if (!el) return null;
      return ups.map((u) => {
        let n = el;
        for (let i = 0; i < u; i++) n = n.parentElement;
        const r = n.getBoundingClientRect();
        return { up: u, tag: n.tagName, x: Math.round(r.left), y: Math.round(r.top - hb), w: Math.round(r.width), h: Math.round(r.height) };
      });
    },
    { text, ups, nth },
  );
  console.log(label, JSON.stringify(out));
}

await page.goto(`${BASE}/?from=Tajrish&to=${encodeURIComponent("Tehran (Sadeghiyeh)")}`);
await settle();
await rects("route.stats(انتظار + سفر)", "انتظار + سفر", [1, 2, 3, 4]);
await rects("route.transfer(تعویض خط)", "۱ تعویض خط", [0, 1, 2]);
await rects("route.firstCardTime", "خط ۱", [1, 2, 3, 4, 5, 6]);
await rects("route.copyLink", "کپی لینک مسیر", [1, 2, 3]);

await page.goto(`${BASE}/stations`);
await settle();
await rects("stations.nextDeparture(حرکت بعدی)", "حرکت بعدی", [1, 2, 3, 4], 0);
await rects("stations.schedule(برنامه)", "برنامه", [1, 2, 3], 0);
await rects("stations.count", "۱۵۱ ایستگاه", [0, 1]);
await rects("stations.firstName", "آزادگان", [1, 2, 3, 4, 5, 6]);

await page.goto(`${BASE}/nearby`);
await settle();
await page.getByRole("button", { name: /استفاده از موقعیت من/ }).click();
await settle(3000);
await rects("nearby.chips(نزدیک‌ترین ایستگاه‌ها)", "نزدیک‌ترین ایستگاه‌ها", [1, 2, 3]);
await rects("nearby.amenity(نمازخانه)", "نمازخانه", [1, 2, 3, 4], 0);
await rects("nearby.firstName(میدان جهاد)", "میدان جهاد", [1, 2, 3, 4, 5, 6]);
await rects("nearby.dist(۱۵۶ متر)", "۱۵۶ متر", [0, 1, 2]);

await browser.close();
