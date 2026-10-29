import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { networkSafeTest as test } from "./helpers/walking";

test("Isfahan review preserves rail shapes and saved trips, with accessible bilingual controls", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem("route.from", "tajrish");
    localStorage.setItem("route.to", "tehran-sadeghiyeh");
  });
  const response = await page.goto("/preview/isfahan?lang=fa");
  if (!(await response?.text())?.includes('data-testid="isfahan-review"')) {
    // Production intentionally excludes this screen. Vercel previews must serve it.
    expect(new URL(baseURL!).hostname.endsWith(".vercel.app")).toBe(false);
    expect(process.env.VERCEL_ENV).not.toBe("preview");
    test.skip(true, "Candidate review is disabled outside preview/development");
  }
  expect(response?.status()).toBe(200);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator(".city-station-hit")).toHaveCount(20);
  await expect(page.locator(".metto-source-track")).toHaveCount(19);
  const shapes = await page.locator(".metto-source-track").evaluateAll(paths => paths.map(p => p.getAttribute("d") ?? ""));
  expect(shapes.some(d => (d.match(/L/g) ?? []).length > 2)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);

  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByText("For review, not travel.", { exact: false })).toBeVisible();
  await page.getByLabel("Track from", { exact: true }).click();
  await expect(page.getByRole("option")).toHaveCount(20);
  await page.getByRole("combobox").press("ArrowDown");
  await page.getByRole("combobox").press("Enter");
  await expect(page.getByLabel("Track from", { exact: true })).toBeFocused();
  await page.getByLabel("Track to", { exact: true }).click();
  await page.getByRole("option").last().click();
  await expect(page.getByRole("status").filter({ hasText: "Mapped track" })).toContainText("20 stops");
  await expect(page.locator('.metto-source-track[stroke-width="6"]')).toHaveCount(19);

  await page.getByRole("button", { name: "Stations", exact: true }).click();
  await expect(page.locator("main ol li")).toHaveCount(20);
  await page.locator("main ol li button").filter({ hasText: "Daneshgah" }).click();
  await expect(page.getByRole("region", { name: "Daneshgah", exact: true })).toContainText("Boarding status disputed");
  await page.getByRole("button", { name: "Clear track selection", exact: true }).click();
  await expect(page.locator('.metto-source-track[stroke-width="6"]')).toHaveCount(0);
  expect(await page.evaluate(() => [localStorage.getItem("route.from"), localStorage.getItem("route.to")])).toEqual(["tajrish", "tehran-sadeghiyeh"]);
  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter(v => v.impact === "serious" || v.impact === "critical")).toEqual([]);
});
