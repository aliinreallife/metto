import { expect, test, type Page } from "@playwright/test";

// Map route controls: clear-route button + arbitrary point picking.
// Persian UI by default (no stored lang). Nominatim is always intercepted —
// never depend on live geocoding.

const FROM = "tajrish";
const TO = "tehran-sadeghiyeh";

function routeUrl() {
  return (
    `/map?from=${FROM}&to=${TO}` +
    `&op=35.8022,51.4350,${encodeURIComponent("مبدأ تست")}` +
    `&dp=35.7000,51.4000,${encodeURIComponent("مقصد تست")}`
  );
}

async function mapReady(page: Page) {
  await expect(page.locator('[aria-label="Metro on real map"]')).toBeVisible({
    timeout: 30_000,
  });
}

/** Suppress the one-time save notice so it never covers click targets. */
async function suppressSaveNotice(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("metto.mapSaveNoticeSeen", "1");
    } catch {
      // Storage unavailable — notice may show; tests avoid the top stack.
    }
  });
}

function endpointStrokes(page: Page) {
  return page.locator('.leaflet-overlay-pane path[stroke="#cc0e2d"]');
}

/** Click somewhere on the map that is (probably) not a marker. Retries a
 *  few spots; closes a station detail if a dot was hit instead. */
async function clickEmptyMap(page: Page) {
  const mapBox = await page
    .locator('[aria-label="Metro on real map"]')
    .boundingBox();
  expect(mapBox).toBeTruthy();
  const box = mapBox!;
  const candidates = [
    { x: box.x + box.width * 0.85, y: box.y + box.height * 0.25 },
    { x: box.x + box.width * 0.15, y: box.y + box.height * 0.75 },
    { x: box.x + box.width * 0.5, y: box.y + box.height * 0.88 },
  ];
  const pick = page.getByTestId("map-pick-card");
  for (const pt of candidates) {
    await page.mouse.click(pt.x, pt.y);
    try {
      await expect(pick).toBeVisible({ timeout: 2_000 });
      return;
    } catch {
      // Either a station detail opened (dot/label hit) or nothing yet.
    }
    const stationCard = page.getByTestId("map-station-card");
    if (await stationCard.isVisible()) {
      await stationCard.getByRole("button", { name: "بستن" }).click();
    }
  }
  await expect(pick).toBeVisible({ timeout: 5_000 });
}

