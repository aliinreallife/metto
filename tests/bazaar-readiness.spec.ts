import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Bazaar-readiness regressions: the TWA must not expose alternate app
// distribution channels, while normal browser/PWA behavior is unchanged;
// /privacy + donation clarification work in FA and EN.

const MYKET_HREF = "https://myket.ir/app/ir.metto.app";
const BAZAAR_HREF = "https://cafebazaar.ir/app/ir.metto.app";
const DIRECT_APK_HREF = "https://github.com/aliinreallife/metto/releases/latest";

/**
 * Scroll-by-selector that survives React hydration recovery: the landing
 * page can replace DOM nodes once after load (pre-existing live-clock
 * SSR/client skew → error #418 → client re-render), which detaches any
 * previously resolved element handle. Re-querying inside evaluate on every
 * poll retry never holds a stale handle; scroll position itself persists
 * across the re-render, so the subsequent retrying assertions still fire
 * their IntersectionObservers.
 */
async function scrollIntoViewStable(page: Page, selector: string) {
  await expect
    .poll(async () => {
      try {
        return await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (!el) return false;
          el.scrollIntoView({ block: "start" });
          return true;
        }, selector);
      } catch {
        return false;
      }
    })
    .toBe(true);
}

test.describe("install choices: browser vs TWA", () => {
  test("normal browser sees the APK/Myket/Bazaar store choices", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#hero h1")).toBeVisible({ timeout: 15_000 });
    await scrollIntoViewStable(page, "#install");
    await expect(
      page.getByText("اپ اندروید (APK)", { exact: false }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`#install a[href="${MYKET_HREF}"]`)).toBeVisible();
    await expect(page.locator(`#install a[href="${BAZAAR_HREF}"]`)).toBeVisible();
    await expect(page.locator(`#install a[href="${BAZAAR_HREF}"]`)).toContainText("کافه بازار");
    await expect(page.locator(`#install a[href="${BAZAAR_HREF}"]`)).not.toContainText("به‌زودی");
    await expect(
      page.locator(`#install a[href="${DIRECT_APK_HREF}"]`),
    ).toBeVisible();
  });

  test("English website shows the live Cafe Bazaar store", async ({ context, page }) => {
    await context.addInitScript(() => {
      try {
        window.localStorage.setItem("lang", "en");
      } catch {
        // Storage unavailable — the test premise needs it.
      }
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "Metro routing, simple and fast" }),
    ).toBeVisible({ timeout: 15_000 });
    await scrollIntoViewStable(page, "#install");
    const bazaar = page.locator(`#install a[href="${BAZAAR_HREF}"]`);
    await expect(bazaar).toBeVisible();
    await expect(bazaar).toContainText("Cafe Bazaar");
    await expect(bazaar).toContainText("Android");
    await expect(bazaar).not.toContainText("Coming soon");
  });

  test("Android TWA hides the alternate distribution block (no flash)", async ({
    page,
  }) => {
    // ?twa=android is the launcher tag the native wrapper appends.
    await page.goto("/?twa=android", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#hero h1")).toBeVisible({ timeout: 15_000 });
    // The whole stores block (heading + all four store rows) is gone —
    // checked without scrolling, so even a first-paint flash would fail.
    await expect(
      page.getByText("اپ اندروید (APK)", { exact: false }),
    ).toHaveCount(0);
    await expect(page.locator(`#install a[href="${MYKET_HREF}"]`)).toHaveCount(0);
    await expect(page.locator(`#install a[href="${BAZAAR_HREF}"]`)).toHaveCount(0);
    await expect(
      page.locator(`#install a[href="${DIRECT_APK_HREF}"]`),
    ).toHaveCount(0);
    // The install section itself (PWA path) still renders.
    await expect(page.locator("#install")).toBeAttached();
  });
});

test.describe("privacy page", () => {
  test("/privacy renders in FA with the key sections", async ({ page }) => {
    await page.goto("/privacy", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "حریم خصوصی" }),
    ).toBeVisible({ timeout: 15_000 });
    for (const h of ["موقعیت مکانی", "نقشه", "ذخیره‌سازی روی گوشی شما"]) {
      await expect(page.getByRole("heading", { name: h })).toBeAttached();
    }
    await expect(
      page.getByText("حساب کاربری وجود ندارد", { exact: false }),
    ).toBeAttached();
  });

  test("/privacy renders in EN", async ({ context, page }) => {
    await context.addInitScript(() => {
      try {
        window.localStorage.setItem("lang", "en");
      } catch {
        // Storage unavailable — the test premise needs it.
      }
    });
    await page.goto("/privacy", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Privacy" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByRole("heading", { name: "Location" }),
    ).toBeAttached();
  });

  test("axe: /privacy has no serious/critical violations", async ({
    page,
  }) => {
    await page.goto("/privacy", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "حریم خصوصی" }),
    ).toBeVisible({ timeout: 15_000 });
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(
      blocking.map((v) => `${v.id} (${v.impact}): ${v.help}`),
    ).toEqual([]);
  });

  test("/route footer no longer links to /privacy (page still live)", async ({ page }) => {
    await page.goto("/route", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#origin-combobox")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByRole("link", { name: "حریم خصوصی" }),
    ).toHaveCount(0);

    // The page itself stays reachable directly.
    await page.goto("/privacy", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "حریم خصوصی" }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("landing footer no longer links to /privacy", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#hero h1")).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("link", { name: "حریم خصوصی" }),
    ).toHaveCount(0);
  });
});

test.describe("donation clarification", () => {
  test("#donate states support unlocks nothing (FA)", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#hero h1")).toBeVisible({ timeout: 15_000 });
    await scrollIntoViewStable(page, "#donate");
    const note = page.getByText(
      "هیچ قابلیت یا محتوایی در ازای پرداخت باز نمی‌شود",
      { exact: false },
    );
    await expect(note).toBeVisible({ timeout: 10_000 });
  });

  test("#donate states support unlocks nothing (EN)", async ({
    context,
    page,
  }) => {
    await context.addInitScript(() => {
      try {
        window.localStorage.setItem("lang", "en");
      } catch {
        // Storage unavailable — the test premise needs it.
      }
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    // Hydration recovery can briefly leave the FA hero node next to the EN
    // client-rendered one. Select the intended language explicitly instead of
    // using the ambiguous #hero h1 locator.
    await expect(
      page.getByRole("heading", { name: "Metro routing, simple and fast" }),
    ).toBeVisible({ timeout: 15_000 });
    await scrollIntoViewStable(page, "#donate");
    const note = page.getByText("no feature or content is unlocked", {
      exact: false,
    });
    await expect(note).toBeVisible({ timeout: 10_000 });
  });

  test("/route footer says Donate in EN (not Support)", async ({
    context,
    page,
  }) => {
    await context.addInitScript(() => {
      try {
        window.localStorage.setItem("lang", "en");
      } catch {
        // Storage unavailable — the test premise needs it.
      }
    });
    await page.goto("/route", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#origin-combobox")).toBeVisible({
      timeout: 15_000,
    });
    const donate = page.getByRole("link", { name: "Donate" });
    await expect(donate).toBeVisible({ timeout: 10_000 });
    await expect(donate).toHaveAttribute("href", "/#donate");
    await expect(
      page.getByRole("link", { name: "Support", exact: true }),
    ).toHaveCount(0);
  });
});
