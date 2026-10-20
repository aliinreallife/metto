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
  /^https:\/\/[abcd]\.basemaps\.cartocdn\.com\/dark_all\/\d+\/\d+\/\d+(@2x)?\.png/;

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

// A controlling worker is the prerequisite for every tile-cache assertion
// below (entries are written only inside the worker). Fresh test profiles
// install ~8MB on first visit; polling here instead of assuming install won
// before the first zoom keeps slow (CI) networks green.
async function waitForSWControl(page: {
  evaluate: <T>(fn: () => Promise<T> | T) => Promise<T>;
}): Promise<void> {
  await expect
    .poll(
      async () =>
        page.evaluate(
          () =>
            typeof navigator !== "undefined" &&
            "serviceWorker" in navigator &&
            !!navigator.serviceWorker.controller,
        ),
      { timeout: 60_000 },
    )
    .toBe(true);
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
    // Mock every CARTO tile with a 1px PNG served with real CORS headers
    // (mirrors the live CDN's Access-Control-Allow-Origin: *): realistic
    // headers, zero live use.
    await context.route("https://*.basemaps.cartocdn.com/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "image/png",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: PNG_1PX,
      }),
    );
  });

  test("viewed labeled tiles cached bounded, served offline, misses fail cleanly", async ({
    context,
  }) => {
    const swErrors: string[] = [];
    const page = await context.newPage();
    page.on("console", (msg) => {
      const text = msg.text();
      if (/no-response|workbox/i.test(text) && !text.includes("[metto Offline]")) {
        swErrors.push(`${msg.type()}: ${text.slice(0, 220)}`);
      }
    });

    const before = await storageUsage(page);
    await page.goto("/map", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator('[aria-label="Metro on real map"]'),
    ).toBeVisible({ timeout: 30_000 });
    await waitForSWControl(page);

    // Generate naturally-viewed tiles by zooming (no prefetch anywhere).
    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "Zoom in" }).click();

    // Leaflet must issue anonymous-CORS tile requests (not no-cors).
    const crossoriginValues = await page.evaluate(() =>
      [...document.querySelectorAll("img.leaflet-tile")].map((img) =>
        img.getAttribute("crossorigin"),
      ),
    );
    expect(crossoriginValues.length).toBeGreaterThan(0);
    expect(crossoriginValues.every((v) => v === "anonymous")).toBe(true);

    // The CDN exposes CORS headers (page fetch is cors-mode by default).
    // Note: `Access-Control-Allow-Origin` itself is not a CORS-safelisted
    // response header, so JS cannot read it back — but a cross-origin fetch
    // resolving with type "cors" proves the CORS check passed (without a
    // valid ACAO header this fetch would reject instead).
    const cdnCors = await page.evaluate(async () => {
      const res = await fetch(
        "https://a.basemaps.cartocdn.com/dark_all/11/1315/806.png",
      );
      return { status: res.status, type: res.type };
    });
    expect(cdnCors).toEqual({ status: 200, type: "cors" });

    await expect
      .poll(async () => (await tileUrls(page)).length, { timeout: 30_000 })
      .toBeGreaterThan(0);
    // Single atomic snapshot: keys + entries together, so tiles cached
    // between two reads cannot skew the assertions.
    const entries = await page.evaluate(async () => {
      const cache = await caches.open("metto-carto-tiles");
      const out: { url: string; status: number; type: string; bytes: number }[] = [];
      for (const req of await cache.keys()) {
        const res = await cache.match(req);
        out.push({
          url: req.url,
          status: res ? res.status : -1,
          type: res ? res.type : "missing",
          bytes: res ? (await res.arrayBuffer()).byteLength : -1,
        });
      }
      return out;
    });
    const urls = entries.map((e) => e.url);
    // Only genuinely viewed tiles, all matching the narrow rule.
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.length).toBeLessThanOrEqual(300);
    expect(urls.every((u) => TILE_KEY_RE.test(u))).toBe(true);
    // Every cached entry is a real CORS response — never opaque.
    expect(entries.every((e) => e.status === 200 && e.type === "cors")).toBe(true);
    expect(entries.some((e) => e.type === "opaque")).toBe(false);
    // Prove the worker used our mock, rather than silently reaching the
    // live CDN (which could otherwise make this test pass on CI).
    expect(entries.every((e) => e.bytes === PNG_1PX.byteLength)).toBe(true);
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
      if (/no-response|workbox/i.test(text) && !text.includes("[metto Offline]")) {
        swErrors.push(`offline:${msg.type()}: ${text.slice(0, 220)}`);
      }
    });
    await offlinePage.goto("/map", { waitUntil: "domcontentloaded" });
    await expect(
      offlinePage.locator('[aria-label="Metro on real map"]'),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      offlinePage.getByText("بدون اینترنت", { exact: true }),
    ).toBeVisible({ timeout: 15_000 });

    // Cached tile loads offline (served by the worker cache). Loaded as an
    // image — the same destination ("image") Leaflet uses — so the request
    // actually routes through the worker: a bare fetch() carries
    // destination "" and never matches the tile route (it only ever passed
    // via the incidental HTTP cache).
    const cachedLoads = await offlinePage.evaluate(
      (u) =>
        new Promise<boolean>((resolve) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
          img.src = u;
        }),
      urls[0],
    );
    expect(cachedLoads).toBe(true);

    // Uncached tile offline: exercise the same image-destination worker
    // route as Leaflet. Worker network emulation is enabled in the config;
    // the mock was removed above, so this must fail without a live fetch
    // or an unhandled Serwist rejection.
    const miss = await offlinePage.evaluate(
      () =>
        new Promise<boolean>((resolve) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
          img.src = "https://a.basemaps.cartocdn.com/dark_all/18/1/1.png";
        }),
    );
    expect(miss).toBe(false);
    expect(await foreignCachedUrls(offlinePage)).toEqual([]);
    expect(swErrors).toHaveLength(0);

    await context.setOffline(false);
  });
});
