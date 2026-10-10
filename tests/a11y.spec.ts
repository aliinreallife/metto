import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Accessibility gate for the route-search flow (Phase 1 + Phase 3).
// - Axe scans on /route, /stations, /nearby, /map — fails only on
//   serious/critical impacts (moderate/minor are reported, not fatal,
//   so deferred work like palette contrast tuning doesn't block quick wins).
// - Keyboard flow for the From/To comboboxes: labels associated,
//   listbox/option semantics, Escape restores focus.

const ROUTES = ["/route", "/stations", "/nearby", "/map"] as const;

for (const route of ROUTES) {
  test(`axe: ${route} has no serious/critical violations`, async ({ page }) => {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    // Let client hydration settle (schedule/holiday data, map vectors).
    await page.waitForTimeout(route === "/map" ? 4000 : 1500);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();

    const blocking = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );

    // Attach full report for debugging even on pass.
    await test.info().attach(`axe-${route.replace("/", "root")}`, {
      body: JSON.stringify(
        results.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.length,
          description: v.description,
        })),
        null,
        2,
      ),
      contentType: "application/json",
    });

    expect(
      blocking.map((v) => `${v.id} (${v.impact}): ${v.help}`),
    ).toEqual([]);
  });
}

test.describe("landmarks", () => {
  for (const route of ROUTES) {
    test(`${route} exposes exactly one main landmark`, async ({ page }) => {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      // Let client hydration settle (schedule/holiday data, map vectors).
      await page.waitForTimeout(route === "/map" ? 4000 : 1500);

      // Exactly one <main>: page content (fixes "page contains exactly
      // one main landmark region") and every route's primary content
      // lives inside it (fixes "visible content within landmarks").
      await expect(page.locator("main")).toHaveCount(1);
      // Mobile bottom-bar wrapper is a site <footer> (contentinfo), so
      // the credits links above the tab bar are inside a landmark too.
      await expect(page.locator("footer.fixed.bottom-0")).toHaveCount(1);
    });
  }

  test("/route main contains the route search form", async ({ page }) => {
    await page.goto("/route", { waitUntil: "domcontentloaded" });
    const main = page.locator("main");
    await expect(main.locator("#origin-combobox")).toBeVisible();
    await expect(main.locator("#dest-combobox")).toBeVisible();
  });
});

