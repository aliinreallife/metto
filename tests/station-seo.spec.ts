import { expect, test } from "@playwright/test";

// SEO content is additive. It must not steal the established metro-app routes.
test.describe("station guides and legacy navigation", () => {
  test("Tehran station guide renders useful static content and truthful schema", async ({ page }) => {
    await page.goto("/tehran/stations/tajrish", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "ایستگاه مترو تجریش" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "خطوط فعال" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "مسیر صفحه" })).toBeVisible();
    await expect(page.getByRole("link", { name: "مسیریابی به این ایستگاه" }))
      .toHaveAttribute("href", "/tehran/route?to=tajrish");
    await expect(page.getByRole("link", { name: "نمایش روی نقشهٔ متو" }))
      .toHaveAttribute("href", "/tehran/map?station=tajrish");

    const types = await page.locator('script[type="application/ld+json"]').evaluateAll(scripts =>
      scripts.flatMap(script => {
        try {
          const value = JSON.parse(script.textContent ?? "null");
          return (Array.isArray(value) ? value : [value]).map(item => item?.["@type"]);
        } catch { return []; }
      }));
    expect(types).toContain("BreadcrumbList");
    expect(types).toContain("SubwayStation");
  });

  test("station directory links to guides without replacing the old stations tab", async ({ page }) => {
    await page.goto("/tehran/stations/directory", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "راهنمای ایستگاه‌های مترو تهران" })).toBeVisible();
    await page.getByRole("link", { name: "تجریش", exact: true }).first().click();
    await expect(page).toHaveURL(/\/tehran\/stations\/tajrish$/);

    await page.goto("/stations", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "ایستگاه‌های مترو تهران" })).toHaveCount(1);
  });
});
