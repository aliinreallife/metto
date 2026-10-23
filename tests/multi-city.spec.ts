import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { networkSafeTest as test } from "./helpers/walking";

test.beforeEach(async ({ request }) => {
  const response = await request.get("/api/cities/mashhad/route?from=mashhad:station:airport&to=mashhad:station:tabarsi");
  test.skip(response.status() === 404, "Mashhad is unavailable in this deployment");
  expect(response.status()).toBe(200);
});

test("landing counts match both cities and each city has its own landing", async ({ page }) => {
  await page.goto("/?lang=en");
  await expect(page.getByText("187 stations · 9 lines", { exact: true })).toBeVisible();
  await page.getByTestId("landing-city-cards").getByRole("link").filter({ hasText: "Mashhad" }).click();
  await expect(page).toHaveURL(/\/mashhad\?lang=en/);
  await expect(page.getByText("36 stations · 2 lines", { exact: true })).toBeVisible();
  await page.goto("/tehran?lang=en");
  await expect(page.getByText("151 stations · 7 lines", { exact: true })).toBeVisible();
});

test("switching the normal map shows Mashhad stations and links map selections into routing", async ({ page }) => {
  await page.goto("/map?lang=en");
  await page.getByRole("combobox", { name: "Choose city" }).selectOption("mashhad");
  await expect(page).toHaveURL(/\/mashhad\/map\?lang=en/);
  await expect(page.getByTestId("city-network-map")).toHaveAttribute("data-station-count", "36");
  await expect(page.locator('.leaflet-marker-icon[data-station-id]')).toHaveCount(36);
  const station = page.locator('.leaflet-marker-icon[data-station-id="mashhad:station:shariati"]');
  await station.focus(); await page.keyboard.press("Enter");
  await page.getByRole("main").getByRole("link", { name: "From", exact: true }).click();
  await expect(page).toHaveURL(/\/mashhad\/route/);
  await page.getByLabel("To", { exact: true }).selectOption("mashhad:station:airport");
  const result = page.getByTestId("city-route-result");
  await expect(result).toBeVisible();
  await expect(result).not.toContainText(/arrival|minutes|estimated/i);
  await result.getByRole("link", { name: "Map", exact: true }).click();
  await expect(page.getByTestId("city-network-map")).toHaveAttribute("data-route-station-count", "8");
});

test("all-city search keeps stations with the same name separate and routes to the correct city", async ({ page }) => {
  await page.goto("/cities?lang=en");
  await page.getByLabel("Search stations").fill("Basij");
  const rows = page.locator('li[data-station-id]');
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: "Tehran" })).toHaveCount(1);
  await expect(rows.filter({ hasText: "Mashhad" })).toHaveCount(1);
  await rows.filter({ hasText: "Mashhad" }).getByRole("link", { name: "Route here" }).click();
  await expect(page).toHaveURL(/\/mashhad\/route\?/);
  await expect(page.getByLabel("To", { exact: true })).toHaveValue("mashhad:station:basij");
});

test("all-city routes reject cross-city pairs and preserve namespaced duplicate choices", async ({ page }) => {
  await page.goto("/cities/route?lang=en");
  await page.getByLabel("From", { exact: true }).selectOption("tehran:station:basij");
  await page.getByLabel("To", { exact: true }).selectOption("mashhad:station:basij");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Choose two stations in the same city.");
  await expect(page.getByRole("main").getByRole("link", { name: "Find route", exact: true })).toHaveCount(0);
  await page.getByLabel("From", { exact: true }).selectOption("mashhad:station:airport");
  await page.getByRole("main").getByRole("link", { name: "Find route", exact: true }).click();
  await expect(page).toHaveURL(/\/mashhad\/route\?/);
  await expect(page.getByTestId("city-route-result")).toBeVisible();
});

test("Tehran map links from the combined directory retain legacy station IDs", async ({ page }) => {
  await page.goto("/cities?lang=en");
  await page.getByLabel("Search stations").fill("Basij");
  await page.locator('li[data-city="tehran"]').getByRole("link", { name: "Map", exact: true }).click();
  await expect(page).toHaveURL(/\/tehran\/map\?station=basij&lang=en/);
  await expect(page.getByTestId("map-station-card")).toBeVisible();
  await expect(page.getByTestId("map-station-card")).toContainText("Basij");
});

test("city landings remain visible to returning users while the root restores their chosen city", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("route.seen", "1");
    localStorage.setItem("city.last", "mashhad");
  });
  await page.goto("/tehran?lang=en");
  await expect(page.getByText("151 stations · 7 lines", { exact: true })).toBeVisible();
  await page.goto("/mashhad?lang=en");
  await expect(page.getByText("36 stations · 2 lines", { exact: true })).toBeVisible();
  await page.goto("/?lang=en");
  await expect(page).toHaveURL(/\/mashhad\/route\?lang=en/);
  await expect(page.getByTestId("city-path-preview")).toBeVisible();
});

test("the all-city map contains distinct markers and no missing stations", async ({ page }) => {
  await page.goto("/cities/map?lang=en");
  await expect(page.getByTestId("city-network-map")).toHaveAttribute("data-station-count", "187");
  await expect(page.locator('.leaflet-marker-icon[data-station-id]')).toHaveCount(187);
  await expect(page.locator('.leaflet-marker-icon[data-station-id="tehran:station:basij"]')).toHaveAttribute("aria-label", "Basij · Tehran");
  await expect(page.locator('.leaflet-marker-icon[data-station-id="mashhad:station:basij"]')).toHaveAttribute("aria-label", "Basij · Mashhad");
});

test("city switching drops foreign endpoints and Tehran timing options", async ({ page }) => {
  await page.goto("/map?from=tajrish&to=tehran-sadeghiyeh&timeMode=arrive&lang=en");
  await page.getByRole("combobox", { name: "Choose city" }).selectOption("mashhad");
  await expect(page).toHaveURL(/\/mashhad\/map\?lang=en/);
  const url = new URL(page.url());
  expect(url.searchParams.has("from")).toBe(false);
  expect(url.searchParams.has("to")).toBe(false);
  expect(url.searchParams.has("timeMode")).toBe(false);
  await expect(page.getByTestId("city-network-map")).toHaveAttribute("data-route-station-count", "0");
});

test("Persian city pages stay usable on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/mashhad/stations?lang=fa");
  await expect(page.getByRole("combobox", { name: "انتخاب شهر" })).toHaveValue("mashhad");
  await page.getByLabel("جستجوی ایستگاه…", { exact: true }).fill("بسیج");
  await expect(page.locator('li[data-station-id]')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter(v => v.impact === "serious" || v.impact === "critical")).toEqual([]);
});
