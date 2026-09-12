import { expect, test, type BrowserContext, type Page } from "@playwright/test";

// Effective-connectivity (verified reachability) regression suite.
// Uses the mobile viewport so the bottom tab bar is exercised.
// never touches live Nominatim/CARTO/Esri/upstream-holiday (intercepted);
// /api/connectivity is served by the real local prod server except where
// a test deliberately breaks it to simulate VPN-style false-online.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

// Effective-connectivity (verified reachability) regression suite.
// never touches live Nominatim/CARTO/Esri/upstream-holiday (intercepted);
// /api/connectivity is served by the real local prod server except where
// a test deliberately breaks it to simulate VPN-style false-online.
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

const THIRD_PARTY = [
  "**://nominatim.openstreetmap.org/**",
  "**://*.arcgisonline.com/**",
  "**://api.timestamp.ir/**",
];

async function blockThirdParty(context: BrowserContext) {
  for (const pattern of THIRD_PARTY) {
    await context.route(pattern, (route) => route.abort("blockedbyclient"));
  }
}

async function mockTiles(context: BrowserContext) {
  await context.route("https://*.basemaps.cartocdn.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/png",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: PNG_1PX,
    }),
  );
}

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

/** The mobile bottom tab bar. */
function bottomNav(page: Page) {
  return page.locator("footer.fixed.bottom-0 nav");
}

function tabLink(page: Page, name: string) {
  return bottomNav(page).getByRole("link", { name, exact: true });
}

async function connectivityOf(page: Page): Promise<string | null> {
  return page.evaluate(
    () =>
      (window as unknown as { __mettoOffline?: { connectivity?: string } })
        .__mettoOffline?.connectivity ?? null,
  );
}

const WARN_TEXT = "آماده نشده است";
const OLD_PREP_TEXT = "در حال آماده";

