import { expect, test } from "@playwright/test";

// Station guides are part of Metto's original app structure, not a second website.
test.describe("station details within the app", () => {
  test("a station guide shares the app chrome, useful content and schema", async ({ page }) => {
    await page.goto("/tehran/stations/tajrish", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "ایستگاه مترو تجریش" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "مسیریابی و نقشه" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "موقعیت در خط" })).toBeVisible();
    await expect(page.getByRole("group", { name: "جهت‌های حرکت روی خط" }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "حرکت‌های بعدی" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "برنامه حرکت" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "مسیر صفحه" })).toBeVisible();
    await expect(page.getByRole("link", { name: "مترو تهران", exact: true })).toBeVisible();
    await expect(page).toHaveTitle(/تجریش تهران.*خط ۱/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href", "https://metto.ir/tehran/stations/tajrish",
    );
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
    expect(types).toContain("WebPage");
  });

  test("original stations tab opens the station and has a reliable way back", async ({ page }) => {
    await page.goto("/stations", { waitUntil: "domcontentloaded" });
    const details = page.getByRole("link", { name: "جزئیات ایستگاه تجریش" });
    await expect(details).toBeAttached();
    const beforeClick = await page.evaluate(() => ({
      navigatorOnline: navigator.onLine,
      swControlled: Boolean(navigator.serviceWorker?.controller),
    }));
    await details.click();
    await page.waitForTimeout(900);
    console.log("[station link diagnostic]", JSON.stringify({
      beforeClick,
      urlAfterClick: page.url(),
      dialogs: await page.getByRole("dialog").allTextContents(),
      href: await details.getAttribute("href").catch(() => "navigation happened"),
    }));
    await expect(page).toHaveURL(/\/tehran\/stations\/tajrish$/);
    await expect(page.getByRole("heading", { name: "ایستگاه مترو تجریش" })).toBeVisible();

    await page.getByRole("link", { name: "بازگشت به ایستگاه‌ها" }).click();
    await expect(page).toHaveURL(/\/stations\?lang=fa$/);
    await expect(page.getByRole("heading", { name: "ایستگاه‌های مترو تهران" })).toHaveCount(1);
  });

  test("a mistaken browser offline signal cannot hide a reachable station page", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "onLine", {
        configurable: true, get: () => false,
      });
    });
    await page.goto("/stations", { waitUntil: "domcontentloaded" });
    const link = page.getByRole("link", { name: "جزئیات ایستگاه تجریش" });
    await expect(link).toBeAttached();
    await link.click();
    await expect(page).toHaveURL(/\/tehran\/stations\/tajrish$/);
    await expect(page.getByRole("heading", { name: "ایستگاه مترو تجریش" })).toBeVisible();
  });

  test("uses verified Azadegan amenities and the real full timetable", async ({ page }) => {
    await page.goto("/tehran/stations/azadegan", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "ایستگاه مترو آزادگان" })).toBeVisible();
    await expect(page.getByRole("link", { name: "مترو تهران", exact: true })).toHaveAttribute(
      "href", "/tehran?lang=fa",
    );
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

  test("prerenders station-specific timetable data without requiring JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.goto("/tehran/stations/azadegan", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "ایستگاه مترو آزادگان" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "برنامه حرکت" })).toBeVisible();
      const content = await page.getByRole("heading", { name: "برنامه حرکت" })
        .locator("xpath=..").locator("xpath=..").innerText();
      expect(content).toMatch(/۱۴۶|۱۰۸|۹۸/);
    } finally {
      await context.close();
    }
  });

  for (const station of [
    { city: "isfahan", id: "qods", name: "قدس", cityName: "اصفهان", pattern: "شنبه تا پنجشنبه", terminal: "دفاع مقدس" },
    { city: "tabriz", id: "el-goli", name: "ائل‌گلی", cityName: "تبریز", pattern: "روزهای عادی", terminal: "نور" },
  ]) {
    test(`${station.city} station uses the same template and actual timetable`, async ({ page }) => {
    await page.goto(`/${station.city}/stations/${station.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: `ایستگاه مترو ${station.name}` })).toBeVisible();
    await expect(page.getByRole("link", { name: `مترو ${station.cityName}`, exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "موقعیت در خط" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "حرکت‌های بعدی" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "برنامه حرکت" })).toBeVisible();
    await expect(page.getByRole("button", { name: station.pattern })).toBeVisible();
    await expect(page.getByRole("link", { name: "مسیریابی به این ایستگاه" }))
      .toHaveAttribute("href", `/${station.city}/route?to=${encodeURIComponent(`${station.city}:station:${station.id}`)}&lang=fa`);
    await expect(page.getByRole("link", { name: "نمایش روی نقشهٔ متو" }))
      .toHaveAttribute("href", `/${station.city}/map?station=${encodeURIComponent(`${station.city}:station:${station.id}`)}&lang=fa`);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href", `https://metto.ir/${station.city}/stations/${station.id}`,
    );
    await page.getByRole("button", { name: /نمایش برنامه کامل/ }).click();
    await expect(page.getByRole("button", { name: /بستن برنامه کامل/ })).toBeVisible();
    await expect(page.getByTestId("line-direction-after").getByText(station.terminal)).toBeVisible();
    });
  }

  test("line destinations occupy opposite sides in RTL and LTR", async ({ page }) => {
    await page.goto("/tabriz/stations/sahand", { waitUntil: "domcontentloaded" });
    const before = page.getByTestId("line-direction-before");
    const after = page.getByTestId("line-direction-after");
    await expect(before.getByText("ائل‌گلی")).toBeVisible();
    await expect(after.getByText("نور")).toBeVisible();
    const faBefore = await before.boundingBox();
    const faAfter = await after.boundingBox();
    expect(faBefore && faAfter && faBefore.x > faAfter.x).toBeTruthy();

    await page.goto("/tabriz/stations/sahand?lang=en", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("line-direction-before").getByText("El Goli")).toBeVisible();
    await expect(page.getByTestId("line-direction-after").getByText("Noor")).toBeVisible();
    const enBefore = await page.getByTestId("line-direction-before").boundingBox();
    const enAfter = await page.getByTestId("line-direction-after").boundingBox();
    expect(enBefore && enAfter && enBefore.x < enAfter.x).toBeTruthy();
  });

  test("other timed cities expose HTML timetable facts even without JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      for (const [city, id, name] of [
        ["isfahan", "qods", "قدس"],
        ["tabriz", "el-goli", "ائل‌گلی"],
      ]) {
        const page = await context.newPage();
        await page.goto(`/${city}/stations/${id}`, { waitUntil: "domcontentloaded" });
        await expect(page.getByRole("heading", { name: `ایستگاه مترو ${name}` })).toBeVisible();
        await expect(page.getByRole("heading", { name: "برنامه حرکت" })).toBeVisible();
        await expect(page.getByText("تعداد حرکت")).toBeVisible();
        await page.close();
      }
    } finally {
      await context.close();
    }
  });

  test("city station listings expose crawlable links without JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      for (const { city, id } of [
        { city: "isfahan", id: "qods" },
        { city: "tabriz", id: "el-goli" },
      ]) {
        const page = await context.newPage();
        await page.goto(`/${city}/stations`, { waitUntil: "domcontentloaded" });
        await expect(page.locator(`a[href="/${city}/stations/${id}"]`).first()).toBeAttached();
        await page.close();
      }
    } finally {
      await context.close();
    }
  });

  test("untimed Mashhad stations are not falsely published with train schedules", async ({ request }) => {
    const response = await request.get("/mashhad/stations/koohsangi");
    expect(response.status()).toBe(404);
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
