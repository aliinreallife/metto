import { expect, test, type BrowserContext, type Page } from "@playwright/test";

// Map recovery + deterministic offline banner. CARTO tiles never touch the
// network here: a test-side image shim rewrites every CARTO <img> assignment
// (healthy data-URL PNG vs guaranteed-404 local URL), so no live servers.
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
    // Deterministic test-side fault injection (no product hooks, no network
    // dependence, no gestures). Every CARTO Leaflet tile <img> assignment is
    // rewritten BEFORE any fetch, so tile outcomes never depend on the
    // network or on service-worker fetch behavior (worker-initiated requests
    // bypass both Playwright offline emulation and route interception):
    // - mode "mock": serve a valid 1px data-URL PNG (healthy tiles, zero
    //   network, nothing cached — cache overlap cannot affect this test).
    // - mode "fail": point at a guaranteed-404 local URL, producing settled
    //   `error` events through the genuine Leaflet tileerror path.
    // The shim starts in "fail" mode so the initial tile set fails with no
    // view change at all; the test flips to "mock" only for the recovery.
    // Each rewrite records the ORIGINAL cartocdn URL, proving a real CARTO
    // tile source was attempted both before and after reconnect. Only
    // SETTLED `error`/`load` events count — never pending DOM class state.
    await context.addInitScript(() => {
      const w = window as unknown as {
        __cartoFault?: {
          mode: "mock" | "fail";
          attempted: string[];
          failed: string[];
          loaded: number;
        };
      };
      w.__cartoFault = { mode: "fail", attempted: [], failed: [], loaded: 0 };
      const CARTO_RE = /basemaps\.cartocdn\.com/;
      const FAIL_URL = "/__e2e_tile_fail__.png";
      const OK_URL =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      const proto = HTMLImageElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, "src");
      if (desc && desc.set && desc.get) {
        const origSet = desc.set;
        const origGet = desc.get;
        Object.defineProperty(proto, "src", {
          configurable: true,
          enumerable: desc.enumerable,
          get(this: HTMLImageElement) {
            return origGet.call(this);
          },
          set(this: HTMLImageElement, v: unknown) {
            const url = String(v);
            if (CARTO_RE.test(url)) {
              const st = (
                window as unknown as {
                  __cartoFault?: {
                    mode: "mock" | "fail";
                    attempted: string[];
                    failed: string[];
                    loaded: number;
                  };
                }
              ).__cartoFault;
              st?.attempted.push(url);
              try {
                this.dataset.cartoShim = "1";
                this.dataset.cartoOriginal = url;
              } catch {
                // dataset best-effort only; events still counted.
              }
              origSet.call(this, st?.mode === "fail" ? FAIL_URL : OK_URL);
              return;
            }
            origSet.call(this, v as string);
          },
        });
      }
      const shimmed = (e: Event): HTMLImageElement | null => {
        const t = e.target as HTMLImageElement | null;
        return t && t.tagName === "IMG" && t.dataset?.cartoShim === "1"
          ? t
          : null;
      };
      document.addEventListener(
        "error",
        (e) => {
          const t = shimmed(e);
          if (!t) return;
          const st = (
            window as unknown as {
              __cartoFault?: { failed: string[] };
            }
          ).__cartoFault;
          st?.failed.push(t.dataset.cartoOriginal ?? t.src);
        },
        true,
      );
      document.addEventListener(
        "load",
        (e) => {
          if (!shimmed(e)) return;
          const st = (
            window as unknown as {
              __cartoFault?: { loaded: number };
            }
          ).__cartoFault;
          if (st) st.loaded += 1;
        },
        true,
      );
    });

    // Hermeticity guard: with every CARTO assignment rewritten above, no
    // cartocdn request may ever issue; abort any that does so a leak fails
    // loudly instead of reaching live servers.
    await context.unroute("https://*.basemaps.cartocdn.com/**");
    await context.route("https://*.basemaps.cartocdn.com/**", (route) =>
      route.abort("blockedbyclient"),
    );
    const cartoRequests: string[] = [];
    const page = await context.newPage();
    page.on("request", (req) => {
      if (req.url().includes("basemaps.cartocdn.com")) {
        cartoRequests.push(req.url());
      }
    });

    type FaultStats = { attempted: string[]; failed: string[]; loaded: number };
    const faultStats = (): Promise<FaultStats> =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __cartoFault?: FaultStats & { mode: string };
            }
          ).__cartoFault ?? { attempted: [], failed: [], loaded: 0 },
      );
    const setFaultMode = (mode: "mock" | "fail"): Promise<void> =>
      page.evaluate((m) => {
        (
          window as unknown as {
            __cartoFault?: { mode: string };
          }
        ).__cartoFault!.mode = m;
      }, mode);
    const effectiveConnectivity = (): Promise<string | null> =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __mettoOffline?: { connectivity?: string };
            }
          ).__mettoOffline?.connectivity ?? null,
      );

    await page.goto("/map", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator('[aria-label="Tehran metro on real map"]'),
    ).toBeVisible({ timeout: 30_000 });
    await waitForOfflineReady(page);

    // Fail-first (no gestures at all): the shim starts in "fail" mode, so
    // the initial tile set genuinely fails through the Leaflet tileerror
    // path while the map itself loads normally (vectors render; planner and
    // readiness never depend on tiles). SETTLED-gate: only `error` events
    // prove failure — in-flight tiles are excluded by requiring every
    // assigned image to have settled.
    await expect
      .poll(
        async () => {
          const s = await faultStats();
          if (s.attempted.length === 0) return 0;
          if (s.failed.length + s.loaded < s.attempted.length) return 0;
          return s.failed.length;
        },
        { timeout: 20_000 },
      )
      .toBeGreaterThan(0);
    const initial = await faultStats();
    expect(initial.attempted.length).toBeGreaterThan(0);
    expect(initial.attempted[0]).toMatch(/basemaps\.cartocdn\.com/);
    expect(initial.failed.length).toBeGreaterThan(0);

    // Effective offline WITHOUT browser offline (worker-initiated fetches
    // ignore offline emulation, and tile outcomes here don't need it):
    // backstop the reachability probe, then dispatch the browser offline
    // event the shared connectivity machine listens for. No pan/zoom/nav.
    await context.route("**/api/connectivity", (route) =>
      route.abort("failed"),
    );
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await expect
      .poll(() => effectiveConnectivity(), { timeout: 15_000 })
      .toBe("offline");
    await expect(
      page.getByText("بدون اینترنت", { exact: true }),
    ).toBeVisible({ timeout: 15_000 });

    // Fail phase needs no gesture: the initial failures above already
    // settled, and the offline window stays short (seconds), far below the
    // ~25 s background retry cadence, so no spurious transition can
    // interleave.
    const before = await faultStats();
    expect(before.failed.length).toBeGreaterThan(0);
    const failedBefore = [...before.failed];

    // Record view state, then reconnect WITHOUT any further gesture: allow
    // retries, restore reachability, and dispatch the browser online event
    // so the product's existing offline→online layer.redraw() fires.
    await page.evaluate(() => {
      (window as unknown as { __reconnectMarker?: number }).__reconnectMarker = 1;
    });
    const hrefBefore = page.url();
    await setFaultMode("mock");
    await context.unroute("**/api/connectivity");
    await page.evaluate(() => window.dispatchEvent(new Event("online")));

    // Effective connectivity recovers through the real probe path.
    await expect
      .poll(() => effectiveConnectivity(), { timeout: 15_000 })
      .toBe("online");

    // The retry proof: NEW CARTO assignments appear with no pan/zoom/nav —
    // only the product's redraw can have issued them — and they settle
    // successfully, including the exact previously-failed tile sources.
    await expect
      .poll(async () => (await faultStats()).attempted.length, {
        timeout: 20_000,
      })
      .toBeGreaterThan(before.attempted.length);
    await expect
      .poll(async () => (await faultStats()).loaded, { timeout: 20_000 })
      .toBeGreaterThan(before.loaded);
    const after = await faultStats();
    expect(
      after.attempted.filter((u) => failedBefore.includes(u)).length,
    ).toBeGreaterThan(0);

    // Failed state clears from the DOM: every visible tile settled loaded.
    await expect
      .poll(
        async () =>
          page.evaluate(
            () =>
              [...document.querySelectorAll("img.leaflet-tile")].filter(
                (img) =>
                  !(img as HTMLImageElement).classList.contains(
                    "leaflet-tile-loaded",
                  ),
              ).length,
          ),
        { timeout: 20_000 },
      )
      .toBe(0);
    await expect(
      page.evaluate(
        () =>
          document.querySelectorAll("img.leaflet-tile-loaded").length,
      ),
    ).resolves.toBeGreaterThan(0);

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
    // No live tile dependency at any point in this test.
    expect(cartoRequests).toEqual([]);
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
