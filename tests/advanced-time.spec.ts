import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Advanced time routing: Now / at-station-at / arrive-by planning.
// Stations ride in via shareable URL params; the time plan rides in via
// ?timeMode=now|depart|arrive&at=ISO (legacy links without them mean now).

const FROM = "tajrish";
const TO = "imam-khomeini";

async function expandAdvanced(page: import("@playwright/test").Page) {
  const header = page.getByRole("button", { name: /مسیریابی پیشرفته/ });
  if ((await header.getAttribute("aria-expanded")) === "false") {
    await header.click();
  }
}

async function openSheet(page: import("@playwright/test").Page) {
  await expandAdvanced(page);
  await page.getByRole("button", { name: "زمان" }).click();
  await expect(page.getByRole("dialog", { name: "برنامه‌ریزی سفر" })).toBeVisible();
}

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
function enToFa(s: string): string {
  return s.replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}
function faToEn(s: string): string {
  return s.replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)));
}

/** Drive the hour/minute steppers to an exact HH:MM (Persian-digit aware).
 * Minutes first: rolling :55 → :00 bumps the hour, so hours go last. */
async function setSheetTime(page: import("@playwright/test").Page, target: string) {
  const [th, tm] = target.split(":").map(Number);
  const hourVal = page.getByTestId("hour-value");
  const minVal = page.getByTestId("minute-value");
  for (let i = 0; i < 14; i++) {
    if (Number(faToEn((await minVal.textContent()) ?? "")) === tm) break;
    await page.getByRole("button", { name: "افزایش دقیقه" }).click();
  }
  for (let i = 0; i < 26; i++) {
    if (Number(faToEn((await hourVal.textContent()) ?? "")) === th) break;
    await page.getByRole("button", { name: "افزایش ساعت" }).click();
  }
  await expect(hourVal).toHaveText(enToFa(String(th).padStart(2, "0")));
  await expect(minVal).toHaveText(enToFa(String(tm).padStart(2, "0")));
}

/** Tomorrow as a Tehran YYYY-MM-DD string (for crafted plan URLs). */
function tehranTomorrow(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(Date.now() + 36 * 3_600_000);
}

