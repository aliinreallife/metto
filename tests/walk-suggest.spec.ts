import { expect, test } from "@playwright/test";

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
  test("suggests walking when the metro ride loses (saadi → mellat, 577 m)", async ({
    page,
  }) => {
    // saadi ↔ mellat is ~577 m (~7 min walk) but routes via Imam Khomeini
    // (~17 min). A 6-day-out depart-at makes the metro wait enormous, so the
    // suggestion fires deterministically regardless of timetable.
    const at = tehranDatePlusDays(6);
    await page.goto(
      `/route?from=saadi&to=mellat&timeMode=depart&at=${encodeURIComponent(at)}`,
      { waitUntil: "domcontentloaded" },
    );
    const card = page.getByTestId("walk-suggest");
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card).toContainText("پیاده‌روی سریع‌تر است");
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
});
