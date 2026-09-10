import { expect, test, type BrowserContext } from "@playwright/test";

// Opportunistic CARTO tile cache: mocked tiles only, no live servers.
// Verifies recently-viewed tiles are retained (bounded), served offline,
// and that misses fail cleanly with zero Serwist `no-response` noise while
// Esri/Nominatim stay completely uncached.
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

const TILE_KEY_RE =
  /^https:\/\/[abcd]\.basemaps\.cartocdn\.com\/dark_nolabels\/\d+\/\d+\/\d+(@2x)?\.png/;

async function storageUsage(page: {
  evaluate: <T>(fn: () => Promise<T> | T) => Promise<T>;
}): Promise<number | null> {
  try {
    const usage = await page.evaluate(async () => {
      const estimate = await navigator.storage?.estimate?.();
      return typeof estimate?.usage === "number" ? estimate.usage : null;
    });
    return usage;
  } catch {
    return null;
  }
}

async function tileUrls(page: {
  evaluate: <T>(fn: () => Promise<T> | T) => Promise<T>;
}): Promise<string[]> {
  return page.evaluate(async () => {
    try {
      const cache = await caches.open("metto-carto-tiles");
      return (await cache.keys()).map((r) => r.url);
    } catch {
      return [];
    }
  });
}

async function foreignCachedUrls(page: {
  evaluate: <T>(fn: () => Promise<T> | T) => Promise<T>;
}): Promise<string[]> {
  return page.evaluate(async () => {
    const out: string[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const req of await cache.keys()) {
        if (/arcgisonline|nominatim|timestamp|fpcdn|fingerprint/i.test(req.url)) {
          out.push(req.url);
        }
      }
    }
    return out;
  });
}

test.describe("CARTO opportunistic tile cache", () => {
  test.beforeEach(async ({ context }: { context: BrowserContext }) => {
    // Mock every CARTO tile with a 1px PNG: realistic headers, zero live use.
    await context.route("https://*.basemaps.cartocdn.com/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "image/png",
        body: PNG_1PX,
      }),
    );
  });

  test("viewed tiles cached bounded, served offline, misses fail cleanly", async ({
    context,
  }) => {
    const swErrors: string[] = [];
    const page = await context.newPage();
    page.on("console", (msg) => {
      const text = msg.text();
      if (/no-response|workbox/i.test(text) && !text.includes("[Metto Offline]")) {
        swErrors.push(`${msg.type()}: ${text.slice(0, 220)}`);
      }
    });

    const before = await storageUsage(page);
    await page.goto("/map", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator('[aria-label="Tehran metro on real map"]'),
    ).toBeVisible({ timeout: 30_000 });

    // Generate naturally-viewed tiles by zooming (no prefetch anywhere).
    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "Zoom in" }).click();

    await expect
      .poll(async () => (await tileUrls(page)).length, { timeout: 30_000 })
      .toBeGreaterThan(0);
    const urls = await tileUrls(page);
    // Only genuinely viewed tiles, all matching the narrow rule.
    expect(urls.length).toBeLessThanOrEqual(300);
    expect(urls.every((u) => TILE_KEY_RE.test(u))).toBe(true);
    expect(await foreignCachedUrls(page)).toEqual([]);

    const after = await storageUsage(page);
    console.log(
      `storage estimate bytes before=${before ?? "n/a"} after=${after ?? "n/a"} tiles=${urls.length}`,
    );

    // Offline: cold revisit serves cached tiles, misses fail handled.
    // Drop the tile mock first so offline fetches genuinely fail.
    await context.unroute("https://*.basemaps.cartocdn.com/**");
    await context.setOffline(true);
    await page.close();
    const offlinePage = await context.newPage();
    offlinePage.on("console", (msg) => {
      const text = msg.text();
      if (/no-response|workbox/i.test(text) && !text.includes("[Metto Offline]")) {
        swErrors.push(`offline:${msg.type()}: ${text.slice(0, 220)}`);
      }
    });
    await offlinePage.goto("/map", { waitUntil: "domcontentloaded" });
    await expect(
      offlinePage.locator('[aria-label="Tehran metro on real map"]'),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      offlinePage.getByText(/نقشه پایه به اینترنت نیاز دارد/),
    ).toBeVisible({ timeout: 15_000 });

    // Cached tile returns 200 offline (served by the worker cache).
    const cachedStatus = await offlinePage.evaluate(async (u) => {
      const res = await fetch(u);
      return res.status;
    }, urls[0]);
    expect(cachedStatus).toBe(200);

    // Uncached tile offline: handled failure (fetch rejects to the caller),
    // no unhandled Serwist rejection, banner remains.
    const miss = await offlinePage.evaluate(async () => {
      try {
        const res = await fetch(
          "https://a.basemaps.cartocdn.com/dark_nolabels/18/1/1.png",
        );
        return `status:${res.status}`;
      } catch {
        return "threw";
      }
    });
    expect(miss).toBe("threw");
    expect(await foreignCachedUrls(offlinePage)).toEqual([]);
    expect(swErrors).toHaveLength(0);

    await context.setOffline(false);
  });
});
