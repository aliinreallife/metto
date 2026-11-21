import { expect, test } from "@playwright/test";

// Google's sitelinks are automatically chosen. These assertions protect the
// site signals Google can use: a unique page H1, a meaningful page title,
// and real internal links with descriptive, visible anchor text.
test.describe("descriptive site links", () => {
  test("every Tehran app tab has its own H1 and meaningful title without JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      for (const { path, heading, title } of [
        { path: "/route", heading: "مسیریاب مترو تهران با زمان رسیدن", title: /مسیریاب مترو تهران.*قطار بعدی/ },
        { path: "/stations", heading: "ایستگاه‌های مترو تهران", title: /ایستگاه‌های مترو تهران.*امکانات/ },
        { path: "/nearby", heading: "نزدیک‌ترین ایستگاه مترو به من", title: /نزدیک‌ترین ایستگاه مترو به من/ },
        { path: "/map", heading: "نقشه مترو تهران", title: /نقشه مترو تهران.*خطوط/ },
      ]) {
        const page = await context.newPage();
        const response = await page.goto(path, { waitUntil: "domcontentloaded" });
        expect(response?.status()).toBe(200);
        await expect(page).toHaveTitle(title);
        await expect(page.locator("header h1")).toHaveCount(0);
        const mainHeading = page.getByRole("heading", { level: 1, includeHidden: true });
        await expect(mainHeading).toHaveCount(1);
        await expect(mainHeading).toHaveText(heading);
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
          "href", `https://metto.ir${path}`,
        );
        await page.close();
      }
    } finally {
      await context.close();
    }
  });

  test("the landing links visibly and directly to canonical, descriptively named tabs", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.goto("/", { waitUntil: "domcontentloaded" });
      const footer = page.locator("footer").last();
      for (const { label, href } of [
        { label: "مسیریابی مترو تهران", href: "/route" },
        { label: "ایستگاه‌های مترو تهران", href: "/stations" },
        { label: "نزدیک‌ترین ایستگاه مترو تهران", href: "/nearby" },
        { label: "نقشه مترو تهران", href: "/map" },
      ]) {
        const link = footer.locator("a[href]").filter({ hasText: label });
        await expect(link).toHaveCount(1);
        await expect(link).toHaveAttribute("href", href);
      }
      // City-specific landing footers still link to that city's own tabs.
      await page.goto("/isfahan", { waitUntil: "domcontentloaded" });
      await expect(page.locator("footer").last().locator("a[href]").filter({
        hasText: "نقشه مترو اصفهان",
      })).toHaveAttribute("href", "/isfahan/map");
    } finally {
      await context.close();
    }
  });

  test("planner and map titles remain informative after client hydration", async ({ page }) => {
    await page.goto("/route", { waitUntil: "load" });
    await expect(page).toHaveTitle("مسیریاب مترو تهران | زمان رسیدن و قطار بعدی | متو");
    await expect(page.locator("header h1")).toHaveCount(0);
    await page.goto("/map", { waitUntil: "load" });
    await expect(page).toHaveTitle("نقشه مترو تهران آنلاین | خطوط و ایستگاه‌ها | متو");
    await expect(page.locator("header h1")).toHaveCount(0);
  });
});
