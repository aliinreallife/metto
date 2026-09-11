import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Accessibility gate for the route-search flow (Phase 1 + Phase 3).
// - Axe scans on /, /stations, /nearby, /map — fails only on
//   serious/critical impacts (moderate/minor are reported, not fatal,
//   so deferred work like palette contrast tuning doesn't block quick wins).
// - Keyboard flow for the From/To comboboxes: labels associated,
//   listbox/option semantics, Escape restores focus.

const ROUTES = ["/", "/stations", "/nearby", "/map"] as const;

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

test.describe("route search keyboard flow", () => {
  test("From/To labels associated, combobox semantics, Escape restores focus", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

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

    // Clear button is a real 24px button with an accessible name.
    const clear = page.getByRole("button", { name: "پاک کردن" }).first();
    await expect(clear).toBeVisible();
    const box = await clear.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(24);
    expect(box?.height).toBeGreaterThanOrEqual(24);
  });

  test("route warnings and departures use live regions", async ({ page }) => {
    await page.goto("/?from=tajrish&to=tehran-sadeghiyeh", {
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
