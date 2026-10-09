import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Accessibility gate for the route-search flow.
// - Axe scans on /route, /stations, /nearby, /map — fails on
//   moderate/serious/critical impacts (minor only is reported, not fatal).
//   Palette contrast was tuned (#43) so the moderate gate holds.
// - Keyboard flow for the From/To comboboxes: labels associated,
//   listbox/option semantics, Escape restores focus.

const ROUTES = ["/route", "/stations", "/nearby", "/map"] as const;

async function waitForAppReady(page: import("@playwright/test").Page, route: string) {
  // Readiness markers instead of fixed sleeps (#43 test hardening):
  // main landmark + app chrome must be attached/visible, then hydration
  // settles via network idle. Map needs longer for tile vectors.
  await page.goto(route, { waitUntil: "domcontentloaded" });
  const main = page.locator("main#main-content, main").first();
  await expect(main).toBeAttached({ timeout: 15_000 });
  await expect(page.locator("header").first()).toBeVisible({ timeout: 15_000 });
  // Footer is mobile-only (md:hidden) — assert attachment, not visibility,
  // so the gate works on both mobile and desktop viewports.
  await expect(page.locator("footer.fixed.bottom-0").first()).toBeAttached({ timeout: 15_000 });
  try {
    await page.waitForLoadState("networkidle", { timeout: route === "/map" ? 15_000 : 8_000 });
  } catch {
    // Offline-first precache can keep networkidle from firing; markers above are the gate.
  }
  if (route === "/map") {
    // Map vectors hydrate lazily — wait for canvas or Leaflet container.
    const mapReady = page.locator(".leaflet-container, canvas").first();
    try {
      await expect(mapReady).toBeVisible({ timeout: 10_000 });
    } catch {
      // Fall through: axe gate still validates landmarks even if tiles are slow.
    }
  }
}