test.describe("map route controls", () => {
  test("clear removes route, pins, params — planner storage survives", async ({
    page,
  }) => {
    // NOTE: addInitScript serializes the function into the page — it must
    // not close over module variables (they arrive undefined in the
    // browser and the try/catch would silently skip the seed). Inline
    // every literal instead.
    await page.addInitScript(() => {
      try {
        localStorage.setItem("metto.mapSaveNoticeSeen", "1");
        localStorage.setItem("route.from", "tajrish");
        localStorage.setItem("route.to", "tehran-sadeghiyeh");
        localStorage.setItem(
          "route.originPlace",
          JSON.stringify({ lat: 35.8022, lng: 51.435, label: "مبدأ تست" }),
        );
      } catch {
        // Storage unavailable — persistence asserts below are skipped.
      }
    });
    await page.goto(routeUrl(), { waitUntil: "domcontentloaded" });
    await mapReady(page);

    // Seeded route renders: endpoint dots + both place cards + clear button.
    await expect(endpointStrokes(page)).not.toHaveCount(0, {
      timeout: 15_000,
    });
    await expect(page.getByTestId("map-place-card")).toHaveCount(2, {
      timeout: 15_000,
    });
    const clearBtn = page.getByTestId("map-clear-route");
    await expect(clearBtn).toBeVisible();
    await expect(clearBtn).toHaveAttribute("aria-label", "پاک کردن مسیر");

    await clearBtn.click();

    // Overlay, cards and params are gone…
    await expect(endpointStrokes(page)).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByTestId("map-place-card")).toHaveCount(0);
    await expect(page.getByTestId("map-pick-card")).toHaveCount(0);
    await expect(clearBtn).toHaveCount(0);
    const params = new URL(page.url()).searchParams;
    for (const k of [
      "from",
      "to",
      "op",
      "dp",
      "oPlat",
      "oPlng",
      "oPlabel",
      "dPlat",
      "dPlng",
      "dPlabel",
      "station",
    ]) {
      expect(params.has(k)).toBe(false);
    }
    // …but planner persistence is untouched.
    expect(await page.evaluate(() => localStorage.getItem("route.from"))).toBe(
      FROM,
    );
    expect(await page.evaluate(() => localStorage.getItem("route.to"))).toBe(
      TO,
    );
    expect(
      await page.evaluate(() => localStorage.getItem("route.originPlace")),
    ).toContain("مبدأ تست");
  });

  test("clear control hides when there is nothing to clear", async ({
    page,
  }) => {
    await suppressSaveNotice(page);
    await page.goto("/map", { waitUntil: "domcontentloaded" });
    await mapReady(page);
    await expect(page.getByTestId("map-clear-route")).toHaveCount(0);
  });

  test("pick point → set as origin writes from + exact op pin", async ({
    page,
  }) => {
    await suppressSaveNotice(page);
    // Nominatim fails → coordinate fallback label.
    await page.route("**://nominatim.openstreetmap.org/**", (route) =>
      route.abort("blockedbyclient"),
    );
    await page.goto("/map", { waitUntil: "domcontentloaded" });
    await mapReady(page);

    await clickEmptyMap(page);
    const pick = page.getByTestId("map-pick-card");
    await expect(pick).toContainText("انتخاب این نقطه");
    await expect(pick).toContainText("نزدیک‌ترین ایستگاه");
    // Coordinate fallback while geocoding fails.
    const title = (await pick.locator("h3").textContent()) ?? "";
    expect(title).toMatch(/^\d{2}\.\d{4}, \d{2}\.\d{4}$/);
    const [pickLat, pickLng] = title.split(",").map(Number);

    await pick.getByRole("button", { name: "تنظیم به‌عنوان مبدأ" }).click();

    const url = new URL(page.url());
    expect(url.pathname).toBe("/map");
    expect(url.searchParams.get("from")).toBeTruthy();
    const op = url.searchParams.get("op");
    expect(op).toBeTruthy();
    const [opLat, opLng] = op!.split(",").slice(0, 2).map(Number);
    // Exact clicked coordinate survives (4dp pin encoding).
    expect(opLat).toBeCloseTo(pickLat, 4);
    expect(opLng).toBeCloseTo(pickLng, 4);
    await expect(pick).toHaveCount(0);
    // Origin pin card renders for the new endpoint.
    await expect(page.getByTestId("map-place-card")).toHaveCount(1, {
      timeout: 15_000,
    });
  });

  test("pick point → set as destination redraws route, stays on /map", async ({
    page,
  }) => {
    await suppressSaveNotice(page);
    await page.route("**://nominatim.openstreetmap.org/**", (route) =>
      route.abort("blockedbyclient"),
    );
    await page.goto(`/map?from=${FROM}`, { waitUntil: "domcontentloaded" });
    await mapReady(page);

    await clickEmptyMap(page);
    const pick = page.getByTestId("map-pick-card");
    // Origin already present → destination is the emphasized primary.
    await pick.getByRole("button", { name: "تنظیم به‌عنوان مقصد" }).click();

    const url = new URL(page.url());
    expect(url.pathname).toBe("/map");
    expect(url.searchParams.get("from")).toBe(FROM);
    expect(url.searchParams.get("to")).toBeTruthy();
    expect(url.searchParams.get("dp")).toBeTruthy();
    await expect(pick).toHaveCount(0);
    // Both endpoints set → route overlay redraws in place.
    await expect(endpointStrokes(page)).not.toHaveCount(0, {
      timeout: 15_000,
    });
  });

  test("resolved reverse-geocode label shows in the pick card", async ({
    page,
  }) => {
    await suppressSaveNotice(page);
    await page.route("**://nominatim.openstreetmap.org/**", (route) => {
      if (route.request().url().includes("/reverse?")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            address: { neighbourhood: "نارمک" },
          }),
        });
      }
      return route.abort("blockedbyclient");
    });
    await page.goto("/map", { waitUntil: "domcontentloaded" });
    await mapReady(page);

    await clickEmptyMap(page);
    const pick = page.getByTestId("map-pick-card");
    await expect(pick.locator("h3")).toContainText("نارمک", {
      timeout: 15_000,
    });
  });

  test("station dot click opens detail, never a pick card", async ({
    page,
  }) => {
    await suppressSaveNotice(page);
    await page.goto(`/map?from=${FROM}&to=${TO}`, {
      waitUntil: "domcontentloaded",
    });
    await mapReady(page);
    const dot = page.locator(".metro-station-dot").first();
    await expect(dot).toBeAttached({ timeout: 15_000 });
    await dot.click({ force: true });

    await expect(page.getByTestId("map-station-card")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("map-pick-card")).toHaveCount(0);
  });

  test("map control clicks and drags never pick", async ({ page }) => {
    await suppressSaveNotice(page);
    await page.goto("/map", { waitUntil: "domcontentloaded" });
    await mapReady(page);
    const pick = page.getByTestId("map-pick-card");

    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.waitForTimeout(1_000);
    await expect(pick).toHaveCount(0);

    const mapBox = await page
      .locator('[aria-label="Metro on real map"]')
      .boundingBox();
    expect(mapBox).toBeTruthy();
    const cx = mapBox!.x + mapBox!.width / 2;
    const cy = mapBox!.y + mapBox!.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 220, cy + 120, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(1_500);
    await expect(pick).toHaveCount(0);
  });

  test("same-station pins draw one direct walk line, no station stubs", async ({
    page,
  }) => {
    await suppressSaveNotice(page);
    await page.goto(
      `/map?from=chitgar&to=chitgar&op=35.7265,51.2427,${encodeURIComponent("کوهک")}&dp=35.7265,51.2426,${encodeURIComponent("کوهک")}`,
      { waitUntil: "domcontentloaded" },
    );
    await mapReady(page);
    const overlay = ".leaflet-overlay-pane";
    // Single neutral pin-to-pin line…
    await expect(
      page.locator(`${overlay} path[stroke="#a3a3a3"]`),
    ).toHaveCount(1, { timeout: 15_000 });
    // …instead of the green/red pin-to-station stubs.
    await expect(
      page.locator(`${overlay} path[stroke="#22c55e"]`),
    ).toHaveCount(0);
    await expect(
      page.locator(`${overlay} path[stroke="#ef4444"]`),
    ).toHaveCount(0);
  });
});