test.describe("route search keyboard flow", () => {
  test("From/To labels associated, combobox semantics, Escape restores focus", async ({
    page,
  }) => {
    await page.goto("/route", { waitUntil: "domcontentloaded" });

    const originLabel = page.getByText("مبدأ", { exact: true }).first();
    const destLabel = page.getByText("مقصد", { exact: true }).first();
    await expect(originLabel).toBeVisible();
    await expect(destLabel).toBeVisible();

    // Labels point at the combobox triggers.
    await expect(originLabel).toHaveAttribute("for", "origin-combobox");
    await expect(destLabel).toHaveAttribute("for", "dest-combobox");

    const originTrigger = page.locator("#origin-combobox");
    const destTrigger = page.locator("#dest-combobox");
    await expect(originTrigger).toHaveAttribute("aria-haspopup", "listbox");
    await expect(destTrigger).toHaveAttribute("aria-haspopup", "listbox");

    // Closed initially.
    await expect(originTrigger).toHaveAttribute("aria-expanded", "false");

    // Open via keyboard and check combobox pattern.
    await originTrigger.focus();
    await page.keyboard.press("Enter");
    await expect(originTrigger).toHaveAttribute("aria-expanded", "true");

    const listboxId = await originTrigger.getAttribute("aria-controls");
    expect(listboxId).toBeTruthy();
    const listbox = page.locator(`#${listboxId}`);
    await expect(listbox).toHaveAttribute("role", "listbox");

    const searchInput = page.locator("#origin-combobox-input");
    await expect(searchInput).toHaveAttribute("role", "combobox");
    await expect(searchInput).toHaveAttribute("aria-controls", listboxId!);
    await expect(searchInput).toBeFocused();

    // Type to filter; options expose role=option with selection state.
    await searchInput.fill("تجریش");
    const firstOption = listbox.getByRole("option").first();
    await expect(firstOption).toBeVisible({ timeout: 10_000 });
    await expect(firstOption).toHaveAttribute("aria-selected");

    // Polite live region announces results.
    const status = page.locator("#origin-combobox-status");
    await expect(status).toHaveAttribute("aria-live", "polite");
    await expect(status).not.toBeEmpty({ timeout: 10_000 });

    // Escape closes and restores focus to the trigger.
    await page.keyboard.press("Escape");
    await expect(originTrigger).toHaveAttribute("aria-expanded", "false");
    await expect(originTrigger).toBeFocused();

    // Select a station via click; trigger keeps an accessible name.
    await originTrigger.click();
    await searchInput.fill("تجریش");
    await listbox.getByRole("option").first().click();
    await expect(originTrigger).not.toBeEmpty();

    // No X/clear button in the selectors by design — selection changes
    // by picking another station.
    await expect(page.getByRole("button", { name: "پاک کردن" })).toHaveCount(0);
  });

  test("route warnings and departures use live regions", async ({ page }) => {
    await page.goto("/route?from=tajrish&to=tehran-sadeghiyeh", {
      waitUntil: "domcontentloaded",
    });
    // Arrival stat proves the route rendered.
    await expect(page.getByText("رسیدن", { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });
    // Loading shimmer (if still present) or departures must be a live region.
    const liveStatuses = page.locator('[role="status"]');
    await expect(liveStatuses.first()).toBeAttached({ timeout: 30_000 });
  });
});

test.describe("a11y quick wins", () => {
  test("/stations search has an accessible name and filter chips toggle pressed state", async ({
    page,
  }) => {
    await page.goto("/stations", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    // Search input exposes its localized name (not placeholder-only).
    const search = page.getByRole("textbox", { name: /جستجوی ایستگاه/ });
    await expect(search).toBeVisible();

    // "All" chip starts pressed; picking a line flips pressed state.
    const allChip = page.getByRole("button", { name: "همه", exact: true });
    await expect(allChip).toHaveAttribute("aria-pressed", "true");

    const lineChip = page.getByRole("button", { name: /خط ۱/ }).first();
    await expect(lineChip).toHaveAttribute("aria-pressed", "false");
    await lineChip.click();
    await expect(lineChip).toHaveAttribute("aria-pressed", "true");
    await expect(allChip).toHaveAttribute("aria-pressed", "false");
  });

  test("/stations timetable day selector exposes pressed state", async ({
    page,
  }) => {
    await page.goto("/stations", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    // Open the first station's timetable sheet.
    await page.getByRole("button", { name: /برنامه|Timetable/ }).first().click();

    const satWed = page.getByRole("button", { name: /شنبه تا چهارشنبه|Sat/ });
    const thursday = page.getByRole("button", { name: /پنجشنبه|Thursday/ });
    await expect(satWed.first()).toHaveAttribute("aria-pressed");
    await thursday.first().click();
    await expect(thursday.first()).toHaveAttribute("aria-pressed", "true");
    await expect(satWed.first()).toHaveAttribute("aria-pressed", "false");
  });

  test("/nearby amenity chips expose pressed state once located", async ({
    page,
  }) => {
    await page.goto("/nearby", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    // Pick a station as the location so the amenity filter renders.
    const trigger = page.locator('button[aria-haspopup="listbox"]').first();
    await trigger.click();
    const searchInput = page.locator('input[role="combobox"]');
    await expect(searchInput).toBeFocused();
    await searchInput.fill("تجریش");
    const listboxId = await searchInput.getAttribute("aria-controls");
    const firstOption = page.locator(`#${listboxId}`).getByRole("option").first();
    await expect(firstOption).toBeVisible({ timeout: 10_000 });
    await firstOption.click();

    const nearestChip = page
      .getByRole("button", { name: /نزدیک‌ترین ایستگاه‌ها|Nearest stations/ })
      .first();
    await expect(nearestChip).toHaveAttribute("aria-pressed", "true");

    const wcChip = page
      .getByRole("button", { name: /سرویس بهداشتی|Restroom/ })
      .first();
    await expect(wcChip).toHaveAttribute("aria-pressed", "false");
    await wcChip.click();
    await expect(wcChip).toHaveAttribute("aria-pressed", "true");
    await expect(nearestChip).toHaveAttribute("aria-pressed", "false");
  });

  test("/map mode toggle exposes pressed state and toggles", async ({
    page,
  }) => {
    await page.goto("/map", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);

    const satellite = page.getByRole("button", { name: /ماهواره‌ای|Satellite/ });
    const minimalist = page.getByRole("button", { name: /مینیمال|Minimalist/ });
    await expect(minimalist).toHaveAttribute("aria-pressed", "true");
    await expect(satellite).toHaveAttribute("aria-pressed", "false");

    await satellite.click();
    await expect(satellite).toHaveAttribute("aria-pressed", "true");
    await expect(minimalist).toHaveAttribute("aria-pressed", "false");
  });

  test("app routes expose a skip link targeting the main content", async ({
    page,
  }) => {
    await page.goto("/route", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    const skip = page.getByRole("link", { name: /رفتن به محتوا|Skip to content/ });
    await expect(skip).toHaveAttribute("href", "#main-content");
    await expect(page.locator("main#main-content")).toHaveCount(1);

    // Keyboard users can reach it: focusing reveals it without layout change.
    await skip.focus();
    await expect(skip).toBeFocused();
    await skip.click();
    await expect(page.locator("main#main-content")).toBeVisible();
    await expect(page).toHaveURL(/#main-content/);
  });

  for (const route of ["/stations", "/nearby", "/map"] as const) {
    test(`${route} syncs <html> lang/dir when switching FA/EN`, async ({
      page,
    }) => {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(route === "/map" ? 4000 : 1500);

      // Default visit is Persian RTL.
      await expect.poll(async () =>
        page.evaluate(() => document.documentElement.lang),
      ).toBe("fa");
      await expect.poll(async () =>
        page.evaluate(() => document.documentElement.dir),
      ).toBe("rtl");

      const langToggle = page.getByRole("button", {
        name: /تغییر زبان|Toggle language/,
      });
      await langToggle.click();
      await expect.poll(async () =>
        page.evaluate(() => document.documentElement.lang),
      ).toBe("en");
      await expect.poll(async () =>
        page.evaluate(() => document.documentElement.dir),
      ).toBe("ltr");

      // And back to Persian.
      await page
        .getByRole("button", { name: /تغییر زبان|Toggle language/ })
        .click();
      await expect.poll(async () =>
        page.evaluate(() => document.documentElement.lang),
      ).toBe("fa");
      await expect.poll(async () =>
        page.evaluate(() => document.documentElement.dir),
      ).toBe("rtl");
    });
  }
});
