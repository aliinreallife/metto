import { expect, test } from "@playwright/test";
import { unavailableWalkingApi } from "./helpers/walking";

// Walk suggestion: when walking the whole way beats the metro journey, the
// planner nudges with a walk card above the (still visible) metro result.
// Persian UI by default (no stored lang).

/** Tehran YYYY-MM-DD `days` out, fixed 10:00 (+03:30) — deterministic far-future depart-at. */
function tehranDatePlusDays(days: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(Date.now() + days * 86_400_000);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}T10:00:00+03:30`;
}

test.describe("walk suggestion", () => {
  test.beforeEach(async ({ page }) => {
    // These cases exercise the explicit approximate fallback; street paths
    // and provider failures are covered in pedestrian-routing.spec.ts.
    await unavailableWalkingApi(page);
  });
  test("suggests walking when the metro ride loses (saadi → mellat, 577 m)", async ({
    page,
  }) => {
    // saadi ↔ mellat is ~577 m (~7 min walk) but routes via Imam Khomeini
    // (~17 min). Walking wins on the journey itself, without counting
    // either the future date or the initial train wait.
    const at = tehranDatePlusDays(6);
    await page.goto(
      `/route?from=saadi&to=mellat&timeMode=depart&at=${encodeURIComponent(at)}`,
      { waitUntil: "domcontentloaded" },
    );
    const card = page.getByTestId("walk-suggest");
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card).toContainText("پیاده‌روی شاید سریع‌تر باشد");
    await expect(card).toContainText("۷ دقیقه");
    // The metro result stays below — a nudge, never a replacement.
    await expect(
      page.getByText("ایستگاه", { exact: true }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("stays quiet on long journeys (tajrish → karaj)", async ({ page }) => {
    await page.goto(`/route?from=tajrish&to=karaj`, {
      waitUntil: "domcontentloaded",
    });
    // Route computes synchronously on load; give it a beat, then assert.
    await expect(
      page.getByTestId("travel-time-card"),
    ).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(3_000);
    await expect(page.getByTestId("walk-suggest")).toHaveCount(0);
  });

  test("same station with distinct close pins still suggests walking", async ({
    page,
  }) => {
    // from === to short-circuits routing, but two exact pins ~9 m apart
    // still deserve the walk comparison.
    await page.goto(
      `/route?from=chitgar&to=chitgar&op=35.7265,51.2427,${encodeURIComponent("کوهک")}&dp=35.7265,51.2426,${encodeURIComponent("کوهک")}`,
      { waitUntil: "domcontentloaded" },
    );
    const card = page.getByTestId("walk-suggest");
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card).toContainText("پیاده‌روی بین این دو نقطه");
    // The same-station notice stays too.
    await expect(page.getByText("مبدأ و مقصد یکسان هستند.")).toBeVisible();
  });

  test("counts station access walks: close pins, far stations", async ({
    page,
  }) => {
    // op/dp ~150 m apart but their stations are a long metro ride apart.
    // The access walks alone dwarf the direct walk. Unit tests cover the
    // comparison rules; this exercises the place-pin plumbing.
    const at = tehranDatePlusDays(6);
    await page.goto(
      `/route?from=shahid-ashrafi-esfahani&to=tehran-sadeghiyeh&timeMode=depart&at=${encodeURIComponent(at)}&op=35.7275,51.3346,${encodeURIComponent("مرزداران")}&dp=35.7261,51.3345,${encodeURIComponent("اباذر")}`,
      { waitUntil: "domcontentloaded" },
    );
    const card = page.getByTestId("walk-suggest");
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card).toContainText("پیاده‌روی شاید سریع‌تر باشد");
    await expect(card).toContainText("۲ دقیقه");
  });

  for (const lang of ["en", "fa"] as const) {
    test(`long initial waits keep the metro result and never show a duplicate departure CTA (${lang})`, async ({ page }) => {
      const at = tehranDatePlusDays(6).replace("T10:00", "T00:15");
      await page.clock.setFixedTime(new Date(at));
      await page.addInitScript((language) => localStorage.setItem("lang", language), lang);
      await page.goto("/route?from=tajrish&to=shahid-beheshti", { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("route-summary-stats")).toBeVisible();
      await expect(page.getByTestId("walk-suggest")).toHaveCount(0);
      await expect(page.getByTestId("departure-option")).toHaveCount(0);
    });
  }

  test("map does not compare walking with an unserved metro journey", async ({ page }) => {
    const at = tehranDatePlusDays(6).replace("T10:00:00", "T23:59:00");
    await page.clock.setFixedTime(new Date(at));
    const scheduled = await page.request.get(`/api/route?from=tajrish&to=shahid-beheshti&departAt=${encodeURIComponent(at)}`);
    expect(scheduled.ok()).toBe(true);
    expect((await scheduled.json()).route.status).toBe("no_service");
    const timetable = page.waitForResponse((response) => response.url().endsWith('/schedule-data.json') && response.ok());
    await page.goto(
      '/map?from=tajrish&to=shahid-beheshti&op=35.7275,51.3346,Origin&dp=35.7261,51.3345,Destination',
      { waitUntil: "domcontentloaded" },
    );
    await expect(page.locator('[aria-label="Metro on real map"]')).toBeVisible();
    await (await timetable).finished();
    // Let the loaded dataset notify its subscribers before the absence check.
    await page.waitForTimeout(500);
    await expect(page.getByTestId("map-place-card")).toHaveCount(2);
    await expect(page.getByTestId("walk-suggest")).toHaveCount(0);
  });

  test("same station with identical points stays quiet", async ({ page }) => {
    await page.goto(`/route?from=chitgar&to=chitgar`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByTestId("travel-time-card"),
    ).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(3_000);
    await expect(page.getByTestId("walk-suggest")).toHaveCount(0);
  });
});
