import { expect } from "@playwright/test";
import { networkSafeTest as test } from "./helpers/walking";
import { deploymentCityCounts } from "./helpers/city-stations";

const el = "tabriz:station:el-goli";
const noor = "tabriz:station:noor";

test.beforeEach(async ({ page }) => {
  test.skip(deploymentCityCounts().cities < 4, "Tabriz is unavailable on this deployment");
  await page.clock.setFixedTime(new Date("2026-11-03T06:30:00Z")); // 10:00 in Iran.
});

test("Tabriz public route inherits Tehran's timed journey with an explicit timetable warning", async ({ page }) => {
  const response = await page.goto(`/tabriz/route?from=${el}&to=${noor}&lang=en`);
  expect(response?.status()).toBe(200);
  await expect(page.getByTestId("tabriz-timetable-notice")).toContainText("last trains");
  await expect(page.getByTestId("city-preview-notice")).toHaveCount(0);
  const journey = page.getByTestId("tabriz-journey");
  await expect(journey).toBeVisible();
  await expect(journey.getByTestId("route-summary-stats")).toContainText(/18\s*stops/);
  await expect(journey.getByTestId("route-summary-stats")).toContainText("10:45");
  await expect(journey.locator("ol")).toContainText("10:10");
  await expect(journey.locator("ol")).toContainText("Then:");
  await expect(journey.locator("ol")).toContainText("10:25");
  await expect(page.getByTestId("travel-time-card")).toBeVisible();
  await expect(page.getByTestId("tabriz-no-service")).toHaveCount(0);
});

test("Tabriz arrive-by gets the live first-station countdown and suppresses it for Now", async ({ page }) => {
  const at = "2026-11-03T07:15:00.000Z";
  await page.goto(`/tabriz/route?from=${el}&to=${noor}&timeMode=arrive&at=${encodeURIComponent(at)}&lang=en`);
  const banner = page.getByTestId("plan-banner");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("El Goli");
  await expect(banner).toContainText(/sec/);
  await expect(page.getByTestId("tabriz-journey").locator("ol")).toContainText("10:10");
  await page.getByTestId("travel-time-card").locator("fieldset").getByText("Leave now", { exact: true }).click();
  await expect(page.getByTestId("plan-banner")).toHaveCount(0);
});

test("Tabriz respects published Friday departures and no-service after last sourced train", async ({ page }) => {
  await page.goto(`/tabriz/route?from=${el}&to=${noor}&timeMode=depart&at=2026-11-06T03:59:00.000Z&lang=en`);
  await expect(page.getByTestId("tabriz-journey").locator("ol")).toContainText("07:30");
  await expect(page.getByTestId("tabriz-journey").locator("ol")).toContainText("08:05");
  await page.goto(`/tabriz/route?from=${el}&to=${noor}&timeMode=depart&at=2026-11-03T16:41:00.000Z&lang=en`);
  await expect(page.getByTestId("tabriz-no-service")).toBeVisible();
  await expect(page.getByTestId("route-summary-stats")).toHaveCount(0);
});

test("Tabriz same-station behavior, map and all stations are city-scoped", async ({ page }) => {
  await page.goto(`/tabriz/route?from=${el}&to=${el}&lang=en`);
  await expect(page.getByTestId("same-station-notice")).toContainText("Origin and destination are the same.");
  await expect(page.getByTestId("tabriz-journey")).toHaveCount(0);

  await page.goto("/tabriz/map?lang=en");
  await expect(page.getByTestId("city-network-map")).toHaveAttribute("data-station-count", "18");
  await expect(page.locator(".city-station-hit")).toHaveCount(18);
  await expect(page.locator(".metto-source-track")).toHaveCount(17);
  await page.locator(`.city-station-hit[data-station-id="${el}"]`).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("map-station-card")).toContainText("El Goli");
  await expect(page.getByTestId("tabriz-times")).toBeVisible();
});

test("Tabriz station cards have source-backed day/direction timesheets", async ({ page }) => {
  await page.goto("/tabriz/stations?lang=en");
  const first = page.locator(`li[data-station-id="${el}"]`);
  await expect(first).toBeVisible();
  await expect(first.getByTestId("tabriz-station-departures")).toBeVisible();
  await first.getByRole("button", { name: "Timetable", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "El Goli" });
  await expect(sheet.getByTestId("tabriz-station-timesheet")).toBeVisible();
  await expect(sheet).toContainText("05:55");
  await sheet.getByRole("button", { name: /Friday \/ holidays/ }).click();
  await expect(sheet).toContainText("07:30");
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
});
