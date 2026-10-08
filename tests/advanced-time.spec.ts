import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Advanced time routing: Now / at-station-at / arrive-by planning.
// Stations ride in via shareable URL params; the time plan rides in via
// ?timeMode=now|depart|arrive&at=ISO (legacy links without them mean now).

const FROM = "tajrish";
const TO = "imam-khomeini";

async function openSheet(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "زمان" }).click();
  await expect(page.getByRole("dialog", { name: "برنامه‌ریزی سفر" })).toBeVisible();
}

test.describe("advanced time routing", () => {
  test("legacy link without time params means Now", async ({ page }) => {
    await page.goto(`/route?from=${FROM}&to=${TO}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "زمان" })).toContainText("الان");
    expect(new URL(page.url()).searchParams.has("timeMode")).toBe(false);
  });

  test("depart-at updates result, URL, and survives reload", async ({ page }) => {
    await page.goto(`/route?from=${FROM}&to=${TO}`, { waitUntil: "domcontentloaded" });
    await openSheet(page);
    await page.getByRole("radio", { name: /رسیدن به ایستگاه مبدأ/ }).check();
    await page.getByRole("button", { name: "فردا", exact: true }).click();
    await page.locator('input[type="time"]').fill("09:00");
    await page.getByRole("button", { name: "تأیید" }).click();

    const url = new URL(page.url());
    expect(url.searchParams.get("timeMode")).toBe("depart");
    expect(url.searchParams.get("at")).toBeTruthy();

    // Plan banner communicates be-at-station / train / arrival.
    await expect(page.getByText("حضور در ایستگاه تا ساعت")).toBeVisible({ timeout: 15_000 });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText("حضور در ایستگاه تا ساعت")).toBeVisible({ timeout: 15_000 });
    expect(new URL(page.url()).searchParams.get("timeMode")).toBe("depart");
  });

  test("arrive-by shows deadline banner and persists", async ({ page }) => {
    await page.goto(`/route?from=${FROM}&to=${TO}`, { waitUntil: "domcontentloaded" });
    await openSheet(page);
    await page.getByRole("radio", { name: /رسیدن به مقصد/ }).check();
    await page.getByRole("button", { name: "فردا", exact: true }).click();
    await page.locator('input[type="time"]').fill("09:00");
    await page.getByRole("button", { name: "تأیید" }).click();

    expect(new URL(page.url()).searchParams.get("timeMode")).toBe("arrive");
    await expect(page.getByText("رسیدن تا ساعت")).toBeVisible({ timeout: 15_000 });

    await page.reload({ waitUntil: "domcontentloaded" });
    expect(new URL(page.url()).searchParams.get("timeMode")).toBe("arrive");
    await expect(page.getByText("رسیدن تا ساعت")).toBeVisible({ timeout: 15_000 });
  });

  test("past depart time shows passed state with Use-now action", async ({ page }) => {
    await page.goto(
      `/route?from=${FROM}&to=${TO}&timeMode=depart&at=2020-01-01T05:30:00.000Z`,
      { waitUntil: "domcontentloaded" },
    );
    await expect(page.getByText("این زمان گذشته است")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "استفاده از الان" }).click();
    await expect(page.getByRole("button", { name: "زمان" })).toContainText("الان");
    expect(new URL(page.url()).searchParams.has("timeMode")).toBe(false);
  });

  test("past arrive-by shows passed state without routing", async ({ page }) => {
    await page.goto(
      `/route?from=${FROM}&to=${TO}&timeMode=arrive&at=2020-01-01T05:30:00.000Z`,
      { waitUntil: "domcontentloaded" },
    );
    await expect(page.getByText("این ساعت رسیدن گذشته است")).toBeVisible({ timeout: 15_000 });
  });

  test("keyboard: Enter opens, Escape closes", async ({ page }) => {
    await page.goto(`/route?from=${FROM}&to=${TO}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "زمان" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "برنامه‌ریزی سفر" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "برنامه‌ریزی سفر" })).toBeHidden();
  });

  test("axe: open sheet has no serious/critical violations", async ({ page }) => {
    await page.goto(`/route?from=${FROM}&to=${TO}`, { waitUntil: "domcontentloaded" });
    await openSheet(page);
    // Scoped to the dialog: the route panel behind it has pre-existing
    // muted-foreground contrast notes outside this feature's scope.
    const results = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(blocking.map((v) => `${v.id} (${v.impact}): ${v.help}`)).toEqual([]);
  });
});

test.describe("advanced time routing (English)", () => {
  test.use({ locale: "en-US" });

  test("English labels and LTR layout", async ({ page }) => {
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem("lang", "en");
      } catch {
        // Storage unavailable — premise needs it.
      }
    });
    await page.goto(`/route?from=${FROM}&to=${TO}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "When" })).toContainText("Now");
    await page.getByRole("button", { name: "When" }).click();
    await expect(page.getByRole("dialog", { name: "Plan your trip" })).toBeVisible();
    await expect(page.getByRole("radio", { name: /At origin station at/ })).toBeVisible();
    await expect(page.getByRole("radio", { name: /Arrive at destination by/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.dir)).toBe("ltr");
  });
});
