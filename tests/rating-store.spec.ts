import { expect, test } from "@playwright/test";

/**
 * Browser tests emulate only the native launch parameters supplied by the
 * Android wrapper. These verify the web UX and visibility policy, not the
 * external Bazaar/Myket app UI (which requires a real Android device).
 */
test.describe("rating store availability", () => {
  test("ordinary website visitors cannot open rating without native store detection", async ({
    page,
  }) => {
    await page.goto("/rate", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/route(?:[?#]|$)/, { timeout: 20_000 });
    await expect(page.getByText("cafebazaar.ir/app/ir.metto.app")).toHaveCount(0);
    await expect(page.getByText("myket.ir/app/ir.metto.app")).toHaveCount(0);
  });

  test("TWA with both stores offers both rating choices", async ({ page }) => {
    await page.goto(
      "/rate?twa=android&ratingStores=bazaar%2Cmyket&ratingPreferred=choose",
      { waitUntil: "domcontentloaded" },
    );
    await expect(page.getByText("cafebazaar.ir/app/ir.metto.app")).toBeVisible();
    await expect(page.getByText("myket.ir/app/ir.metto.app")).toBeVisible();
    await expect(page).not.toHaveURL(/ratingStores/);
  });

  test("TWA with only Myket hides Bazaar and keeps Myket choice", async ({
    page,
  }) => {
    await page.goto(
      "/rate?twa=android&ratingStores=myket&ratingPreferred=myket",
      { waitUntil: "domcontentloaded" },
    );
    await expect(page.getByText("myket.ir/app/ir.metto.app")).toBeVisible();
    await expect(page.getByText("cafebazaar.ir/app/ir.metto.app")).toHaveCount(0);
  });

  test("TWA with no installed stores hides both choices", async ({ page }) => {
    await page.goto(
      "/rate?twa=android&ratingStores=none&ratingPreferred=choose",
      { waitUntil: "domcontentloaded" },
    );
    await expect(page).toHaveURL(/\/route(?:[?#]|$)/, { timeout: 20_000 });
    await expect(page.getByText("cafebazaar.ir/app/ir.metto.app")).toHaveCount(0);
    await expect(page.getByText("myket.ir/app/ir.metto.app")).toHaveCount(0);
  });
});