test.describe("Effective connectivity", () => {
  test("A. online init shows no preparation or ready status", async ({
    context,
  }) => {
    await blockThirdParty(context);
    const page = await context.newPage();
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const status = page.getByTestId("offline-status");
    await expect(status).toBeAttached({ timeout: 60_000 });
    // Sample through the ENTIRE preparing window, not just final state.
    for (let i = 0; i < 60; i++) {
      const phase = await status.getAttribute("data-phase");
      expect(await page.getByText(WARN_TEXT).count()).toBe(0);
      expect(await page.getByText(OLD_PREP_TEXT).count()).toBe(0);
      if (phase !== "preparing") break;
      await page.waitForTimeout(500);
      if (i === 59) throw new Error("never left preparing");
    }
    expect(await status.getAttribute("data-phase")).toBe("ready");
  });

  test("C. brief flap shows no warning flash", async ({ context }) => {
    await blockThirdParty(context);
    // Hold core readiness back so the warning COULD appear (proves grace).
    await context.route("**/schedule-data.json", (route) =>
      route.abort("blockedbyclient"),
    );
    const page = await context.newPage();
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("offline-status")).toBeAttached({
      timeout: 60_000,
    });
    // Offline blip well inside the ~1.75 s warning grace, then recover.
    await context.setOffline(true);
    await page.waitForTimeout(500);
    await context.setOffline(false);
    // Sample through recovery: warning must never have rendered.
    for (let i = 0; i < 12; i++) {
      expect(await page.getByText(WARN_TEXT).count()).toBe(0);
      await page.waitForTimeout(300);
    }
    await context.unroute("**/schedule-data.json");
  });

  test("D. VPN-style false online drives offline UI without browser events", async ({
    context,
  }) => {
    // Break reachability BEFORE the first mount probe. The mount probe
    // fires during hydration — long before any worker can control the
    // page — so interception reliably applies exactly once here. (After
    // a worker takes control, its subrequests bypass route interception;
    // that is a test-observability limit, not an app bug.)
    await blockThirdParty(context);
    await mockTiles(context);
    await context.route("**/api/connectivity", (route) =>
      route.abort("failed"),
    );
    const page = await context.newPage();
    await page.goto("/map", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator('[aria-label="Tehran metro on real map"]'),
    ).toBeVisible({ timeout: 30_000 });

    // Offline UI with zero browser events dispatched in this test.
    await expect(
      page.getByText("بدون اینترنت", { exact: true }),
    ).toBeVisible({ timeout: 15_000 });

    // Diagnostics distinguish link state from effective reachability.
    const diag = await page.evaluate(
      () =>
        (
          window as unknown as {
            __mettoOffline?: Record<string, unknown>;
          }
        ).__mettoOffline,
    );
    expect(diag?.connectivity).toBe("offline");
    expect(diag?.navigatorOnline).toBe(true);

    // Core was ready, so no global warning — only the map banner.
    expect(await page.getByText(WARN_TEXT).count()).toBe(0);
  });

  test("E. visible-only retry recovers without events, redraws once, no reload", async ({
    context,
  }) => {
    await blockThirdParty(context);
    await mockTiles(context);
    // Abort installed before the mount probe so the app starts offline.
    // (Post-control probes bypass interception and hit the live local
    // server — which is exactly what lets the retry below succeed.)
    await context.route("**/api/connectivity", (route) =>
      route.abort("failed"),
    );
    const page = await context.newPage();
    const tileRequests: number[] = [];
    page.on("request", (req) => {
      if (req.url().includes("basemaps.cartocdn.com")) tileRequests.push(Date.now());
    });
    await page.goto("/map", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator('[aria-label="Tehran metro on real map"]'),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText("بدون اینترنت", { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await page.evaluate(() => {
      (window as unknown as { __e2eNoReload?: number }).__e2eNoReload = 1;
    });

    // Still offline well before the ~25 s retry window: no spurious
    // recovery, and no browser event is dispatched anywhere in this test.
    await page.waitForTimeout(10000);
    expect(await connectivityOf(page)).toBe("offline");

    // Evict tiles so the post-recovery redraw must hit the network
    // (observably proving it fired).
    await page.evaluate(() => caches.delete("metto-carto-tiles"));
    tileRequests.length = 0;

    // Only the visible-only retry (~25 s cadence) can notice recovery.
    // Sample connectivity edges meanwhile.
    const edges: string[] = [];
    let last = "offline";
    await expect
      .poll(
        async () => {
          const c = await connectivityOf(page);
          if (c && c !== last) {
            edges.push(`${last}->${c}`);
            last = c;
          }
          return c;
        },
        { timeout: 90_000 },
      )
      .toBe("online");
    // Exactly one offline→online edge (no flapping, single redraw trigger).
    expect(edges.filter((e) => e === "offline->online")).toHaveLength(1);

    // Banner clears, tiles retry after the transition, page never reloaded.
    await expect(
      page.getByText("بدون اینترنت", { exact: true }),
    ).toHaveCount(0);
    await expect
      .poll(() => Promise.resolve(tileRequests.length), {
        timeout: 20_000,
      })
      .toBeGreaterThan(0);
    expect(
      await page.evaluate(
        () => (window as unknown as { __e2eNoReload?: number }).__e2eNoReload,
      ),
    ).toBe(1);
  });

  test("F. foreground resync detects changed reachability", async ({
    context,
  }) => {
    await blockThirdParty(context);
    // Abort installed before the mount probe so the app starts offline.
    await context.route("**/api/connectivity", (route) =>
      route.abort("failed"),
    );
    const page = await context.newPage();
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByTestId("offline-status"),
    ).toBeAttached({ timeout: 60_000 });
    await expect
      .poll(() => connectivityOf(page), { timeout: 15_000 })
      .toBe("offline");

    // Restore reachability at the network layer (the abort is bypassed
    // once the worker controls the page — restoration is what matters),
    // then resync via foreground visibility WITHOUT any online event.
    await context.unroute("**/api/connectivity");
    await page.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    await expect
      .poll(() => connectivityOf(page), { timeout: 15_000 })
      .toBe("online");
  });

  test("connectivity endpoint is never cached", async ({ context }) => {
    await blockThirdParty(context);
    // Disable worker registration for this test via init script: with no
    // worker ever taking control, every probe stays page-initiated and
    // therefore countable. (Worker-initiated subrequests bypass route
    // interception, which would make repeated probes unobservable.) The
    // app runs fine without a controller; nothing here needs precache.
    await context.addInitScript(() => {
      try {
        const container = navigator.serviceWorker;
        if (container) {
          Object.defineProperty(container, "register", {
            value: () => Promise.reject(new Error("e2e: sw disabled")),
            configurable: true,
          });
        }
      } catch {
        // If stubbing fails, the controller assertion below will catch it.
      }
    });
    let hits = 0;
    await context.route("**/api/connectivity", async (route) => {
      hits += 1;
      await route.fallback();
    });
    const page = await context.newPage();
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("offline-status")).toBeAttached({
      timeout: 60_000,
    });
    // Mount probe + forced resync rounds, all observable page-initiated.
    // (No readiness wait here on purpose — readiness needs a controller.)
    await page.evaluate(() => window.dispatchEvent(new Event("pageshow")));
    await page.waitForTimeout(300);
    await page.evaluate(() => window.dispatchEvent(new Event("pageshow")));
    await page.waitForTimeout(300);
    await page.evaluate(() => window.dispatchEvent(new Event("pageshow")));
    await expect
      .poll(() => Promise.resolve(hits), { timeout: 20_000 })
      .toBeGreaterThanOrEqual(3);
    // Guard the observability premise itself: no controller may have
    // existed, otherwise probes could have bypassed interception unseen.
    expect(
      await page.evaluate(() => !!navigator.serviceWorker.controller),
    ).toBe(false);
    // No layer may have stored it: precache, runtime, metto-pages, other.
    const cached = await page.evaluate(async () => {
      const found: string[] = [];
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const req of await cache.keys()) {
          if (req.url.includes("connectivity")) found.push(`${name} :: ${req.url}`);
        }
      }
      return found;
    });
    expect(cached).toEqual([]);
    // And it answers 204 with no-store directly.
    const direct = await page.evaluate(async () => {
      const res = await fetch("/api/connectivity", { cache: "no-store" });
      return {
        status: res.status,
        cc: res.headers.get("cache-control"),
      };
    });
    expect(direct.status).toBe(204);
    expect(direct.cc).toContain("no-store");
  });
});
