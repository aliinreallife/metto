import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { deploymentCityCounts, pickCityStation } from "./helpers/city-stations";
import { networkSafeTest as test } from "./helpers/walking";

test.beforeEach(async ({ request }) => {
  const response = await request.get("/api/cities/mashhad/route?from=mashhad:station:airport&to=mashhad:station:tabarsi");
  test.skip(response.status() === 404, "Mashhad is unavailable in this deployment");
  expect(response.status()).toBe(200);
});

test("landing counts match available cities and each city has its own landing", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/?lang=en");
  await expect(page.getByText(`${deploymentCityCounts().stations} stations · ${deploymentCityCounts().lines} lines`, { exact: true })).toBeVisible();
  await page.getByTestId("landing-city-links").getByRole("link").filter({ hasText: "Mashhad" }).click();
  await expect(page).toHaveURL(/\/mashhad\?lang=en/);
  await expect(page.getByText("36 stations · 2 lines", { exact: true })).toBeVisible();
  const mashhadCard=page.getByTestId("mashhad-landing-route");
  await expect(mashhadCard).toContainText("23 stops");
  await expect(mashhadCard).toContainText("No line changes");
  await expect(mashhadCard.getByRole("link")).toHaveAttribute("href",/\/mashhad\/route\?/);
  await expect(page.getByText(/Train times aren't available|Help us add train times/)).toHaveCount(0);
  await mashhadCard.getByRole("link").click();
  await expect(page.getByTestId("city-route-result")).toBeVisible();
  await expect(page.getByLabel("From",{exact:true})).toContainText("VakilAbad");
  await page.goto("/tehran?lang=en");
  await expect(page.getByText("151 stations · 7 lines", { exact: true })).toBeVisible();
  expect(errors.filter(message => /hydration/i.test(message))).toEqual([]);
});

test("switching the normal map shows Mashhad stations and links map selections into routing", async ({ page }) => {
  await page.goto("/map?lang=en");
  await page.getByRole("combobox", { name: "Choose city" }).click();
  await page.getByRole("option", { name: "Mashhad", exact: true }).click();
  await expect(page).toHaveURL(/\/mashhad\/map\?lang=en/);
  await expect(page.getByTestId("city-network-map")).toHaveAttribute("data-station-count", "36");
  await expect(page.locator('.leaflet-marker-icon[data-station-id]')).toHaveCount(36);
  const station = page.locator('.leaflet-marker-icon[data-station-id="mashhad:station:shariati"]');
  await station.focus(); await page.keyboard.press("Enter");
  const selectedAudit = await new AxeBuilder({ page }).analyze();
  expect(selectedAudit.violations.filter(v => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  await page.getByRole("main").getByRole("button", { name: "Set as origin", exact: true }).click();
  await expect(page).toHaveURL(/\/mashhad\/map/);
  await page.locator("header").getByRole("link", { name: "Route", exact: true }).click();
  await expect(page).toHaveURL(/\/mashhad\/route/);
  await pickCityStation(page, "To", "Airport");
  const result = page.getByTestId("city-route-result");
  await expect(result).toBeVisible();
  await expect(result.getByTestId("route-summary-stats")).toContainText("8 stops");
  await expect(result.getByTestId("route-summary-stats")).toContainText("No line changes");
  await expect(result.getByTestId("route-summary-stats")).not.toContainText(/—|travel time|arrival/i);
  await expect(result).not.toContainText(/\d{1,2}:\d{2}|\d+ minutes|estimated/i);
  await page.locator("header").getByRole("link", { name: "Map", exact: true }).click();
  await expect(page.getByTestId("city-network-map")).toHaveAttribute("data-route-station-count", "8");
});

test("all-city search keeps stations with the same name separate and routes to the correct city", async ({ page }) => {
  await page.goto("/cities?lang=en");
  await page.getByLabel("Search stations").fill("Basij");
  const rows = page.locator('li[data-station-id]');
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: "Tehran" })).toHaveCount(1);
  await expect(rows.filter({ hasText: "Mashhad" })).toHaveCount(1);
  await rows.filter({ hasText: "Mashhad" }).getByRole("button", { name: "Set as Destination" }).click();
  await expect(page).toHaveURL(/\/mashhad\/route\?/);
  await expect(page.getByLabel("To", { exact: true })).toContainText("Basij");
  await expect(page).toHaveURL(/to=mashhad%3Astation%3Abasij/);
});

test("all-city routes reject cross-city pairs and preserve namespaced duplicate choices", async ({ page }) => {
  await page.goto("/cities/route?lang=en");
  await pickCityStation(page, "From", "Basij", "Tehran");
  await pickCityStation(page, "To", "Basij", "Mashhad");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Choose two stations in the same city.");
  await expect(page.getByRole("main").getByRole("link", { name: "Find route", exact: true })).toHaveCount(0);
  await pickCityStation(page, "From", "Airport", "Mashhad");
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
  await expect(page.getByTestId("city-network-map")).toHaveAttribute("data-station-count", String(deploymentCityCounts().stations));
  await expect(page.locator('.leaflet-marker-icon[data-station-id]')).toHaveCount(deploymentCityCounts().stations);
  await expect(page.locator('.leaflet-marker-icon[data-station-id="tehran:station:basij"]')).toHaveAttribute("aria-label", "Basij · Tehran");
  await expect(page.locator('.leaflet-marker-icon[data-station-id="mashhad:station:basij"]')).toHaveAttribute("aria-label", "Basij · Mashhad");
  await page.locator('.leaflet-marker-icon[data-station-id="mashhad:station:basij"]').focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("map-station-card")).toContainText("Basij · Mashhad");
});

