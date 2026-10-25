import { expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { networkSafeTest as test } from "./helpers/walking";

test.beforeEach(async ({ page, request }) => {
  const response = await request.get("/api/cities/mashhad/route?from=mashhad:station:airport&to=mashhad:station:tabarsi");
  test.skip(response.status() === 404, "Mashhad is unavailable in this deployment");
  expect(response.status()).toBe(200);
  await page.addInitScript(() => {
    localStorage.setItem("route.from", "tajrish");
    localStorage.setItem("route.to", "tehran-sadeghiyeh");
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async (value: string) => {
      Object.assign(window, { copiedCityRoute: value });
    } }, configurable: true });
  });
  await page.route("**://nominatim.openstreetmap.org/**", route => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ display_name: "Mashhad point", name: "Mashhad point" }),
  }));
});

async function mapReady(page: Page) {
  await expect(page.locator('.leaflet-marker-icon[data-station-id]')).toHaveCount(36);
  return page.locator('[aria-label="Metro on real map"]');
}

test("picks map endpoints, preserves exact places through route/reload, and clears only the map", async ({ page }) => {
  await page.goto("/mashhad/map?lang=en");
  const map = await mapReady(page);
  await map.focus(); await page.keyboard.press("Enter");
  const pick = page.getByTestId("map-pick-card");
  await expect(pick).toBeVisible();
  await pick.getByRole("button", { name: "Set as origin", exact: true }).click();
  await expect(page).toHaveURL(/\/mashhad\/map\?.*from=mashhad%3Astation%3A/);
  const from = new URL(page.url()).searchParams.get("from");
  const originPoint = new URL(page.url()).searchParams.get("op");
  expect(originPoint).toBeTruthy();
  await expect(page.getByTestId("map-clear-route")).toBeVisible();
  const airport = page.locator('.leaflet-marker-icon[data-station-id="mashhad:station:airport"]');
  await airport.focus(); await page.keyboard.press("Enter");
  await page.getByTestId("map-station-card").getByRole("button", { name: "Set as Destination", exact: true }).click();
  await expect.poll(async () => Number(await page.getByTestId("city-network-map").getAttribute("data-route-station-count"))).toBeGreaterThan(1);
  await expect(page).toHaveURL(/\/mashhad\/map/);
  await page.locator("header").getByRole("link", { name: "Route", exact: true }).click();
  await expect(page.getByTestId("city-route-result")).toBeVisible();
  await expect(page.getByLabel("To", { exact: true })).toContainText("Airport");
  expect(new URL(page.url()).searchParams.get("op")).toBe(originPoint);
  await page.getByRole("button", { name: "Copy route link", exact: true }).click();
  const copied = await page.evaluate(() => (window as typeof window & { copiedCityRoute?: string }).copiedCityRoute);
  expect(new URL(copied!).pathname).toBe("/mashhad/route");
  expect(new URL(copied!).searchParams.get("from")).toBe(from);
  await page.getByRole("link", { name: "View on map", exact: true }).click();
  await expect(page).toHaveURL(/\/mashhad\/map\?/);
  await mapReady(page);
  await page.reload();
  await mapReady(page);
  expect(new URL(page.url()).searchParams.get("op")).toBe(originPoint);
  await page.getByTestId("map-clear-route").click();
  await expect(page.getByTestId("city-network-map")).toHaveAttribute("data-route-station-count", "0");
  await expect(page.getByTestId("map-place-card")).toHaveCount(0);
  const cleared = new URL(page.url());
  for (const key of ["from", "to", "op", "dp"]) expect(cleared.searchParams.has(key)).toBe(false);
  expect(await page.evaluate(() => [localStorage.getItem("route.from"), localStorage.getItem("route.to")])).toEqual(["tajrish", "tehran-sadeghiyeh"]);
});

test("supports pointer picking and accessible Persian endpoint actions on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/mashhad/map?lang=fa");
  const map = await mapReady(page); const box = (await map.boundingBox())!;
  for (const [x, y] of [[.85, .2], [.15, .75], [.5, .85]]) {
    await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
    if (await page.getByTestId("map-pick-card").isVisible()) break;
    const close = page.getByTestId("map-station-card").getByRole("button", { name: "بستن", exact: true });
    if (await close.isVisible()) await close.click();
  }
  const pick = page.getByTestId("map-pick-card");
  await expect(pick).toBeVisible();
  await expect(pick.getByRole("button", { name: "تنظیم به‌عنوان مبدأ", exact: true })).toBeVisible();
  await expect(pick.getByRole("button", { name: "تنظیم به‌عنوان مقصد", exact: true })).toBeVisible();
  const cardBox = (await pick.boundingBox())!, zoomBox = (await page.getByRole("button", { name: "Zoom in", exact: true }).boundingBox())!;
  expect(zoomBox.y + zoomBox.height).toBeLessThan(cardBox.y);
  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter(v => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(pick).toHaveCount(0); await expect(map).toBeFocused();
});

test("all-city endpoints do not create an intercity metro path", async ({ page }) => {
  await page.goto("/cities/map?from=tehran:station:basij&to=mashhad:station:basij&lang=en");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Choose two stations in the same city.");
  await expect(page.getByTestId("city-network-map")).toHaveAttribute("data-route-station-count", "0");
});


test("shows source-reported construction sections without adding boarding stations or changing passenger routes",async({page})=>{
  await page.goto("/mashhad/map?lang=en&from=mashhad:station:airport&to=mashhad:station:vakilabad");
  await mapReady(page);
  await expect(page.getByTestId("city-network-map")).toHaveAttribute("data-construction-section-count","5");
  await expect(page.getByTestId("city-network-map")).toHaveAttribute("data-route-station-count","24");
  await expect(page.locator(".metto-construction-section")).toHaveCount(5);
  await expect(page.locator(".metto-future-stop")).toHaveCount(30);
  await expect(page.locator(".metto-construction-section").first()).toHaveAttribute("stroke-dasharray","3 7");
  await expect(page.locator(".metto-construction-section").first()).toHaveAttribute("stroke-opacity","0.3");
  await expect(page.getByTestId("construction-legend")).toContainText("Lines 3 & 4");
  await page.goto("/map?lang=en");
  await expect(page.locator(".leaflet-container")).toBeVisible();
  await expect(page.locator(".metto-construction-section")).toHaveCount(0);
  await expect(page.getByTestId("construction-legend")).toHaveCount(0);
});
