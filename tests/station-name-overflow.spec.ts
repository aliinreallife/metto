import { expect } from "@playwright/test";
import { networkSafeTest as test } from "./helpers/walking";

test.describe("long station names", () => {
  test("Namayeshgah-e Shahr-e Aftab stays inside the route selector at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(
      "/route?from=namayeshgah-e-shahr-e-aftab&to=aghdasiyeh",
      { waitUntil: "domcontentloaded" },
    );

    const origin = page.locator("#origin-combobox");
    await expect(origin).toBeVisible();
    await expect(
      origin.locator('[title="Namayeshgah-e Shahr-e Aftab"]'),
    ).toBeVisible();

    const metrics = await origin.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        width: rect.width,
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
      };
    });

    expect(metrics.left).toBeGreaterThanOrEqual(0);
    expect(metrics.right).toBeLessThanOrEqual(metrics.viewportWidth);
    expect(metrics.width).toBeLessThanOrEqual(metrics.viewportWidth);
    expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth);
  });
});
