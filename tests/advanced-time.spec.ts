import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Travel-time card: Now / at-station / arrive-by planning, expanded inline
// in the route form (no modal). Stations ride in via shareable URL params;
// the time plan rides in via ?timeMode=now|depart|arrive&at=ISO (legacy
// links without them mean now). Every change applies immediately.

const FROM = "tajrish";
const TO = "imam-khomeini";

function card(page: import("@playwright/test").Page) {
  return page.getByTestId("travel-time-card");
}

async function expandCard(page: import("@playwright/test").Page) {
  const header = card(page).getByRole("button", { name: /زمان سفر/ });
  if ((await header.getAttribute("aria-expanded")) === "false") {
    await header.click();
  }
  await expect(header).toHaveAttribute("aria-expanded", "true");
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
async function setCardTime(page: import("@playwright/test").Page, target: string) {
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

/** Step the date control until it reads tomorrow (from any nearby date). */
async function pinTomorrow(page: import("@playwright/test").Page) {
  const label = card(page).locator("p[aria-live]");
  for (let i = 0; i < 4; i++) {
    const text = (await label.textContent()) ?? "";
    if (text.includes("فردا")) break;
    if (text.includes("امروز")) {
      await card(page).getByRole("button", { name: "روز بعد" }).click();
    } else {
      await card(page).getByRole("button", { name: "روز قبل" }).click();
    }
  }
  await expect(label).toContainText("فردا");
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

test.describe("travel time card", () => {
  test("legacy link without time params means Now", async ({ page }) => {
    await page.goto(`/route?from=${FROM}&to=${TO}`, { waitUntil: "domcontentloaded" });
    // Collapsed by default with a Now summary…
    const header = card(page).getByRole("button", { name: /زمان سفر/ });
    await expect(header).toBeVisible();
    await expect(header).toHaveAttribute("aria-expanded", "false");
    await expect(header).toContainText("الان · حرکت فوری");
    expect(new URL(page.url()).searchParams.has("timeMode")).toBe(false);
  });

  test("depart-at updates result, URL, and survives reload", async ({ page }) => {
    await page.goto(`/route?from=${FROM}&to=${TO}`, { waitUntil: "domcontentloaded" });
    await expandCard(page);
    // Segmented control applies immediately — no confirmation button.
    await card(page).locator("fieldset").getByText("حرکت در ساعت مشخص", { exact: true }).click();
    await setCardTime(page, "09:00");
    await pinTomorrow(page);

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
    await expandCard(page);
    await card(page).locator("fieldset").getByText("رسیدن تا ساعت مشخص", { exact: true }).click();
    await setCardTime(page, "09:00");
    await pinTomorrow(page);

    expect(new URL(page.url()).searchParams.get("timeMode")).toBe("arrive");
    const arriveBanner = page.getByTestId("plan-banner");
    await expect(arriveBanner).toBeVisible({ timeout: 15_000 });
    await expect(arriveBanner.getByText("رسیدن تا ساعت")).toBeVisible();

    await page.reload({ waitUntil: "domcontentloaded" });
    expect(new URL(page.url()).searchParams.get("timeMode")).toBe("arrive");
    await expect(page.getByTestId("plan-banner")).toBeVisible({ timeout: 15_000 });
  });

  test("active mode and collapse keep the chosen date and time", async ({ page }) => {
    await page.goto(`/route?from=${FROM}&to=${TO}`, { waitUntil: "domcontentloaded" });
    await expandCard(page);
    await card(page).locator("fieldset").getByText("حرکت در ساعت مشخص", { exact: true }).click();
    await setCardTime(page, "09:00");
    await pinTomorrow(page);
    const header = card(page).getByRole("button", { name: /زمان سفر/ });
    // Clicking the already-selected mode is a no-op.
    await card(page).locator("fieldset").getByText("حرکت در ساعت مشخص", { exact: true }).click();
    await expect(page.getByTestId("hour-value")).toHaveText(enToFa("09"));
    // Collapse + reopen preserves everything.
    await header.click();
    await expect(header).toHaveAttribute("aria-expanded", "false");
    await header.click();
    await expect(header).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByTestId("hour-value")).toHaveText(enToFa("09"));
    await expect(page.getByTestId("minute-value")).toHaveText(enToFa("00"));
    await expect(card(page).locator("p[aria-live]")).toContainText("فردا");
    expect(new URL(page.url()).searchParams.get("timeMode")).toBe("depart");
  });

  test("past depart time shows notice with Use-now and Edit-time actions", async ({ page }) => {
    await page.goto(
      `/route?from=${FROM}&to=${TO}&timeMode=depart&at=2020-01-01T05:30:00.000Z`,
      { waitUntil: "domcontentloaded" },
    );
    await expect(page.getByText("آن زمان گذشته است")).toBeVisible({ timeout: 15_000 });
    // Edit time expands the inline card instead of forcing now.
    await page.getByRole("button", { name: "ویرایش زمان" }).click();
    await expect(
      card(page).getByRole("button", { name: /زمان سفر/ }),
    ).toHaveAttribute("aria-expanded", "true");
    await page.getByRole("button", { name: "استفاده از الان" }).click();
    await expect(card(page).getByRole("button", { name: /زمان سفر/ })).toContainText(
      "الان · حرکت فوری",
    );
    expect(new URL(page.url()).searchParams.has("timeMode")).toBe(false);
  });

  test("past arrive-by shows the new passed copy without routing", async ({ page }) => {
    await page.goto(
      `/route?from=${FROM}&to=${TO}&timeMode=arrive&at=2020-01-01T05:30:00.000Z`,
      { waitUntil: "domcontentloaded" },
    );
    await expect(page.getByText("این زمان گذشته است")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("دیگر دیر شده")).toBeVisible();
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
    // Primary action expands the inline planner directly.
    await page.getByRole("button", { name: "برنامه‌ریزی برای زمان دیگر" }).click();
    await expect(
      card(page).getByRole("button", { name: /زمان سفر/ }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  test("impossible arrive-by shows the missed-deadline card", async ({ page }) => {
    // Tajrish → Karaj takes ~1h on every timetable: a 20-minute deadline can
    // never be met. Overnight (no remaining service today) the same URL
    // degrades to the no-service card instead — both expand the planner.
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
      await expect(
        card(page).getByRole("button", { name: /زمان سفر/ }),
      ).toHaveAttribute("aria-expanded", "true");
      await page.getByRole("button", { name: "مسیر از الان" }).click();
      expect(new URL(page.url()).searchParams.has("timeMode")).toBe(false);
    } else {
      // Overnight branch: no service at all right now.
      await planAhead.click();
      await expect(
        card(page).getByRole("button", { name: /زمان سفر/ }),
      ).toHaveAttribute("aria-expanded", "true");
    }
  });

  test("keyboard: header toggles, arrows move between modes", async ({ page }) => {
    await page.goto(`/route?from=${FROM}&to=${TO}`, { waitUntil: "domcontentloaded" });
    const header = card(page).getByRole("button", { name: /زمان سفر/ });
    await header.focus();
    await page.keyboard.press("Enter");
    await expect(header).toHaveAttribute("aria-expanded", "true");
    const nowRadio = card(page).getByRole("radio", { name: "حرکت فوری" });
    await nowRadio.focus();
    // ArrowDown always advances in DOM order (direction-independent).
    await page.keyboard.press("ArrowDown");
    await expect(
      card(page).getByRole("radio", { name: "حرکت در ساعت مشخص" }),
    ).toBeChecked();
    expect(new URL(page.url()).searchParams.get("timeMode")).toBe("depart");
    await header.focus();
    await page.keyboard.press("Enter");
    await expect(header).toHaveAttribute("aria-expanded", "false");
  });

  test("axe: expanded card has no serious/critical violations", async ({ page }) => {
    await page.goto(`/route?from=${FROM}&to=${TO}`, { waitUntil: "domcontentloaded" });
    await expandCard(page);
    // Scoped to the card: the route panel behind it has pre-existing
    // muted-foreground contrast notes outside this feature's scope.
    const results = await new AxeBuilder({ page })
      .include('[data-testid="travel-time-card"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(blocking.map((v) => `${v.id} (${v.impact}): ${v.help}`)).toEqual([]);
  });
});

test.describe("travel time card (English)", () => {
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
    const header = card(page).getByRole("button", { name: /Travel time/ });
    await expect(header).toBeVisible();
    await expect(header).toContainText("Now · Leave now");
    await header.click();
    await expect(card(page).getByRole("radio", { name: "Leave now" })).toBeVisible();
    await expect(card(page).getByRole("radio", { name: "Leave at a specific time" })).toBeVisible();
    await expect(card(page).getByRole("radio", { name: "Arrive by a specific time" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.dir)).toBe("ltr");
  });
});
