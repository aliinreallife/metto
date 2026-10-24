import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { pickCityStation } from "./helpers/city-stations";
import { networkSafeTest as test } from "./helpers/walking";

// Runs automatically on enabled local/Vercel previews. The production gate
// is independently tested by the API unit suite and the production-build smoke.
test.beforeEach(async ({ context, request }) => {
  const response = await request.get("/api/cities/mashhad/route?from=mashhad:station:airport&to=mashhad:station:tabarsi");
  test.skip(response.status() === 404, "Mashhad is unavailable in this deployment");
  expect(response.status()).toBe(200);
  await context.addInitScript(() => {
    localStorage.setItem("route.from", "tajrish");
    localStorage.setItem("route.to", "tehran-sadeghiyeh");
    const registered: string[] = [];
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: { registerTool: (tool: { name: string }) => { registered.push(tool.name); return () => undefined; } },
    });
    Object.assign(window, { registeredMetroTools: registered });
  });
});

test("routes the two-line scope without timing, Tehran tools or selection leakage", async ({ page }) => {
  await page.goto("/mashhad/route?lang=en");
  const planner = page.getByTestId("city-path-preview");
  await expect(planner).toHaveAttribute("dir", "ltr");
  await expect(planner.getByText("Browse stations (36)")).toHaveCount(0);
  await expect(planner.locator("details")).toHaveCount(0);
  await pickCityStation(page, "From", "Airport");
  await pickCityStation(page, "To", "Tabarsi");
  const result = planner.getByTestId("city-route-result");
  await expect(result.getByText("Transfer to Line 2 via Shariati")).toBeVisible();
  await expect(result.getByTestId("route-summary-stats")).toContainText("—");
  await expect(result.getByRole("button", { name: "Copy route link", exact: true })).toBeVisible();
  await expect(result.getByRole("link", { name: /Directions to start/ })).toBeVisible();
  await expect(result).not.toContainText(/\d{1,2}:\d{2}|\d+ minutes|estimated/i);
  await expect(planner.getByTestId("city-no-times")).toContainText("aren't available yet");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  const selections = await page.evaluate(() => [localStorage.getItem("route.from"), localStorage.getItem("route.to")]);
  expect(selections).toEqual(["tajrish", "tehran-sadeghiyeh"]);
  expect(await page.evaluate(() => (window as typeof window & { registeredMetroTools: string[] }).registeredMetroTools)).toEqual([]);
  await page.reload();
  await expect(page.getByRole("main").getByTestId("city-route-result")).toContainText("Transfer to Line 2 via Shariati");
});

test("supports Persian, keyboard controls and accessible results", async ({ page }) => {
  await page.goto("/mashhad/route?lang=fa");
  const planner = page.getByTestId("city-path-preview");
  await expect(planner).toHaveAttribute("dir", "rtl");
  await pickCityStation(page, "مبدأ", "VakilAbad");
  await pickCityStation(page, "مقصد", "Airport");
  await expect(planner.getByTestId("route-summary-stats").getByText("۲۴", { exact: true })).toBeVisible();
  const swap = planner.getByRole("button", { name: "جابجایی" });
  await swap.focus(); await page.keyboard.press("Enter");
  await expect(planner.getByLabel("مبدأ", { exact: true })).toContainText("فرودگاه");
  const audit = await new AxeBuilder({ page }).include('[data-testid="city-path-preview"]').analyze();
  expect(audit.violations.filter(v => v.impact === "serious" || v.impact === "critical")).toEqual([]);
});

test("rejects cross-city links and leaves disputed Line 3 stops unselectable", async ({ page, request }) => {
  await page.goto("/mashhad/route?from=tajrish&to=mashhad:station:airport&lang=en");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("outside these two lines");
  await page.getByLabel("From", { exact: true }).click();
  await page.locator('input[role="combobox"]').fill("باب الجواد");
  await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("city-route-result")).toHaveCount(0);
  const denied = await request.get("/api/cities/mashhad/route?from=tajrish&to=mashhad:station:airport");
  expect(denied.status()).toBe(400);
});


test("uses the shared itinerary disclosure and chooses GPS origin within Mashhad", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 36.231, longitude: 59.643 });
  const timetableRequests: string[] = [];
  page.on("request", request => { if (/schedule-data|\/data\/schedule-/.test(request.url())) timetableRequests.push(request.url()); });
  await page.goto("/mashhad/route?from=mashhad:station:vakilabad&to=mashhad:station:airport&lang=en");
  const disclosure = page.getByRole("button", { name: "Intermediate stops" });
  await expect(disclosure).toHaveAttribute("aria-expanded", "false");
  await disclosure.click();
  await expect(disclosure).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("city-route-result").getByRole("list").last()).toContainText("Shariati");
  await page.getByRole("button", { name: "Use my location", exact: true }).click();
  await expect(page.getByLabel("From", { exact: true })).toContainText("Airport");
  expect(timetableRequests).toEqual([]);
});
