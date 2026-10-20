import { expect, type BrowserContext, type Page } from "@playwright/test";
import { networkSafeTest as test } from "./helpers/walking";

// Opportunistic CARTO tile cache: mocked tiles only, no live servers.
// Verifies recently-viewed tiles are retained (bounded), served offline,
// and that misses fail cleanly with zero Serwist `no-response` noise while
// Esri/Nominatim stay completely uncached.
// Synthetic provider palette: light land (245) and a gray glyph fill (190).
// Never redistribute a real provider tile as a test fixture.
const PNG_TILE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEklEQVR4nGP4+vXr/3379v0HACDKBxh1s8iSAAAAAElFTkSuQmCC",
  "base64",
);

const TILE_KEY_RE =
  /^https:\/\/[abcd]\.basemaps\.cartocdn\.com\/light_all\/\d+\/\d+\/\d+(@2x)?\.png/;

async function assertReadablePalette(page: Page) {
  const tiles = page.locator(".metto-minimalist-tiles img.leaflet-tile-loaded");
  await expect(tiles).not.toHaveCount(0);
  await expect.poll(() => tiles.evaluateAll((nodes) => {
    const zoom = (node: Element) => Number(new URL((node as HTMLImageElement).src).pathname.split("/")[2]);
    const newest = Math.max(...nodes.map(zoom));
    // Leaflet retains old zoom levels during fade-out. Tag a current tile,
    // rather than keeping an index that changes when old tiles are pruned.
    for (const node of nodes) node.removeAttribute("data-contrast-probe");
    const candidate = nodes.find((node) => {
      const tile = node.getBoundingClientRect();
      const map = node.closest(".leaflet-container")!.getBoundingClientRect();
      return zoom(node) === newest && tile.x >= map.x && tile.right <= map.right &&
        tile.y >= map.y && tile.bottom <= map.bottom;
    });
    candidate?.setAttribute("data-contrast-probe", "true");
    return !!candidate;
  }), { timeout: 10_000 }).toBe(true);
  // Isolate the rendered tile from SVG lines/markers while sampling. This
  // tests browser pixels, not just the presence of a CSS filter string.
  const pane = page.locator(".leaflet-tile-pane");
  const original = await pane.evaluate((el) => {
    const old = (el as HTMLElement).style.zIndex;
    (el as HTMLElement).style.zIndex = "9999";
    return old;
  });
  let png: Buffer;
  try {
    await page.waitForTimeout(250); // Leaflet tile fade-in.
    png = await page.locator('[data-contrast-probe="true"]').screenshot({ animations: "disabled", timeout: 10_000 });
  } finally {
    await pane.evaluate((el, value) => { (el as HTMLElement).style.zIndex = value; }, original);
  }
  const { background, glyph } = await page.evaluate(async (bytes) => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    function luminance(x: number) {
      const rgb = ctx.getImageData(Math.floor(bitmap.width * x), Math.floor(bitmap.height / 2), 1, 1).data;
      const linear = Array.from(rgb).slice(0, 3).map((v) => {
        const s = v / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    }
    return { background: luminance(0.125), glyph: luminance(0.875) };
  }, Array.from(png));
  expect(background).toBeLessThan(0.1);
  expect((glyph + 0.05) / (background + 0.05)).toBeGreaterThanOrEqual(4.5);
}

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
  // Playwright 1.48 gates worker request routing behind this flag. Enable
  // it only here: other suites deliberately model page/worker requests
  // differently. Restore it before the next file reuses this worker.
  const workerNetworkFlag = process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS;
  test.beforeAll(() => {
    process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = "1";
  });
  test.afterAll(() => {
    if (workerNetworkFlag === undefined) {
      delete process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS;
    } else {
      process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = workerNetworkFlag;
    }
  });

  test.beforeEach(async ({ context }: { context: BrowserContext }) => {
    // Mock every CARTO tile with a synthetic PNG and real CORS headers
    // (mirrors the live CDN's Access-Control-Allow-Origin: *): realistic
    // headers, zero live use.
    await context.route("https://*.basemaps.cartocdn.com/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "image/png",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: PNG_TILE,
      }),
    );
  });

  test("viewed labeled tiles cached bounded, served offline, misses fail cleanly", async ({
    context,
  }) => {
    const swErrors: string[] = [];
    const page = await context.newPage();
    await page.addInitScript(() => localStorage.setItem("metto.mapSaveNoticeSeen", "1"));
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
        "https://a.basemaps.cartocdn.com/light_all/11/1315/806.png",
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
    expect(entries.every((e) => e.bytes === PNG_TILE.byteLength)).toBe(true);
    expect(await foreignCachedUrls(page)).toEqual([]);
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await assertReadablePalette(page);
    }
    // Camera changes live in component state, not the URL. Reopen the
    // area/zoom just viewed, rather than an uncached default zoom level.
    const offlineUrl = new URL("/map?map=35.7,51.38,13", page.url()).href;

    const after = await storageUsage(page);
    console.log(
      `storage estimate bytes before=${before ?? "n/a"} after=${after ?? "n/a"} tiles=${urls.length}`,
    );

    // Offline: cold revisit serves cached tiles, misses fail handled.
    // Replace success mocks with network failures, including worker
    // fetches. Playwright 1.48 can miss offline emulation for a worker
    // restarted during the cold revisit; never let that reach the CDN.
    await context.unroute("https://*.basemaps.cartocdn.com/**");
    await context.route("https://*.basemaps.cartocdn.com/**", (route) =>
      route.abort("internetdisconnected"),
    );
    await context.setOffline(true);
    await page.close();
    const offlinePage = await context.newPage();
    offlinePage.on("console", (msg) => {
      const text = msg.text();
      if (/no-response|workbox/i.test(text) && !text.includes("[metto Offline]")) {
        swErrors.push(`offline:${msg.type()}: ${text.slice(0, 220)}`);
      }
    });
    await offlinePage.goto(offlineUrl, { waitUntil: "domcontentloaded" });
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
    await assertReadablePalette(offlinePage);

    // Uncached tile offline: exercise the same image-destination worker
    // route as Leaflet. Worker network failures are mocked above, so this
    // must fail without a live fetch or an unhandled Serwist rejection.
    const miss = await offlinePage.evaluate(
      () =>
        new Promise<boolean>((resolve) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
          img.src = "https://a.basemaps.cartocdn.com/light_all/18/1/1.png";
        }),
    );
    expect(miss).toBe(false);
    expect(await foreignCachedUrls(offlinePage)).toEqual([]);
    expect(swErrors).toHaveLength(0);

    await context.setOffline(false);
  });
});
