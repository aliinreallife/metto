import { expect, devices } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { networkSafeTest as test } from "./helpers/walking";

// Emulate iPhone browser signals in the repository's Chromium project;
// the full device descriptor would also switch the browser engine to WebKit.
const { userAgent, viewport, deviceScaleFactor, isMobile, hasTouch } = devices["iPhone 13"];
test.use({ userAgent, viewport, deviceScaleFactor, isMobile, hasTouch });

for (const [lang, colorScheme] of [
  ["fa", "light"], ["en", "light"], ["fa", "dark"], ["en", "dark"],
] as const) {
  test(`iPhone #install shows the visible Safari steps (${lang}, ${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.addInitScript((language) => {
      localStorage.setItem("lang", language);
      localStorage.setItem("route.seen", "1");
    }, lang);
    await page.goto("/#install", { waitUntil: "domcontentloaded" });
    const guide = page.getByRole("region", {
      name: lang === "fa" ? "افزودن به صفحه اصلی" : "Add to Home Screen",
    });
    await expect(guide).toBeVisible();
    await expect(guide).toBeInViewport();
    await expect(guide.getByRole("listitem")).toHaveCount(3);
    await expect(guide).toContainText(lang === "fa" ? "سافاری" : "Safari");
    await expect(guide).toContainText("Open as Web App");
    await expect(page.locator("html")).toHaveAttribute("dir", lang === "fa" ? "rtl" : "ltr");
    await expect(page.locator("#install button:disabled")).toHaveCount(0);
    await expect(page.locator('#install a[href*="cafebazaar"]')).toHaveCount(0);
    expect(new URL(page.url()).hash).toBe("#install");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    // Reveal fades in; audit the settled colors rather than its transient opacity.
    await expect(page.locator("#install div.transition-all").first()).toHaveCSS("opacity", "1");
    const results = await new AxeBuilder({ page }).include("#install")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
}

test("iPad desktop user agent receives the iOS guide", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", { value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15" });
    Object.defineProperty(navigator, "platform", { value: "MacIntel" });
    Object.defineProperty(navigator, "maxTouchPoints", { value: 5 });
  });
  await page.goto("/#install", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: "افزودن به صفحه اصلی" })).toBeVisible();
});

test("installed iOS app shows its status instead of install instructions", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "standalone", { value: true });
  });
  await page.goto("/#install", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("status", { name: /داخل نسخه نصب‌شده وب/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "افزودن به صفحه اصلی" })).toHaveCount(0);
  await expect(page.locator("#install button:disabled")).toHaveCount(0);
});

test("app header uses the same guide with modal focus and Escape support", async ({ page }) => {
  await page.goto("/route", { waitUntil: "domcontentloaded" });
  const trigger = page.getByRole("button", { name: "نصب برنامه", exact: true });
  await trigger.focus();
  await trigger.press("Enter");
  const dialog = page.getByRole("dialog", { name: "افزودن به صفحه اصلی" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("listitem")).toHaveCount(3);
  await expect(dialog).toContainText("Open as Web App");
  const closeIcon = dialog.getByRole("button", { name: "بستن" }).first();
  await expect(closeIcon).toBeFocused();
  // Native modal focus remains within the dialog when tabbing past its end.
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "بستن" }).last()).toBeFocused();
  await page.keyboard.press("Tab");
  // Some browsers briefly focus the modal document before wrapping.
  await page.keyboard.press("Tab");
  expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "بستن" }).last().click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
