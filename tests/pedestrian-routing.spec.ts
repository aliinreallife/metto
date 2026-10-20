import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { haversineKm } from "../lib/geo";
import { STATION_MAP } from "../lib/route";
import { mockWalkingApi, unavailableWalkingApi } from "./helpers/walking";

const NOW = new Date("2026-09-07T10:00:00+03:30").getTime();
const mapUrl = (offset = 0) => `/map?from=chitgar&to=chitgar&op=${(35.7265 + offset).toFixed(5)},51.24270,Origin&dp=${(35.7300 + offset).toFixed(5)},51.24900,Destination`;

async function accessible(page: Page, selector?: string) {
  const builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]);
  if (selector) builder.include(selector);
  const results = await builder.analyze();
  expect(results.violations.filter((v) => ["moderate", "serious", "critical"].includes(v.impact ?? ""))
    .map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

async function prepare(page: Page) {
  await page.clock.setFixedTime(new Date(NOW));
  await page.addInitScript(() => {
    localStorage.setItem("lang", "en");
    localStorage.setItem("metto.mapSaveNoticeSeen", "1");
  });
}

async function streetFixture(page: Page) {
  const calls: string[] = [];
  await mockWalkingApi(page, (url: string) => {
    calls.push(url);
    const params = new URL(url).searchParams;
    const a = { lat: Number(params.get("fromLat")), lng: Number(params.get("fromLng")) };
    const b = { lat: Number(params.get("toLat")), lng: Number(params.get("toLng")) };
    const distanceMeters = Math.max(1000, Math.ceil(haversineKm(a.lat, a.lng, b.lat, b.lng) * 1100));
    return { body: {
      requestKey: `${a.lat.toFixed(5)},${a.lng.toFixed(5)}>${b.lat.toFixed(5)},${b.lng.toFixed(5)}`,
      coordinates: [[a.lng, a.lat], [a.lng, a.lat + 0.001], [b.lng, a.lat + 0.001], [b.lng, b.lat]],
      distanceMeters, durationSeconds: distanceMeters / (5000 / 3600), savedAt: NOW,
    } };
  });
  return calls;
}

async function preparedOffline(page: Page) {
  const status = page.getByTestId("offline-status");
  await expect.poll(() => status.getAttribute("data-phase"), { timeout: 60_000 }).toMatch(/^(ready|offline-ready)$/);
}

async function walkingCacheCount(page: Page) {
  return page.evaluate(async () => {
    if (!(await indexedDB.databases()).some((db) => db.name === "metto-walking")) return 0;
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open("metto-walking", 1); request.onsuccess = () => resolve(request.result);
    });
    if (!db.objectStoreNames.contains("routes")) { db.close(); return 0; }
    const tx = db.transaction("routes", "readonly");
    const count = await new Promise<number>((resolve) => {
      const request = tx.objectStore("routes").count(); request.onsuccess = () => resolve(request.result);
    });
    db.close(); return count;
  });
}

test("street geometry and distances persist offline; uncached endpoints stay approximate", async ({ page, context }) => {
  await prepare(page);
  const calls = await streetFixture(page);
  await page.goto(mapUrl(), { waitUntil: "domcontentloaded" });
  const path = page.locator("path.metto-walking-path");
  await expect(path).toHaveCount(1);
  const geometry = (await path.getAttribute("d")) ?? "";
  expect((geometry.match(/[ML]/g) ?? []).length).toBeGreaterThanOrEqual(3);
  await expect(path).not.toHaveAttribute("stroke-dasharray", /\S/);
  const card = page.getByTestId("map-place-card");
  await expect(card).toContainText("1.0 km");
  await expect(card).toContainText("12 min");
  await expect(card).not.toContainText("~");
  await expect(page.getByTestId("walking-route-info")).toContainText("Solid lines");
  await accessible(page);
  await preparedOffline(page);
  const initialRequests = calls.length;
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(path).toHaveCount(1);
  await expect(card).toContainText("1.0 km");
  await expect(page.getByTestId("walking-route-info")).toContainText("previously loaded");
  expect(calls.length).toBe(initialRequests);
  await page.goto(mapUrl(0.01), { waitUntil: "domcontentloaded" });
  await expect(page.locator('[aria-label="Metro on real map"]')).toBeVisible();
  await expect(page.getByTestId("walking-route-info")).toContainText("approximate");
  await expect(path).toHaveCount(0);
  await expect(page.locator("path.metto-walking-approximation")).not.toHaveCount(0);
  expect(calls.length).toBe(initialRequests);
});

