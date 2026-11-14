import { expect, test } from "@playwright/test";

// Station guides are part of Metto's original app structure, not a second website.
test.describe("station details within the app", () => {
  test("a station guide shares the app chrome, useful content and schema", async ({ page }) => {
    await page.goto("/tehran/stations/tajrish", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "ایستگاه مترو تجریش" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "مسیریابی و نقشه" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "موقعیت در خط" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "حرکت‌های بعدی" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "برنامه حرکت" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "مسیر صفحه" })).toBeVisible();
    await expect(page.locator("footer.fixed.bottom-0")).toHaveCount(1);
    await expect(page.getByRole("link", { name: "مسیریابی به این ایستگاه" }))
      .toHaveAttribute("href", "/tehran/route?to=tajrish&lang=fa");
    await expect(page.getByRole("link", { name: "نمایش روی نقشهٔ متو" }))
      .toHaveAttribute("href", "/tehran/map?station=tajrish&lang=fa");

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

  test("original stations tab opens the station and has a reliable way back", async ({ page }) => {
    await page.goto("/stations", { waitUntil: "domcontentloaded" });
    const details = page.getByRole("link", { name: "جزئیات ایستگاه تجریش" });
    await expect(details).toBeAttached();
    await details.click();
    await expect(page).toHaveURL(/\/tehran\/stations\/tajrish$/);
    await expect(page.getByRole("heading", { name: "ایستگاه مترو تجریش" })).toBeVisible();

    await page.getByRole("link", { name: "بازگشت به ایستگاه‌ها" }).click();
    await expect(page).toHaveURL(/\/stations\?lang=fa$/);
    await expect(page.getByRole("heading", { name: "ایستگاه‌های مترو تهران" })).toHaveCount(1);
  });

  test("uses verified Azadegan amenities and the real full timetable", async ({ page }) => {
    await page.goto("/tehran/stations/azadegan", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "ایستگاه مترو آزادگان" })).toBeVisible();
    await expect(page.getByText("پارکینگ دوچرخه")).toBeVisible();
    await expect(page.getByText("پلیس مترو")).toBeVisible();
    await expect(page.getByText("سرویس بهداشتی")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "نعمت آباد" })).toBeVisible();

    await page.getByRole("button", { name: "شنبه تا چهارشنبه" }).click();
    await expect(page.getByText("۱۴۶", { exact: true })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: /نمایش برنامه کامل/ }).click();
    await expect(page.getByText("۵:۳۰", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("۲۲:۰۰", { exact: true }).first()).toBeVisible();
  });

  test("honors existing English language support on station pages", async ({ page }) => {
    await page.goto("/tehran/stations/azadegan?lang=en", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Azadegan Metro Station" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sat–Wed" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Route to this station" })).toBeVisible();
  });

  test("offline commuters get the existing details sheet, not a failed page", async ({ page, context }) => {
    await page.goto("/stations", { waitUntil: "domcontentloaded" });
    const details = page.getByRole("link", { name: "جزئیات ایستگاه تجریش" });
    await expect(details).toBeAttached();
    await context.setOffline(true);
    await details.click();
    await expect(page.getByRole("dialog", { name: "تجریش" })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/stations");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "تجریش" })).toHaveCount(0);
  });
});
