import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { networkSafeTest as test } from "./helpers/walking";
import { deploymentCityCounts } from "./helpers/city-stations";

const qods = "isfahan:station:qods";
const end = "isfahan:station:defa-e-moghaddas";

test.beforeEach(async ({ page }) => {
  test.skip(deploymentCityCounts().cities < 3, "Candidate cities are unavailable in production builds");
  await page.clock.setFixedTime(new Date("2026-11-03T06:30:00Z"));
  const response = await page.goto("/isfahan/map?lang=en");
  expect(response?.status()).toBe(200);
  await expect(page.getByTestId("city-preview-notice")).toHaveCount(0);
});

test("preview cities use normal city switching, map selection and route tabs without changing saved Tehran trips", async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem("route.from", "tajrish");
    localStorage.setItem("route.to", "tehran-sadeghiyeh");
  });
  await page.goto("/map?from=tajrish&to=tehran-sadeghiyeh&timeMode=arrive&lang=en");
  await page.getByRole("combobox", { name: "Choose city" }).click();
  await page.getByRole("option", { name: "Isfahan", exact: true }).click();
  await expect(page).toHaveURL(/\/isfahan\/map\?lang=en$/);
  await expect(page.getByTestId("city-preview-notice")).toHaveCount(0);
  await expect(page.locator(".city-station-hit")).toHaveCount(20);
  await expect(page.locator(".metto-source-track")).toHaveCount(19);
  const start = page.locator(`.city-station-hit[data-station-id="${qods}"]`);
  await start.focus(); await page.keyboard.press("Enter");
  await expect(page.getByTestId("map-station-card")).toContainText("Defa-e Moghaddas");
  await page.getByRole("button", { name: "Set as origin", exact: true }).click();
  // The first station above already exercises keyboard selection. Use a
  // pointer here and wait for the destination card before its action: the
  // map remounts when the origin changes, so Enter can hit the old focus.
  await page.locator(`.city-station-hit[data-station-id="${end}"]`).click();
  await expect(page.getByTestId("map-station-card")).toContainText("Defa-e Moghaddas");
  await page.getByTestId("map-station-card").getByRole("button", { name: "Set as Destination", exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.has("op")).toBe(false);
  await expect.poll(() => new URL(page.url()).searchParams.has("dp")).toBe(false);
  await expect(page.getByTestId("city-network-map")).toHaveAttribute("data-route-station-count", "20");
  await page.locator("header").getByRole("link", { name: "Route", exact: true }).click();
  await expect(page).toHaveURL(/\/isfahan\/route\?/);
  await expect(page.getByLabel("From", { exact: true })).toContainText("Qods");
  await expect(page.getByLabel("To", { exact: true })).toContainText("Defa-e Moghaddas");
  await page.getByLabel("From", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Naqsh-e Jahan Square", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Iran Mall|Nader Shah Tomb/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("city-route-result")).toContainText(/20\s*stops/);
  await expect(page.getByTestId("isfahan-times")).toContainText("arrive");
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
  // Vercel injects noindex into hosted previews, including public city pages.
  // The local production build is where we assert this city's indexability.
  if (!new URL(page.url()).hostname.endsWith(".vercel.app"))
    await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0);
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
  await expect(page.getByTestId("city-preview-notice")).toHaveCount(0);
  await page.goto("/isfahan/stations?lang=en");
  await page.getByRole("searchbox").fill("Daneshgah");
  await expect(page.locator("li[data-station-id]")).not.toContainText("Boarding status disputed");
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

test("Isfahan offers the next published first train when service has finished", async ({ page }) => {
  const at = "2026-11-03T19:30:00.000Z"; // 23:00 in Iran, after the final train
  await page.goto(`/isfahan/route?from=${qods}&to=${end}&timeMode=depart&at=${encodeURIComponent(at)}&lang=en`);
  const noService = page.getByTestId("isfahan-no-service");
  await expect(noService).toBeVisible();
  const firstTrain = noService.getByRole("button", { name: /Take the first train/ });
  await expect(firstTrain).toHaveClass(/bg-primary/);
  await firstTrain.click();
  await expect(page.getByTestId("isfahan-times")).toBeVisible();
  const url = new URL(page.url());
  expect(url.searchParams.get("timeMode")).toBe("depart");
  expect(Date.parse(url.searchParams.get("at")!)).toBeGreaterThan(Date.parse(at));
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

test("Friday final trains and closed boarding points use the chosen Iran date", async ({ page }) => {
  await page.goto(`/isfahan/route?from=${qods}&to=${end}&at=2026-11-06T22:00&lang=en`);
  const times = page.getByTestId("isfahan-times");
  await expect(times).toContainText("22:00"); await expect(times).toContainText("22:39");
  await expect(page.getByTestId("city-route-result")).toContainText(/16\s*stops/);
  await page.reload(); await expect(times).toContainText("22:39");
  await page.goto(`/isfahan/route?from=isfahan:station:baharestan&to=${end}&at=2026-11-06T10:00&lang=en`);
  await expect(page.getByTestId("isfahan-no-boarding")).toContainText("does not board passengers");
  await expect(page.getByTestId("isfahan-times")).toHaveCount(0);
});

test("non-Friday public holidays disclose the Friday assumption in both languages", async ({ page }) => {
  await page.goto(`/isfahan/route?from=${qods}&to=${end}&at=2026-12-23T08:00&lang=en`);
  await expect(page.getByTestId("isfahan-holiday-assumption")).toContainText("not been confirmed");
  await expect(page.getByTestId("isfahan-times")).toContainText("09:00");
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(`/isfahan/route?from=${qods}&to=${end}&at=2026-12-23T08:00&lang=fa`);
  await expect(page.getByTestId("isfahan-holiday-assumption")).toContainText("تأیید نشده");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter(v => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  await page.screenshot({ path: "/tmp/isfahan-release-route-fa.png", fullPage: true });
});

test("Isfahan reuses Tehran's travel-time card, step controls and shareable arrival mode", async ({ page }) => {
  await page.goto(`/isfahan/route?from=${qods}&to=${end}&at=2026-11-06T10:00&lang=en`);
  const card = page.getByTestId("travel-time-card");
  await expect(card).toBeVisible();
  await expect(page.locator('input[type="datetime-local"]')).toHaveCount(0);
  await card.getByRole("radio").nth(2).locator("..").click();
  await expect(page).toHaveURL(/timeMode=arrive/);
  await expect(page.getByTestId("isfahan-times")).toContainText("09:15");
  await expect(page.getByTestId("isfahan-times")).toContainText("09:54");
  const previous = new URL(page.url()).searchParams.get("at");
  await card.getByRole("button", {name: "Increase minutes", exact: true}).click();
  expect(new URL(page.url()).searchParams.get("at")).not.toBe(previous);
  await page.reload(); await expect(card.getByRole("radio").nth(2)).toBeChecked();
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(page.url().replace("lang=en", "lang=fa"));
  await expect(card.getByRole("radio").nth(2)).toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter(v => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  await page.screenshot({ path: "/tmp/isfahan-shared-picker-fa.png", fullPage: true });
});


test("Isfahan uses the same three summary cards with source-based wait, travel and arrival", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/isfahan/route?from=${qods}&to=${end}&at=2026-11-06T09:05&lang=en`);
  const summary = page.getByTestId("route-summary-stats");
  await expect(summary.locator(":scope > div")).toHaveCount(3);
  await expect(summary).toContainText(/16\s*stops/);
  await expect(summary).toContainText(/10\s*\+\s*39/);
  await expect(summary).toContainText("09:54");
  await expect(summary).toContainText("wait + travel");
  await expect(page.getByTestId("isfahan-times")).not.toContainText("Published timetable");
  await expect(page.getByRole("contentinfo").getByRole("link", { name: /metto-data/ })).toBeVisible();
  await page.goto(`/isfahan/route?from=isfahan:station:baharestan&to=${end}&at=2026-11-06T09:05&lang=en`);
  await expect(page.getByTestId("isfahan-no-boarding")).toContainText("does not board passengers");
  await expect(summary).toHaveCount(0);
});

test("ordinary Isfahan journeys use Tehran's route flow without repeated calendar and source notices", async ({ page }) => {
  await page.goto(`/isfahan/route?from=${qods}&to=${end}&at=2026-11-03T10:00&lang=fa`);
  const journey = page.getByTestId("isfahan-times");
  await expect(journey).toBeVisible();
  await expect(journey.getByTestId("route-summary-stats")).toBeVisible();
  await expect(journey.locator("ol")).toHaveCount(1);
  await expect(journey).not.toContainText("تغییرات موردی");
  await expect(journey).not.toContainText("طبق برنامهٔ حرکت");
  await expect(journey).not.toContainText("داده‌های برنامهٔ حرکت");
  await expect(page.getByRole("contentinfo").getByRole("link", { name: /metto-data/ })).toBeVisible();
});

test("a missed Isfahan arrival deadline uses Tehran's actionable missed-deadline card", async ({ page }) => {
  await page.goto(`/isfahan/route?from=${qods}&to=${end}&at=2026-11-03T06:45:00.000Z&timeMode=arrive&lang=en`);
  const missed = page.getByTestId("isfahan-missed-deadline");
  await expect(missed).toBeVisible();
  await expect(missed).toContainText("10:15");
  await missed.getByRole("button", { name: "Route from now" }).click();
  await expect(page.getByTestId("isfahan-times")).toBeVisible();
  await expect(missed).toHaveCount(0);
});

test("timetabled Isfahan inherits Tehran's live countdown to reach the first station", async ({ page }) => {
  // Fixed now: 10:00 Iran time, with a scheduled Qods train at 10:06.
  await page.goto(`/isfahan/route?from=${qods}&to=${end}&timeMode=arrive&at=2026-11-03T07:20:00.000Z&lang=en`);
  const banner = page.getByTestId("plan-banner");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(/You've got/);
  await expect(banner).toContainText(/to reach Qods/);
  await expect(banner).toContainText(/sec/);
  await expect(page.getByTestId("route-summary-stats")).toBeVisible();
  await expect(page.getByTestId("isfahan-times").locator("ol")).toHaveCount(1);

  // Leaving arrive-by must hide the timer, as on Tehran.
  await page.getByTestId("travel-time-card").locator("fieldset").getByText("Leave now", { exact: true }).click();
  await expect(page.getByTestId("plan-banner")).toHaveCount(0);
});

test("Isfahan Now route shows the following published train like Tehran", async ({ page }) => {
  // Fixed by beforeEach: 10:00 Iran, source departures Qods 10:06 then 10:17.
  await page.goto(`/isfahan/route?from=${qods}&to=${end}&lang=en`);
  const journey = page.getByTestId("isfahan-times");
  await expect(journey.locator("ol")).toContainText("10:06");
  await expect(journey.locator("ol")).toContainText("Then:");
  await expect(journey.locator("ol")).toContainText("10:17");
});

test("same-station Isfahan follows Tehran's empty and direct-walk states", async ({ page }) => {
  await page.goto(`/isfahan/route?from=${qods}&to=${qods}&lang=en`);
  await expect(page.getByTestId("same-station-notice")).toContainText("Origin and destination are the same.");
  await expect(page.getByTestId("walk-suggest")).toHaveCount(0);
  await expect(page.getByTestId("city-route-result")).toHaveCount(0);
  await expect(page.getByTestId("route-summary-stats")).toHaveCount(0);

  await page.goto(`/isfahan/route?from=${qods}&to=${qods}&op=32.7149,51.6032,Origin&dp=32.7150,51.6032,Destination&lang=en`);
  await expect(page.getByTestId("walk-suggest")).toContainText("Walk between these places");
  await expect(page.getByTestId("same-station-notice")).toContainText("Origin and destination are the same.");
  await expect(page.getByTestId("city-route-result")).toHaveCount(0);
});

test("the Isfahan map merges two pins at one station like Tehran instead of showing duplicate cards", async ({ page }) => {
  await page.goto(`/isfahan/map?from=${qods}&to=${qods}&op=32.7149,51.6032,Origin&dp=32.7150,51.6032,Destination&lang=en`);
  const merged = page.getByTestId("map-place-card");
  await expect(merged).toHaveCount(1);
  await expect(merged).toContainText("Origin");
  await expect(merged).toContainText("Destination");
  await expect(merged).toContainText("Walk between these places");
  await expect(page.getByTestId("city-network-map")).toHaveAttribute("data-route-station-count", "0");
});

test("timetabled city retains the same route time across tabs and reloads", async ({ page }) => {
  const iso = "2026-11-03T07:20:00.000Z";
  await page.goto(`/isfahan/route?from=${qods}&to=${end}&timeMode=arrive&at=${encodeURIComponent(iso)}&lang=en`);
  await expect(page.getByTestId("plan-banner")).toBeVisible();
  await page.locator("header").getByRole("link", { name: "Map", exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("timeMode")).toBe("arrive");
  expect(new URL(page.url()).searchParams.get("at")).toBe(iso);
  await page.locator("header").getByRole("link", { name: "Stations", exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("timeMode")).toBe("arrive");
  expect(new URL(page.url()).searchParams.get("at")).toBe(iso);
  await page.locator("header").getByRole("link", { name: "Route", exact: true }).click();
  await expect(page.getByTestId("plan-banner")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("plan-banner")).toBeVisible();
});

test("Isfahan never shows a fake train itinerary when a route has no usable departure", async ({ page }) => {
  // The final Friday Qods departure is 22:00, even though the rails
  // remain connected and downstream stations have later boarding times.
  await page.goto(`/isfahan/route?from=${qods}&to=${end}&at=2026-11-06T22:01&lang=en`);
  await expect(page.getByTestId("isfahan-no-service")).toBeVisible();
  await expect(page.getByTestId("route-summary-stats")).toHaveCount(0);
  await expect(page.getByTestId("city-route-result").locator("ol")).toHaveCount(0);

  // Friday no-boarding endpoints must not offer an itinerary either.
  await page.goto(`/isfahan/route?from=isfahan:station:baharestan&to=${end}&at=2026-11-06T10:00&lang=en`);
  await expect(page.getByTestId("isfahan-no-boarding")).toContainText("does not board passengers");
  await expect(page.getByTestId("city-route-result").locator("ol")).toHaveCount(0);
});

test("Isfahan suppresses expired plans like Tehran and lets the passenger return to Now", async ({ page }) => {
  await page.goto(`/isfahan/route?from=${qods}&to=${end}&at=2026-11-02T09:05&lang=en`);
  await expect(page.getByTestId("city-time-passed")).toBeVisible();
  await expect(page.getByTestId("isfahan-times")).toHaveCount(0);
  await expect(page.getByTestId("route-summary-stats")).toHaveCount(0);
  await page.getByTestId("city-time-passed").getByRole("button", { name: "Use now" }).click();
  await expect(page.getByTestId("city-time-passed")).toHaveCount(0);
  await expect.poll(() => new URL(page.url()).searchParams.has("at")).toBe(false);
});

test("Isfahan presents the selected published train in Tehran's shared segment card", async ({ page }) => {
  await page.goto(`/isfahan/route?from=${qods}&to=${end}&at=2026-11-06T09:05&lang=en`);
  const route = page.getByTestId("city-route-result");
  await expect(route.getByTestId("route-summary-stats")).toContainText("09:54");
  await expect(route.locator("ol").first()).toContainText("09:15");
  await expect(route.locator("ol").first()).toContainText("09:54");
});

test("Isfahan station cards expose next departures and a full source-backed timesheet", async ({ page }) => {
  await page.goto("/isfahan/stations?lang=en");
  const station = page.locator(`li[data-station-id="${qods}"]`);
  await expect(station.getByTestId("isfahan-station-departures")).toBeVisible();
  await station.getByRole("button", { name: "Timetable", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Qods" });
  await expect(dialog.getByTestId("isfahan-station-timesheet")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Sat–Thu" })).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: /Friday \/ holidays/ }).click();
  await expect(dialog).toContainText("09:00");
  await expect(dialog).toContainText("22:00");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  const closedStation = page.locator('li[data-station-id="isfahan:station:baharestan"]');
  await closedStation.getByRole("button", { name: "Timetable", exact: true }).click();
  const fridayDialog = page.getByRole("dialog");
  await fridayDialog.getByRole("button", { name: /Friday \/ holidays/ }).click();
  await expect(fridayDialog).toContainText("does not board passengers");
});