test.describe("advanced time routing", () => {
  test("legacy link without time params means Now", async ({ page }) => {
    await page.goto(`/route?from=${FROM}&to=${TO}`, { waitUntil: "domcontentloaded" });
    // Collapsed by default…
    await expect(page.getByRole("button", { name: /مسیریابی پیشرفته/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "زمان" })).toBeHidden();
    // …and the plan inside is Now.
    await expandAdvanced(page);
    await expect(page.getByRole("button", { name: "زمان" })).toContainText("الان");
    expect(new URL(page.url()).searchParams.has("timeMode")).toBe(false);
  });

  test("depart-at updates result, URL, and survives reload", async ({ page }) => {
    await page.goto(`/route?from=${FROM}&to=${TO}`, { waitUntil: "domcontentloaded" });
    await openSheet(page);
    await page.getByRole("radio", { name: /رسیدن به ایستگاه مبدأ/ }).check();
    await setSheetTime(page, "09:00");
    await page.getByRole("button", { name: "فردا", exact: true }).click();
    await page.getByRole("button", { name: "تأیید" }).click();

    const url = new URL(page.url());
    expect(url.searchParams.get("timeMode")).toBe("depart");
    expect(url.searchParams.get("at")).toBeTruthy();

    // Plan banner communicates be-at-station / train / arrival.
    const banner = page.getByTestId("plan-banner");
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(banner.getByText("حضور در ایستگاه تا ساعت")).toBeVisible();

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("plan-banner")).toBeVisible({ timeout: 15_000 });
    expect(new URL(page.url()).searchParams.get("timeMode")).toBe("depart");
  });

  test("arrive-by shows deadline banner and persists", async ({ page }) => {
    await page.goto(`/route?from=${FROM}&to=${TO}`, { waitUntil: "domcontentloaded" });
    await openSheet(page);
    await page.getByRole("radio", { name: /رسیدن به مقصد/ }).check();
    await setSheetTime(page, "09:00");
    await page.getByRole("button", { name: "فردا", exact: true }).click();
    await page.getByRole("button", { name: "تأیید" }).click();

    expect(new URL(page.url()).searchParams.get("timeMode")).toBe("arrive");
    const arriveBanner = page.getByTestId("plan-banner");
    await expect(arriveBanner).toBeVisible({ timeout: 15_000 });
    await expect(arriveBanner.getByText("رسیدن تا ساعت")).toBeVisible();

    await page.reload({ waitUntil: "domcontentloaded" });
    expect(new URL(page.url()).searchParams.get("timeMode")).toBe("arrive");
    await expect(page.getByTestId("plan-banner")).toBeVisible({ timeout: 15_000 });
  });

  test("past depart time shows notice with Use-now and Edit-time actions", async ({ page }) => {
    await page.goto(
      `/route?from=${FROM}&to=${TO}&timeMode=depart&at=2020-01-01T05:30:00.000Z`,
      { waitUntil: "domcontentloaded" },
    );
    await expect(page.getByText("آن زمان گذشته است")).toBeVisible({ timeout: 15_000 });
    // Edit time reopens the sheet instead of forcing now.
    await page.getByRole("button", { name: "ویرایش زمان" }).click();
    await expect(page.getByRole("dialog", { name: "برنامه‌ریزی سفر" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "استفاده از الان" }).click();
    await expandAdvanced(page);
    await expect(page.getByRole("button", { name: "زمان" })).toContainText("الان");
    expect(new URL(page.url()).searchParams.has("timeMode")).toBe(false);
  });

  test("past arrive-by shows passed state without routing", async ({ page }) => {
    await page.goto(
      `/route?from=${FROM}&to=${TO}&timeMode=arrive&at=2020-01-01T05:30:00.000Z`,
      { waitUntil: "domcontentloaded" },
    );
    await expect(page.getByText("آن ساعت رسیدن گذشته است")).toBeVisible({ timeout: 15_000 });
  });

  test("late-night depart shows the no-service card with a plan-ahead action", async ({ page }) => {
    // Last Tajrish departure is 22:00 on every timetable: 23:00 tomorrow
    // has no usable origin service on any day type.
    const at = `${tehranTomorrow()}T23:00:00+03:30`;
    await page.goto(
      `/route?from=${FROM}&to=${TO}&timeMode=depart&at=${encodeURIComponent(at)}`,
      { waitUntil: "domcontentloaded" },
    );
    await expect(page.getByText("در حال حاضر با مترو نمی‌رسید")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("از این ایستگاه سرویسی در دسترس نیست")).toBeVisible();
    // Primary action opens the time planner directly.
    await page.getByRole("button", { name: "برنامه‌ریزی برای زمان دیگر" }).click();
    await expect(page.getByRole("dialog", { name: "برنامه‌ریزی سفر" })).toBeVisible();
  });

  test("impossible arrive-by shows the missed-deadline card", async ({ page }) => {
    // Tajrish → Karaj takes ~1h on every timetable: a 20-minute deadline can
    // never be met. Overnight (no remaining service today) the same URL
    // degrades to the no-service card instead — both open the planner.
    const at = new Date(Date.now() + 20 * 60_000).toISOString();
    await page.goto(
      `/route?from=tajrish&to=karaj&timeMode=arrive&at=${encodeURIComponent(at)}`,
      { waitUntil: "domcontentloaded" },
    );
    await expect(
      page.getByText(/با مترو تا ساعت|در حال حاضر با مترو نمی‌رسید/),
    ).toBeVisible({ timeout: 15_000 });
    const editTime = page.getByRole("button", { name: "ویرایش زمان" });
    const planAhead = page.getByRole("button", { name: "برنامه‌ریزی برای زمان دیگر" });
    if (await editTime.count()) {
      // Missed branch: transport hint + both actions.
      await expect(page.getByText("روش دیگری برای رفت‌وآمد")).toBeVisible();
      await editTime.click();
      await expect(page.getByRole("dialog", { name: "برنامه‌ریزی سفر" })).toBeVisible();
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "مسیر از الان" }).click();
      expect(new URL(page.url()).searchParams.has("timeMode")).toBe(false);
    } else {
      // Overnight branch: no service at all right now.
      await planAhead.click();
      await expect(page.getByRole("dialog", { name: "برنامه‌ریزی سفر" })).toBeVisible();
    }
  });

  test("keyboard: Enter opens, Escape closes", async ({ page }) => {
    await page.goto(`/route?from=${FROM}&to=${TO}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /مسیریابی پیشرفته/ }).focus();
    await page.keyboard.press("Enter");
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
    await expect(page.getByRole("button", { name: /Advanced routing/ })).toBeVisible();
    await page.getByRole("button", { name: /Advanced routing/ }).click();
    await expect(page.getByRole("button", { name: "When" })).toContainText("Now");
    await page.getByRole("button", { name: "When" }).click();
    await expect(page.getByRole("dialog", { name: "Plan your trip" })).toBeVisible();
    await expect(page.getByRole("radio", { name: /At origin station at/ })).toBeVisible();
    await expect(page.getByRole("radio", { name: /Arrive at destination by/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.dir)).toBe("ltr");
  });
});
