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
  test("/route footer links to the landing and the donate section", async ({
    page,
  }) => {
    await page.goto("/route", { waitUntil: "domcontentloaded" });
    const about = page.getByRole("link", { name: "درباره متو" });
    await expect(about).toBeVisible();
    expect(await about.getAttribute("href")).toBe("/");
    const support = page.getByRole("link", { name: "حمایت" });
    await expect(support).toBeVisible();
    expect(await support.getAttribute("href")).toBe("/#donate");
  });
});
