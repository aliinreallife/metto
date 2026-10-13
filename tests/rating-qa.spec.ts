import { expect, test, type Page } from "@playwright/test";

const QA_FROM = "namayeshgah-e-shahr-e-aftab";
const QA_TO = "aghdasiyeh";
const QA_QUERY = `?from=${QA_FROM}&to=${QA_TO}`;
const RATING_KEY = "metto.appRating.v1";
const RATE_HEADING = /از متو راضی هستی[؟?]|Enjoying Metto\?/;

const BASE_STATE = {
  version: 1,
  successCount: 0,
  days: [],
  promptsShown: 0,
  dismissedAtMs: null,
  completed: false,
};

async function clickDesktopTab(page: Page, path: string) {
  const link = page.locator(`nav[aria-label="Main"] a[href^="${path}"]`);
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(new RegExp(`${path.replace("/", "\\/")}(?:\\?|$)`));
}

test.describe("rating QA trigger", () => {
  test("hidden route sequence forces the real prompt on web without mutating rating state", async ({ page }) => {
    await page.addInitScript(
      ({ key, state }) => {
        localStorage.setItem(key, JSON.stringify(state));
      },
      { key: RATING_KEY, state: BASE_STATE },
    );

    await page.goto(`/route${QA_QUERY}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#origin-combobox")).toBeVisible();

    // Follow the same hydrated tab links a real user taps. This both preserves
    // the selected route and guarantees each destination mounted before the
    // next step, which is the contract the session-only QA tracker observes.
    const stationsTab = page.locator('nav[aria-label="Main"] a[href^="/stations"]');
    await expect(stationsTab).toHaveAttribute("href", new RegExp(`from=${QA_FROM}.*to=${QA_TO}`));
    await clickDesktopTab(page, "/stations");
    await clickDesktopTab(page, "/nearby");
    await clickDesktopTab(page, "/map");
    await clickDesktopTab(page, "/route");

    const prompt = page.getByRole("heading", { name: RATE_HEADING });
    await expect(prompt).toBeVisible({ timeout: 15_000 });

    // The ask should be hard to miss: it sits immediately below the three
    // summary cards (stops / wait + travel / arrival), before route details.
    const stats = page.getByTestId("route-summary-stats");
    await expect(stats).toBeVisible();
    const firstAfterStats = stats.locator("xpath=following-sibling::*[1]");
    await expect(
      firstAfterStats.getByRole("heading", { name: RATE_HEADING }),
    ).toBeVisible();

    const storedWhileVisible = await page.evaluate((key) => localStorage.getItem(key), RATING_KEY);
    expect(storedWhileVisible).toBe(JSON.stringify(BASE_STATE));

    await page.getByRole("button", { name: /فعلاً نه|Not now/ }).click();
    await expect(prompt).toHaveCount(0);

    const storedAfterDismiss = await page.evaluate((key) => localStorage.getItem(key), RATING_KEY);
    expect(storedAfterDismiss).toBe(JSON.stringify(BASE_STATE));
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
