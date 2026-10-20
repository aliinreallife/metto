import { expect, test, type Page } from "@playwright/test";
import { unavailableWalkingApi } from "./helpers/walking";

// Map label regression: pin labels must follow their pins. Probe-driven
// investigation (fixed camera, moving pins) showed correct behavior; these
// specs lock it so a future engine change cannot silently freeze labels.
// Persian UI by default. Nominatim is intercepted (friendly fallback label).

async function mapReady(page: Page) {
  await expect(page.locator('[aria-label="Metro on real map"]')).toBeVisible({
    timeout: 30_000,
  });
}

async function suppressSaveNotice(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("metto.mapSaveNoticeSeen", "1");
    } catch {
      // Storage unavailable — ignore.
    }
  });
}

/** Screen bbox of the first engine label whose text matches. */
async function labelBox(page: Page, text: string) {
  return page.evaluate((t) => {
    const els = [...document.querySelectorAll(".leaflet-marker-icon")];
    for (const el of els) {
      if ((el.textContent ?? "").trim().startsWith(t)) {
        const b = (el as HTMLElement).getBoundingClientRect();
        return { x: b.x, y: b.y };
      }
    }
    return null;
  }, text);
}

test.describe("map label movement", () => {
  test.beforeEach(async ({ page }) => {
    await unavailableWalkingApi(page);
  });
  test("pending pick label follows re-picks at a fixed camera", async ({
    page,
  }) => {
    await suppressSaveNotice(page);
    await page.route("**://nominatim.openstreetmap.org/**", (route) =>
      route.abort("blockedbyclient"),
    );
    await page.route("**://nominatim.openstreetmap.org/**", (route) =>
      route.abort("blockedbyclient"),
    );
    // Fixed camera, no route, no pins: nothing may move the view here.
    await page.goto("/map?map=35.7000,51.4000,14", {
      waitUntil: "domcontentloaded",
    });
    await mapReady(page);
    await page.waitForTimeout(2_000);
    const box = await page
      .locator('[aria-label="Metro on real map"]')
      .boundingBox();
    expect(box).toBeTruthy();

    await page.mouse.click(box!.x + box!.width * 0.3, box!.y + box!.height * 0.4);
    await expect(page.getByTestId("map-pick-card")).toBeVisible({
      timeout: 10_000,
    });
    const title = "نقطه انتخاب‌شده روی نقشه";
    await expect(page.getByTestId("map-pick-card").locator("h3")).toHaveText(title);
    // The fallback title is now intentionally stable across different pins.
    // Verify movement by geometry, not a coordinate string changing.
    await expect.poll(async () => labelBox(page, title), { timeout: 10_000 }).not.toBeNull();
    const posA = await labelBox(page, title);
    expect(posA).not.toBeNull();

    await page.mouse.click(box!.x + box!.width * 0.75, box!.y + box!.height * 0.7);
    await expect(page.getByTestId("map-pick-card").locator("h3")).toHaveText(title);
    await expect.poll(async () => {
      const next = await labelBox(page, title);
      return next ? Math.hypot(next.x - posA!.x, next.y - posA!.y) : 0;
    }, { timeout: 10_000 }).toBeGreaterThan(200);
    // Re-picking moves the same logical pending label; no duplicate remains.
    await expect(page.locator(".leaflet-marker-icon").filter({ hasText: title })).toHaveCount(1);
  });

  test("origin pin label is replaced on re-pick, dest label untouched", async ({
    page,
  }) => {
    await suppressSaveNotice(page);
    await page.route("**://nominatim.openstreetmap.org/**", (route) =>
      route.abort("blockedbyclient"),
    );
    await page.goto(
      `/map?from=chitgar&to=chitgar&op=35.7265,51.2427,${encodeURIComponent("نقطه الف")}&dp=35.7265,51.2426,${encodeURIComponent("نقطه ب")}`,
      { waitUntil: "domcontentloaded" },
    );
    await mapReady(page);
    // Same-station pins render one merged card with both labels.
    const merged = page.getByTestId("map-place-card");
    await expect(merged).toHaveCount(1, { timeout: 15_000 });
    await expect(merged).toContainText("نقطه الف");
    await expect(merged).toContainText("نقطه ب");
    await expect(merged).toContainText("پیاده‌روی بین این دو نقطه");

    const box = await page
      .locator('[aria-label="Metro on real map"]')
      .boundingBox();
    expect(box).toBeTruthy();
    // Pick far from both pins (top-right corner of the viewport).
    await page.mouse.click(box!.x + box!.width * 0.85, box!.y + box!.height * 0.2);
    await expect(page.getByTestId("map-pick-card")).toBeVisible({
      timeout: 10_000,
    });
    await page
      .getByTestId("map-pick-card")
      .getByRole("button", { name: "تنظیم به‌عنوان مبدأ" })
      .click();
    await expect(page.getByTestId("map-pick-card")).toHaveCount(0);

    // Origin replaced with a far station: back to two separate cards
    // (different stations now), old origin text gone everywhere.
    const cards = page.getByTestId("map-place-card");
    await expect(cards).toHaveCount(2);
    await expect(page.getByText("نقطه الف", { exact: true })).toHaveCount(0);
    await expect(cards.filter({ hasText: "نقطه ب" })).toHaveCount(1);
    const params = new URL(page.url()).searchParams;
    expect(params.get("from")).toBeTruthy();
    expect(params.get("op")).toBeTruthy();
  });
});
