import { expect, test, type BrowserContext, type Page } from "@playwright/test";

// Map recovery + deterministic offline banner. Mocked CARTO tiles only,
// no live servers.
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

async function waitForOfflineReady(page: Page) {
  const status = page.getByTestId("offline-status");
  await expect(status).toBeAttached({ timeout: 60_000 });
  await expect
    .poll(
      async () =>
        status.getAttribute("data-phase").then((p) => p ?? "unknown"),
      { timeout: 60_000 },
    )
    .not.toBe("preparing");
  const phase = await status.getAttribute("data-phase");
  expect(["ready", "offline-ready"]).toContain(phase);
}

async function cachedTileCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    try {
      const cache = await caches.open("metto-carto-tiles");
      return (await cache.keys()).length;
    } catch {
      return 0;
    }
  });
}

test.describe("Map reconnect recovery", () => {
  test.beforeEach(async ({ context }: { context: BrowserContext }) => {
    await context.route("https://*.basemaps.cartocdn.com/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "image/png",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: PNG_1PX,
      }),
    );
  });

  test("missing tiles reload on reconnect without pan, zoom, or reload", async ({
    context,
  }) => {
    const page = await context.newPage();
    await page.goto("/map", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator('[aria-label="Tehran metro on real map"]'),
    ).toBeVisible({ timeout: 30_000 });
    await waitForOfflineReady(page);
    // Nudge the view once so tile requests happen while the worker
    // controls the page (initial-load tiles may predate control).
    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.waitForTimeout(1500);
    await expect
      .poll(() => cachedTileCount(page), { timeout: 30_000 })
      .toBeGreaterThan(0);

    // Go offline (dropping the tile mock so fetches genuinely fail) and
    // open a far, never-viewed area via document navigation.
    await context.setOffline(true);
    await context.unroute("https://*.basemaps.cartocdn.com/**");
    await page.goto("/map?map=35.85,51.65,12", {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.locator('[aria-label="Tehran metro on real map"]'),
    ).toBeVisible({ timeout: 30_000 });
    // Failed tiles stay in the DOM without the loaded marker.
    const errorTileSrcs = (): Promise<string[]> =>
      page.evaluate(() =>
        [...document.querySelectorAll("img.leaflet-tile")]
          .filter(
            (img) =>
              !(img as HTMLImageElement).classList.contains(
                "leaflet-tile-loaded",
              ),
          )
          .map((img) => (img as HTMLImageElement).src),
      );
    await expect
      .poll(async () => (await errorTileSrcs()).length, { timeout: 20_000 })
      .toBeGreaterThan(0);
    const failedUrls = await errorTileSrcs();
    expect(failedUrls.length).toBeGreaterThan(0);

    // Record view state, then reconnect WITHOUT any further gesture.
    // Re-register the tile mock to stand in for the restored network so
    // the test stays hermetic (no live tile servers).
    await page.evaluate(() => {
      (window as unknown as { __reconnectMarker?: number }).__reconnectMarker = 1;
    });
    const hrefBefore = page.url();
    await context.setOffline(false);
    await context.route("https://*.basemaps.cartocdn.com/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "image/png",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: PNG_1PX,
      }),
    );

    // The exact previously-failed tiles must load on their own: same view,
    // no pan/zoom/reset — recovery targets what is visible.
    await expect
      .poll(
        async () =>
          page.evaluate(async (srcs: string[]) => {
            const loaded = new Set(
              [...document.querySelectorAll("img.leaflet-tile-loaded")].map(
                (img) => (img as HTMLImageElement).src,
              ),
            );
            return srcs.filter((s) => loaded.has(s)).length;
          }, failedUrls),
        { timeout: 20_000 },
      )
      .toBe(failedUrls.length);

    // No reload, no navigation, no view reset for the recovery itself.
    expect(
      await page.evaluate(
        () => (window as unknown as { __reconnectMarker?: number }).__reconnectMarker,
      ),
    ).toBe(1);
    expect(page.url()).toBe(hrefBefore);
    // Offline banner is gone once back online.
    await expect(
      page.getByText("بدون اینترنت", { exact: true }),
    ).toHaveCount(0);
  });

  test("offline banner tracks connectivity even with cached tiles", async ({
    context,
  }) => {
    const page = await context.newPage();
    await page.goto("/map", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator('[aria-label="Tehran metro on real map"]'),
    ).toBeVisible({ timeout: 30_000 });
    await waitForOfflineReady(page);
    // Same nudge: ensure post-control tile requests exist to cache.
    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.waitForTimeout(1500);
    await expect
      .poll(() => cachedTileCount(page), { timeout: 30_000 })
      .toBeGreaterThan(0);

    // Online: no banner.
    await expect(
      page.getByText("بدون اینترنت", { exact: true }),
    ).toHaveCount(0);

    // Offline: banner appears even though visible tiles serve from cache.
    await context.setOffline(true);
    await expect(
      page.getByText("بدون اینترنت", { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/قبلاً دیده‌اید/)).toBeVisible({
      timeout: 15_000,
    });

    // Model PWA resume: connectivity resync via dispatched events.
    await page.evaluate(() => {
      window.dispatchEvent(new Event("offline"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(
      page.getByText("بدون اینترنت", { exact: true }),
    ).toBeVisible({ timeout: 15_000 });

    // Back online: banner removes itself automatically, no success toast.
    await context.setOffline(false);
    await expect(
      page.getByText("بدون اینترنت", { exact: true }),
    ).toHaveCount(0);
  });

  test("save notice shows once while online, never stacked offline", async ({
    context,
  }) => {
    const page = await context.newPage();
    await page.goto("/map", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator('[aria-label="Tehran metro on real map"]'),
    ).toBeVisible({ timeout: 30_000 });

    // First online visit: informational notice, info styling, no cache words.
    await expect(
      page.getByText("ذخیره برای استفاده آفلاین", { exact: true }),
    ).toBeVisible({ timeout: 15_000 });

    // Dismiss persists: reload online → notice gone.
    await page.getByRole("button", { name: "بستن" }).first().click();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.locator('[aria-label="Tehran metro on real map"]'),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText("ذخیره برای استفاده آفلاین", { exact: true }),
    ).toHaveCount(0);

    // Offline visit shape: offline banner wins, no stacking.
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.getByText("بدون اینترنت", { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await context.setOffline(false);
  });
});
