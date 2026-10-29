import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { networkSafeTest as test } from "./helpers/walking";
import { deploymentCityCounts } from "./helpers/city-stations";

const qods = "isfahan:station:qods";
const end = "isfahan:station:defa-e-moghaddas";

test.beforeEach(async ({ page }) => {
  test.skip(deploymentCityCounts().cities < 3, "Candidate cities are unavailable in production builds");
  const response = await page.goto("/isfahan/map?lang=en");
  expect(response?.status()).toBe(200);
  await expect(page.getByTestId("city-preview-notice")).toBeVisible();
});

test("preview cities use normal city switching, map selection and route tabs without changing saved Tehran trips", async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem("route.from", "tajrish");
    localStorage.setItem("route.to", "tehran-sadeghiyeh");
  });
  await page.goto("/map?from=tajrish&to=tehran-sadeghiyeh&timeMode=arrive&lang=en");
  await page.getByRole("combobox", { name: "Choose city" }).click();
  await page.getByRole("option", { name: "Isfahan Preview", exact: true }).click();
  await expect(page).toHaveURL(/\/isfahan\/map\?lang=en$/);
  await expect(page.getByTestId("city-preview-notice")).toContainText("Daneshgah and Kargar");
  await expect(page.locator(".city-station-hit")).toHaveCount(20);
  await expect(page.locator(".metto-source-track")).toHaveCount(19);
  const start = page.locator(`.city-station-hit[data-station-id="${qods}"]`);
  await start.focus(); await page.keyboard.press("Enter");
  await expect(page.getByTestId("map-station-card")).toContainText("Boarding not verified");
  await page.getByRole("button", { name: "Set as origin", exact: true }).click();
  await page.locator(`.city-station-hit[data-station-id="${end}"]`).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Set as Destination", exact: true }).click();
  expect(new URL(page.url()).searchParams.has("op")).toBe(false);
  expect(new URL(page.url()).searchParams.has("dp")).toBe(false);
  await expect(page.getByTestId("city-network-map")).toHaveAttribute("data-route-station-count", "20");
  await page.locator("header").getByRole("link", { name: "Route", exact: true }).click();
  await expect(page).toHaveURL(/\/isfahan\/route\?/);
  await expect(page.getByLabel("From", { exact: true })).toContainText("Qods");
  await expect(page.getByLabel("To", { exact: true })).toContainText("Defa-e Moghaddas");
  await page.getByLabel("From", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Naqsh-e Jahan Square", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Iran Mall|Nader Shah Tomb/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("city-route-result")).toContainText("20 stops");
  await expect(page.getByTestId("city-route-result")).not.toContainText(/\d{1,2}:\d{2}|travel time|arrival/i);
  await page.getByRole("button", { name: "Swap", exact: true }).click();
  await expect(page.getByLabel("From", { exact: true })).toContainText("Defa-e Moghaddas");
  await page.locator("header").getByRole("link", { name: "Map", exact: true }).click();
  await expect(page.getByTestId("city-network-map")).toHaveAttribute("data-route-station-count", "20");
  await page.reload();
  await expect(page.getByTestId("city-network-map")).toHaveAttribute("data-route-station-count", "20");
  expect(await page.evaluate(() => [localStorage.getItem("route.from"), localStorage.getItem("route.to")])).toEqual(["tajrish", "tehran-sadeghiyeh"]);
});

test("preview cities join landings and combined directories while keeping duplicate names and foreign endpoints separate", async ({ page }) => {
  await page.goto("/isfahan?lang=en");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.getByText("20 stations · 1 line", { exact: true })).toBeVisible();
  await expect(page.getByTestId("isfahan-landing-route")).toContainText("Qods");
  await expect(page.getByTestId("isfahan-landing-route")).toContainText("Defa-e Moghaddas");
  await page.goto("/cities?lang=fa");
  await page.getByRole("searchbox").fill("امام حسین");
  await expect(page.locator('li[data-city="tehran"]')).toHaveCount(1);
  await expect(page.locator('li[data-city="isfahan"]')).toHaveCount(1);
  await page.getByRole("searchbox").fill("");
  await page.getByRole("group", { name: "انتخاب شهر", exact: true }).getByRole("button", { name: "اصفهان", exact: true }).click();
  await expect(page.locator("li[data-station-id]")).toHaveCount(20);
  await expect(page.getByTestId("city-preview-notice")).toBeVisible();
  await page.goto("/isfahan/stations?lang=en");
  await page.getByRole("searchbox").fill("Daneshgah");
  await expect(page.locator("li[data-station-id]")).toContainText("Boarding status disputed");
  await expect(page.getByRole("button", { name: "Under construction", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Restroom", exact: true })).toHaveCount(0);
  await page.locator("li[data-station-id]").getByRole("button", { name: "Set as Destination", exact: true }).click();
  await expect(page).toHaveURL(/\/isfahan\/route\?/);
  await expect(page.getByLabel("To", { exact: true })).toContainText("Daneshgah");
  await page.goto(`/cities/route?from=${qods}&to=mashhad:station:airport&lang=en`);
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Choose two stations in the same city.");
  await page.goto("/isfahan/route?from=mashhad:station:airport&lang=en");
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  await expect(page.getByTestId("city-route-result")).toHaveCount(0);
});

test("the normal preview tabs remain accessible on a narrow Persian screen", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/isfahan/stations?lang=fa");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("combobox", { name: "انتخاب شهر" })).toContainText("اصفهان");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter(v => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  await page.goto("/isfahan/nearby?lang=en");
  await page.getByRole("main").locator('button[aria-haspopup="listbox"]').click();
  await page.locator('input[role="combobox"]').fill("Qods");
  await page.getByRole("option").first().click();
  await expect(page.locator('li[data-city="isfahan"]')).toHaveCount(15);
  await expect(page.locator('li[data-city="tehran"]')).toHaveCount(0);
});