test("city switching drops foreign endpoints and Tehran timing options", async ({ page }) => {
  await page.goto("/map?from=tajrish&to=tehran-sadeghiyeh&timeMode=arrive&lang=en");
  await page.getByRole("combobox", { name: "Choose city" }).click();
  await page.getByRole("option", { name: "Mashhad", exact: true }).click();
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
  await expect(page.getByRole("combobox", { name: "انتخاب شهر" })).toContainText("مشهد");
  const fullAudit = await new AxeBuilder({ page }).analyze();
  expect(fullAudit.violations.filter(v => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  await page.getByLabel("جستجوی ایستگاه…", { exact: true }).fill("بسیج");
  await expect(page.locator('li[data-station-id]')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter(v => v.impact === "serious" || v.impact === "critical")).toEqual([]);
});


test("city selector supports keyboard selection, Escape and outside dismissal", async ({ page }) => {
  await page.goto("/map?lang=en");
  const picker = page.getByRole("combobox", { name: "Choose city" });
  await picker.focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("option", { name: "Tehran", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Escape");
  await expect(picker).toBeFocused();
  await expect(picker).toHaveAttribute("aria-expanded", "false");
  await picker.click();
  await page.getByRole("main").click({ position: { x: 5, y: 5 } });
  await expect(picker).toHaveAttribute("aria-expanded", "false");
  await picker.focus(); await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/mashhad\/map\?lang=en/);
  await expect(page.getByRole("combobox", { name: "Choose city" })).toContainText("Mashhad");
});


test("Mashhad Nearby shares the location picker and keeps results in its city", async ({ page }) => {
  await page.goto("/mashhad/nearby?lang=en");
  await expect(page.getByRole("heading", { name: "Your location", exact: true })).toBeVisible();
  await expect(page.locator("li[data-station-id]")).toHaveCount(0);
  await page.getByRole("main").locator('button[aria-haspopup="listbox"]').click();
  await page.locator('input[role="combobox"]').fill("Airport");
  await page.getByRole("listbox").getByRole("option").first().click();
  await expect(page.locator("li[data-station-id]")).toHaveCount(15);
  await expect(page.locator("li[data-station-id]").first()).toHaveAttribute("data-station-id", "mashhad:station:airport");
  await expect(page.locator('li[data-city="tehran"]')).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("button", { name: "Timetable" })).toHaveCount(0);
});


test("All-cities Stations filters cities alongside search and line filters", async ({ page }) => {
  await page.goto("/cities?lang=en");
  const cities = page.getByRole("group", { name: "Choose city", exact: true });
  const rows = page.locator("li[data-station-id]");
  await expect(rows).toHaveCount(deploymentCityCounts().stations);
  await cities.getByRole("button", { name: "Mashhad", exact: true }).click();
  await expect(rows).toHaveCount(36);
  await expect(page.getByRole("combobox", { name: "Choose city" })).toContainText("All cities");
  await expect(page.locator('li[data-city="tehran"]')).toHaveCount(0);
  await page.getByRole("searchbox", { name: /Search stations/ }).fill("Basij");
  await expect(rows).toHaveCount(1);
  await expect(rows).toHaveAttribute("data-city", "mashhad");
  await page.getByRole("searchbox", { name: /Search stations/ }).fill("");
  await page.getByRole("button", { name: "Mashhad · Line 2", exact: true }).click();
  await expect(rows).toHaveCount(13);
  await cities.getByRole("button", { name: "Tehran", exact: true }).click();
  await expect(rows).toHaveCount(151);
  await expect(page.getByRole("button", { name: "Mashhad · Line 2", exact: true })).toHaveCount(0);
  await cities.getByRole("button", { name: "All cities", exact: true }).click();
  await expect(rows).toHaveCount(deploymentCityCounts().stations);
});

test("Mashhad source amenities are visible and remain explicitly unverified", async ({ page }) => {
  await page.goto("/mashhad/stations?lang=en");
  await page.getByRole("searchbox", { name: /Search stations/ }).fill("VakilAbad");
  const station = page.locator('li[data-station-id="mashhad:station:vakilabad"]');
  await expect(station).toContainText("Amenities reported by the source · unverified");
  await expect(station.getByText("Elevator", { exact: true })).toBeVisible();
  await expect(station.getByText("Restroom", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Free Wi-Fi", exact: true }).click();
  await expect(page.locator("li[data-station-id]")).toHaveCount(0);
});
