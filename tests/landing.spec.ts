import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Landing/app URL scheme: / is the standalone landing page, /route is the
// route planner. Old URLs keep working via permanent redirects:
// /welcome → / and /?from=…&to=… → /route (query preserved).

test.describe("landing page", () => {
  test("/ renders the standalone landing (no app tab bar)", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    // Hero headline actually paints (guards against collapsed sections:
    // Reveal content is opacity-0 until its observer fires, so an
    // invisible hero fails here instead of slipping through).
    await expect(page.locator("#hero h1")).toBeVisible({ timeout: 15_000 });
    // Hero CTA into the app.
    await expect(
      page.getByRole("link", { name: "شروع مسیریابی" }).first(),
    ).toBeVisible({ timeout: 15_000 });
    // Donate section lives on the landing page.
    await expect(page.locator("#donate")).toBeAttached();
    // Exactly one <main>, and no app bottom tab bar.
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.locator("footer.fixed.bottom-0")).toHaveCount(0);
  });

  test("axe: / has no serious/critical violations", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
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

  test("plain / does not redirect", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(new URL(page.url()).pathname).toBe("/");
  });

  test("returning visitor skips the landing straight to /route", async ({
    context,
    page,
  }) => {
    // Seed the flag the planner sets on mount (route.seen).
    await context.addInitScript(() => {
      try {
        window.localStorage.setItem("route.seen", "1");
      } catch {
        // Storage unavailable — the test premise needs it.
      }
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect
      .poll(() => Promise.resolve(new URL(page.url()).pathname), {
        timeout: 15_000,
      })
      .toBe("/route");
    // And the planner actually boots there.
    await expect(page.locator("#origin-combobox")).toBeVisible({
      timeout: 15_000,
    });
  });
});

test.describe("old-link redirects", () => {
  test("/welcome redirects to /", async ({ page }) => {
    await page.goto("/welcome", { waitUntil: "domcontentloaded" });
    expect(new URL(page.url()).pathname).toBe("/");
    await expect(
      page.getByRole("link", { name: "شروع مسیریابی" }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("/welcome?lang=en keeps its query", async ({ page }) => {
    await page.goto("/welcome?lang=en", { waitUntil: "domcontentloaded" });
    const url = new URL(page.url());
    expect(url.pathname).toBe("/");
    expect(url.searchParams.get("lang")).toBe("en");
  });

  test("old share link /?from&to opens the route on /route", async ({
    page,
  }) => {
    await page.goto("/?from=tajrish&to=tehran-sadeghiyeh", {
      waitUntil: "domcontentloaded",
    });
    const url = new URL(page.url());
    expect(url.pathname).toBe("/route");
    expect(url.searchParams.get("from")).toBe("tajrish");
    expect(url.searchParams.get("to")).toBe("tehran-sadeghiyeh");
    // Arrival stat proves the route rendered.
    await expect(page.getByText("رسیدن", { exact: true }).first()).toBeVisible(
      { timeout: 30_000 },
    );
  });
});

test.describe("app footer links", () => {
  test("/route footer links to the donate section in one line", async ({
    page,
  }) => {
    await page.goto("/route", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("link", { name: "درباره متو" })).toHaveCount(0);
    const support = page.getByRole("link", { name: "حمایت" });
    await expect(support).toBeVisible();
    expect(await support.getAttribute("href")).toBe("/#donate");
  });

  test("/#donate does not bounce returning visitors back to /route", async ({
    context,
    page,
  }) => {
    await context.addInitScript(() => {
      try {
        window.localStorage.setItem("route.seen", "1");
      } catch {
        // Storage unavailable — the test premise needs it.
      }
    });
    await page.goto("/#donate", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);
    expect(new URL(page.url()).pathname).toBe("/");
    expect(new URL(page.url()).hash).toBe("#donate");
    await expect(page.locator("#donate")).toBeAttached();
  });
});
