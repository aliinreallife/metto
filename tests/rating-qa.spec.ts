import { expect, test, type Page } from "@playwright/test";

const QA_FROM = "namayeshgah-e-shahr-e-aftab";
const QA_TO = "aghdasiyeh";
const RATING_KEY = "metto.appRating.v1";
const RATING_SESSION_KEY = "metto.appRating.session.v1";
const RATE_HEADING = /از متو راضی هستی[؟?]|Enjoying Metto\?/;

const BASE_STATE = {
  version: 1,
  successCount: 0,
  days: [],
  promptsShown: 0,
  dismissedAtMs: null,
  completed: false,
};

/** A future 09:00 Tehran departure, safely inside the planner horizon.
 *
 * This QA route used to rely on "Now", which makes the test legitimately hit
 * the no-service card late in the operating day. Pinning tomorrow morning
 * keeps the rating sequence deterministic and, because the same plan must
 * survive every tab, also regression-tests advanced-time persistence. */
function qaRouteQuery(): string {
  const tomorrow = new Date(Date.now() + 36 * 3_600_000);
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(tomorrow);
  // Tehran is UTC+03:30 year-round; 09:00 local = 05:30Z.
  const at = `${day}T05:30:00.000Z`;
  return `?from=${QA_FROM}&to=${QA_TO}&timeMode=depart&at=${encodeURIComponent(at)}`;
}

async function clickDesktopTab(page: Page, path: string) {
  const link = page.locator(`nav[aria-label="Main"] a[href^="${path}"]`);
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(new RegExp(`${path.replace("/", "\\/")}(?:\\?|$)`));
}

test.describe("rating QA trigger", () => {
  test("hidden route sequence forces the real prompt on web without mutating rating prompt state", async ({ page }) => {
    await page.addInitScript(
      ({ key, state }) => {
        localStorage.setItem(key, JSON.stringify(state));
      },
      { key: RATING_KEY, state: BASE_STATE },
    );

    await page.goto(`/route${qaRouteQuery()}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#origin-combobox")).toBeVisible();

    // Follow the same hydrated tab links a real user taps. The selected route
    // AND advanced-time plan must survive every destination and come back to
    // /route intact; the session-only QA tracker observes the same sequence.
    const stationsTab = page.locator('nav[aria-label="Main"] a[href^="/stations"]');
    await expect(stationsTab).toHaveAttribute("href", new RegExp(`from=${QA_FROM}.*to=${QA_TO}`));
    await expect(stationsTab).toHaveAttribute("href", /timeMode=depart/);
    await clickDesktopTab(page, "/stations");
    await clickDesktopTab(page, "/nearby");
    await clickDesktopTab(page, "/map");
    await clickDesktopTab(page, "/route");

    const finalUrl = new URL(page.url());
    expect(finalUrl.searchParams.get("timeMode")).toBe("depart");
    expect(finalUrl.searchParams.get("at")).toBeTruthy();

    // Let the final successful route finish its normal success bookkeeping,
    // then snapshot the real rating state before the QA prompt's settle delay.
    const stats = page.getByTestId("route-summary-stats");
    await expect(stats).toBeVisible();
    await page.waitForTimeout(100);
    const storedBeforePrompt = await page.evaluate((key) => localStorage.getItem(key), RATING_KEY);
    const sessionBeforePrompt = await page.evaluate((key) => sessionStorage.getItem(key), RATING_SESSION_KEY);

    const prompt = page.getByRole("heading", { name: RATE_HEADING });
    await expect(prompt).toBeVisible({ timeout: 15_000 });

    // The ask should be hard to miss: it sits immediately below the three
    // summary cards (stops / wait + travel / arrival), before route details.
    const firstAfterStats = stats.locator("xpath=following-sibling::*[1]");
    await expect(
      firstAfterStats.getByRole("heading", { name: RATE_HEADING }),
    ).toBeVisible();

    // Forced QA presentation must not touch production prompt bookkeeping.
    // Normal route-success counting above is intentionally allowed to run.
    const storedWhileVisible = await page.evaluate((key) => localStorage.getItem(key), RATING_KEY);
    const sessionWhileVisible = await page.evaluate((key) => sessionStorage.getItem(key), RATING_SESSION_KEY);
    expect(storedWhileVisible).toBe(storedBeforePrompt);
    expect(sessionWhileVisible).toBe(sessionBeforePrompt);

    await page.getByRole("button", { name: /فعلاً نه|Not now/ }).click();
    await expect(prompt).toHaveCount(0);

    const storedAfterDismiss = await page.evaluate((key) => localStorage.getItem(key), RATING_KEY);
    const sessionAfterDismiss = await page.evaluate((key) => sessionStorage.getItem(key), RATING_SESSION_KEY);
    expect(storedAfterDismiss).toBe(storedBeforePrompt);
    expect(sessionAfterDismiss).toBe(sessionBeforePrompt);
  });

  test("eligible web users still do not receive the production automatic prompt", async ({ page }) => {
    const eligible = {
      ...BASE_STATE,
      successCount: 5,
      days: ["2026-10-10", "2026-10-11", "2026-10-12"],
    };
    await page.addInitScript(
      ({ key, state }) => {
        localStorage.setItem(key, JSON.stringify(state));
      },
      { key: RATING_KEY, state: eligible },
    );

    await page.goto("/route?from=tajrish&to=imam-khomeini", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(3_000);

    await expect(
      page.getByRole("heading", { name: RATE_HEADING }),
    ).toHaveCount(0);
  });
});