test("provider failure leaves dashed approximations and does not retry in a loop", async ({ page }) => {
  await prepare(page);
  let calls = 0;
  await mockWalkingApi(page, () => {
    calls++;
    return { status: 503, body: { error: "Unavailable" } };
  });
  await page.goto(mapUrl(), { waitUntil: "domcontentloaded" });
  await preparedOffline(page);
  await expect(page.getByTestId("walking-route-info")).toContainText("approximate");
  await expect(page.locator("path.metto-walking-path")).toHaveCount(0);
  await expect(page.getByTestId("map-place-card")).toContainText("~");
  const count = calls;
  expect(count).toBeGreaterThan(0);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.waitForTimeout(2000);
  expect(calls).toBe(count);
});

test("station access and exit paths follow their walking direction and use street times", async ({ page }) => {
  await prepare(page);
  const calls = await streetFixture(page);
  const origin = STATION_MAP.get("tajrish")!.location;
  const dest = STATION_MAP.get("shahid-beheshti")!.location;
  const from = { lat: Number((origin.lat + 0.001).toFixed(5)), lng: origin.lng };
  const to = { lat: Number((dest.lat + 0.001).toFixed(5)), lng: dest.lng };
  await page.goto(`/map?from=tajrish&to=shahid-beheshti&op=${from.lat},${from.lng},Origin&dp=${to.lat},${to.lng},Destination`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("path.metto-walking-path")).toHaveCount(2);
  const cards = page.getByTestId("map-place-card");
  await expect(cards).toHaveCount(2);
  for (const card of await cards.all()) {
    await expect(card).toContainText("1.0 km");
    await expect(card).toContainText("12 min");
    await expect(card).not.toContainText("~");
  }
  await expect(page.getByTestId("walk-suggest")).toHaveCount(0);
  expect(calls.some((url) => {
    const params = new URL(url).searchParams;
    return params.get("fromLat") === from.lat.toFixed(5) && params.get("toLat") === origin.lat.toFixed(5);
  })).toBe(true);
  expect(calls.some((url) => {
    const params = new URL(url).searchParams;
    return params.get("fromLat") === dest.lat.toFixed(5) && params.get("toLat") === to.lat.toFixed(5);
  })).toBe(true);
});

test("saved walking geometry remains bounded after new routes are loaded", async ({ page }) => {
  await prepare(page);
  await streetFixture(page);
  await page.goto(mapUrl(), { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("walking-route-info")).toContainText("Solid lines");
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open("metto-walking", 1);
      req.onsuccess = () => resolve(req.result);
    });
    const tx = db.transaction("routes", "readwrite");
    const store = tx.objectStore("routes");
    const all = store.getAll();
    all.onsuccess = () => {
      const base = all.result[0].route;
      for (let i = 0; i < 25; i++) store.put({ key: `old-${i}`, route: { ...base, savedAt: base.savedAt - 100_000 - i } }, `old-${i}`);
    };
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); });
    db.close();
  });
  await page.goto(mapUrl(0.001), { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("walking-route-info")).toContainText("Solid lines");
  const count = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open("metto-walking", 1); req.onsuccess = () => resolve(req.result);
    });
    const tx = db.transaction("routes", "readonly");
    const count = await new Promise<number>((resolve) => {
      const request = tx.objectStore("routes").count(); request.onsuccess = () => resolve(request.result);
    });
    db.close(); return count;
  });
  expect(count).toBeLessThanOrEqual(20);
});

for (const lang of ["en", "fa"] as const) {
  test(`Now routes update automatically without reloading (${lang})`, async ({ page }) => {
    await page.clock.install({ time: NOW });
    await page.addInitScript((language) => localStorage.setItem("lang", language), lang);
    await unavailableWalkingApi(page);
    await page.goto("/route?from=tajrish&to=shahid-beheshti", { waitUntil: "domcontentloaded" });
    const summary = page.getByTestId("route-summary-stats");
    await expect(summary).toBeVisible();
    const oldStart = Number(await summary.getAttribute("data-route-start"));
    await page.clock.fastForward(75_000);
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect.poll(async () => Number(await summary.getAttribute("data-route-start"))).toBeGreaterThan(oldStart);
    await expect(page.getByTestId("route-stale-notice")).toHaveCount(0);
    await expect(page.getByTestId("departure-option")).toHaveCount(0);
  });
}

test("map route automatically updates without manual reload", async ({ page }) => {
  await page.clock.install({ time: NOW });
  await page.addInitScript(() => { localStorage.setItem("lang", "en"); localStorage.setItem("metto.mapSaveNoticeSeen", "1"); });
  await unavailableWalkingApi(page);
  await page.goto("/map?from=tajrish&to=shahid-beheshti", { waitUntil: "domcontentloaded" });
  await preparedOffline(page);
  const state = page.getByTestId("map-route-state");
  const start = Number(await state.getAttribute("data-route-start"));
  expect(start).toBeGreaterThan(0);
  await page.clock.fastForward(75_000);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect.poll(async () => Number(await state.getAttribute("data-route-start"))).toBeGreaterThan(start);
  await expect(page.getByTestId("route-stale-notice")).toHaveCount(0);
});