for (const route of ROUTES) {
  test(`axe: ${route} has no moderate+ violations`, async ({ page }) => {
    await waitForAppReady(page, route);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();

    const blocking = results.violations.filter(
      (v) => v.impact === "moderate" || v.impact === "serious" || v.impact === "critical",
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
      await waitForAppReady(page, route);

      // Exactly one <main>: page content (fixes "page contains exactly
      // one main landmark region") and every route's primary content
      // lives inside it (fixes "visible content within landmarks").
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.locator("main#main-content")).toHaveCount(1);
      // Skip link targets the main landmark (#43 Phase 2).
      await expect(page.locator('a[href="#main-content"]')).toBeAttached();
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
    await waitForAppReady(page, "/route");

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
    // Single controlling combobox (#43): only the filter input claims
    // aria-controls; the trigger exposes popup semantics via
    // aria-haspopup + aria-expanded alone.
    await expect(originTrigger).not.toHaveAttribute("aria-controls", /./);
    await expect(destTrigger).not.toHaveAttribute("aria-controls", /./);

    // Closed initially.
    await expect(originTrigger).toHaveAttribute("aria-expanded", "false");

    // Open via keyboard and check combobox pattern.
    await originTrigger.focus();
    await page.keyboard.press("Enter");
    await expect(originTrigger).toHaveAttribute("aria-expanded", "true");

    const searchInput = page.locator("#origin-combobox-input");
    const listboxId = await searchInput.getAttribute("aria-controls");
    expect(listboxId).toBeTruthy();
    const listbox = page.locator(`#${listboxId}`);
    await expect(listbox).toHaveAttribute("role", "listbox");

    await expect(searchInput).toHaveAttribute("role", "combobox");
    await expect(searchInput).toHaveAttribute("aria-controls", listboxId!);
    await expect(searchInput).toBeFocused();
    // Orphan inputId fix (#43): sr-only <label> points at the filter input.
    const inputId = await searchInput.getAttribute("id");
    expect(inputId).toBeTruthy();
    await expect(page.locator(`label[for="${inputId}"]`)).toBeAttached();

    // Type to filter; options expose role=option with selection state.
    await searchInput.fill("تجریش");
    const firstOption = listbox.getByRole("option").first();
    await expect(firstOption).toBeVisible({ timeout: 10_000 });
    await expect(firstOption).toHaveAttribute("aria-selected", "false");
    // Options use the li[role=option] pattern (#43): not in the Tab order,
    // navigated via Arrow keys with aria-activedescendant.
    await expect(firstOption).toHaveJSProperty("tagName", "LI");
    await expect(firstOption).not.toHaveAttribute("tabindex", "0");

    // Arrow-key navigation moves aria-activedescendant without moving focus (#43).
    await page.keyboard.press("ArrowDown");
    const activeId = await searchInput.getAttribute("aria-activedescendant");
    expect(activeId).toBeTruthy();
    const activeOption = page.locator(`#${activeId}`);
    await expect(activeOption).toHaveAttribute("role", "option");
    await expect(searchInput).toBeFocused();
    // Enter selects the active descendant and restores focus to the trigger.
    await page.keyboard.press("Enter");
    await expect(originTrigger).toHaveAttribute("aria-expanded", "false");
    await expect(originTrigger).toBeFocused();
    await expect(originTrigger).not.toBeEmpty();

    // Polite live region announces results with localized digits.
    await originTrigger.click();
    await searchInput.fill("تجریش");
    const status = page.locator("#origin-combobox-status");
    await expect(status).toHaveAttribute("aria-live", "polite");
    await expect(status).toContainText("ایستگاه", { timeout: 10_000 });
    // FA locale uses Persian digits (closes #43 live-count item).
    await expect(status).toContainText(/[۰۱۲۳۴۵۶۷۸۹]/, { timeout: 10_000 });

    // Escape closes and restores focus to the trigger.
    await page.keyboard.press("Escape");
    await expect(originTrigger).toHaveAttribute("aria-expanded", "false");
    await expect(originTrigger).toBeFocused();

    // Select a station via click; trigger keeps an accessible name.
    await originTrigger.click();
    await searchInput.fill("تجریش");
    await listbox.getByRole("option").first().click();
    await expect(originTrigger).not.toBeEmpty();

    // Chosen option reports aria-selected=true on reopen.
    await originTrigger.click();
    await searchInput.fill("تجریش");
    const selectedOption = listbox.getByRole("option", { selected: true });
    await expect(selectedOption.first()).toBeVisible({ timeout: 10_000 });
    await expect(selectedOption.first()).toHaveAttribute("aria-selected", "true");

    // No X/clear button in the selectors by design — selection changes
    // by picking another station.
    await expect(page.getByRole("button", { name: "پاک کردن" })).toHaveCount(0);
  });

  test("desktop tabs expose aria-current=page and skip link works", async ({ page }) => {
    await waitForAppReady(page, "/route");
    // Desktop nav (md+) marks the active tab; mobile already did.
    const desktopRouteTab = page.locator('nav.hidden a[href^="/route"]').first();
    // Only assert when the desktop nav is visible (wide viewport).
    if (await desktopRouteTab.isVisible().catch(() => false)) {
      await expect(desktopRouteTab).toHaveAttribute("aria-current", "page");
    }
    const skipLink = page.locator('a[href="#main-content"]').first();
    await expect(skipLink).toBeAttached();
    await skipLink.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();
  });

  test("timetable sheet traps focus and restores it on close", async ({ page }) => {
    await waitForAppReady(page, "/stations");
    // Open the first station's timetable sheet (FA "برنامه" / EN "Timetable").
    const sheetButton = page.getByRole("button", { name: /برنامه|Timetable/ }).first();
    await expect(sheetButton).toBeVisible({ timeout: 15_000 });
    await sheetButton.click();

    const dialog = page.getByRole("dialog").first();
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    // Focus moved inside the dialog on open.
    await expect(dialog.locator("button:not([disabled])").first()).toBeFocused({ timeout: 10_000 });

    // Tab cycles inside the dialog instead of escaping to the page behind.
    const focusedBefore: string[] = [];
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      const label = await page.evaluate(() => {
        const el = document.activeElement;
        return el ? `${el.tagName}#${el.id || ""}.${(el as HTMLElement).className?.toString().slice(0, 40)}` : "none";
      });
      focusedBefore.push(label);
    }
    const escaped = await page.evaluate(() => !document.querySelector('[role="dialog"]')?.contains(document.activeElement));
    expect(escaped).toBe(false);

    // Escape closes and restores focus to the opener.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(sheetButton).toBeFocused();
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
