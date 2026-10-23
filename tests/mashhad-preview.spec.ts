import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
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
  await expect(planner.getByText("Browse stations (36)")).toBeVisible();
  await planner.getByLabel("From", { exact: true }).selectOption("mashhad:station:airport");
  await planner.getByLabel("To", { exact: true }).selectOption("mashhad:station:tabarsi");
  const result = planner.getByTestId("city-route-result");
  await expect(result.getByText("Change lines at Shariati")).toBeVisible();
  await expect(result).not.toContainText(/minutes|arrival|estimated/i);
  await expect(planner.getByTestId("city-no-times")).toContainText("not available");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  const selections = await page.evaluate(() => [localStorage.getItem("route.from"), localStorage.getItem("route.to")]);
  expect(selections).toEqual(["tajrish", "tehran-sadeghiyeh"]);
  expect(await page.evaluate(() => (window as typeof window & { registeredMetroTools: string[] }).registeredMetroTools)).toEqual([]);
  await page.reload();
  await expect(page.getByRole("main").getByTestId("city-route-result")).toContainText("Change lines at Shariati");
});

test("supports Persian, keyboard controls and accessible results", async ({ page }) => {
  await page.goto("/mashhad/route?lang=fa");
  const planner = page.getByTestId("city-path-preview");
  await expect(planner).toHaveAttribute("dir", "rtl");
  await planner.getByLabel("مبدأ", { exact: true }).selectOption("mashhad:station:vakilabad");
  await planner.getByLabel("مقصد", { exact: true }).selectOption("mashhad:station:airport");
  await expect(planner.getByTestId("city-route-result")).toContainText("۲۳ ایستگاه");
  const swap = planner.getByRole("button", { name: "جابجایی" });
  await swap.focus(); await page.keyboard.press("Enter");
  await expect(planner.getByLabel("مبدأ", { exact: true })).toHaveValue("mashhad:station:airport");
  const audit = await new AxeBuilder({ page }).include('[data-testid="city-path-preview"]').analyze();
  expect(audit.violations.filter(v => v.impact === "serious" || v.impact === "critical")).toEqual([]);
});

test("rejects cross-city links and leaves disputed Line 3 stops unselectable", async ({ page, request }) => {
  await page.goto("/mashhad/route?from=tajrish&to=mashhad:station:airport&lang=en");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("outside these two lines");
  await expect(page.locator('option[value="mashhad:station:bab-al-javad"]')).toHaveCount(0);
  await expect(page.getByTestId("city-route-result")).toHaveCount(0);
  const denied = await request.get("/api/cities/mashhad/route?from=tajrish&to=mashhad:station:airport");
  expect(denied.status()).toBe(400);
});
