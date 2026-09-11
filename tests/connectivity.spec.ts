import { expect, test, type BrowserContext, type Page } from "@playwright/test";

// Effective-connectivity (verified reachability) regression suite.
// Uses the mobile viewport so the bottom tab bar is exercised.
// never touches live Nominatim/CARTO/Esri/upstream-holiday (intercepted);
// /api/connectivity is served by the real local prod server except where
// a test deliberately breaks it at the fetch layer to simulate link-up
// probe failure (blocked endpoint on an otherwise-online device).
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
  return page.locator("div.fixed.bottom-0 nav");
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

/**
 * Fail the reachability probe at the page-fetch layer. Unlike
 * `context.route` aborts (which only affect page-initiated requests and
 * are bypassed once the service worker controls the page), a fetch
 * override fails the probe deterministically before AND after worker
 * takeover — with `navigator.onLine` still true and zero browser events.
 * Flip `window.__e2eConnectivityDown` to false to restore reachability.
 */
async function breakConnectivityProbe(context: BrowserContext) {
  await context.addInitScript(() => {
    const w = window as unknown as {
      __e2eConnectivityDown?: boolean;
    };
    w.__e2eConnectivityDown = true;
    const origFetch = window.fetch.bind(window);
    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      try {
        const url = String(
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : (input as Request).url,
        );
        if (
          url.includes("/api/connectivity") &&
          (window as unknown as { __e2eConnectivityDown?: boolean })
            .__e2eConnectivityDown
        ) {
          return Promise.reject(new Error("e2e: connectivity down"));
        }
      } catch {
        // Fall through to the real fetch on introspection failure.
      }
      return origFetch(input as RequestInfo, init);
    }) as typeof window.fetch;
  });
}

async function restoreConnectivityProbe(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __e2eConnectivityDown?: boolean })
      .__e2eConnectivityDown = false;
  });
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

  test("B. persistently failing probe with link up never warns", async ({
    context,
  }) => {
    // The original desktop bug: a blocked/failing probe endpoint on an
    // otherwise-online device must never produce the "connect to the
    // internet" warning. Break reachability at the page-fetch layer with
    // the link still up, then sample through multiple retry rounds.
    await blockThirdParty(context);
    await breakConnectivityProbe(context);
    const page = await context.newPage();
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // The app renders normally despite the failing probe.
    await expect(
      page.getByRole("button", { name: /ایستگاه یا نام مکان/ }).first(),
    ).toBeVisible({ timeout: 30_000 });

    // ~15 s of sampling (covers the quick retry and beyond): the Persian
    // warning never renders, the phase never enters offline-incomplete,
    // and connectivity never becomes offline.
    const status = page.getByTestId("offline-status");
    await expect(status).toBeAttached({ timeout: 60_000 });
    for (let i = 0; i < 30; i++) {
      expect(await page.getByText(WARN_TEXT).count()).toBe(0);
      const phase = await status.getAttribute("data-phase");
      expect(phase).not.toBe("offline-incomplete");
      expect(await connectivityOf(page)).not.toBe("offline");
      await page.waitForTimeout(500);
    }
    expect(await connectivityOf(page)).toBe("checking");
    expect(await page.getByText(WARN_TEXT).count()).toBe(0);
  });

  test("D. link-up probe failure never drives offline UI", async ({
    context,
  }) => {
    // Same failure shape as B, on the map: no offline banner, no global
    // warning — with zero browser events dispatched in this test.
    await blockThirdParty(context);
    await mockTiles(context);
    await breakConnectivityProbe(context);
    const page = await context.newPage();
    await page.goto("/map", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator('[aria-label="Tehran metro on real map"]'),
    ).toBeVisible({ timeout: 30_000 });

    for (let i = 0; i < 24; i++) {
      await expect(
        page.getByText("بدون اینترنت", { exact: true }),
      ).toHaveCount(0);
      expect(await page.getByText(WARN_TEXT).count()).toBe(0);
      expect(await connectivityOf(page)).not.toBe("offline");
      await page.waitForTimeout(500);
    }

    // Diagnostics distinguish link state from effective reachability:
    // unknown (checking) with the link up — never confirmed offline.
    const diag = await page.evaluate(
      () =>
        (
          window as unknown as {
            __mettoOffline?: Record<string, unknown>;
          }
        ).__mettoOffline,
    );
    expect(diag?.connectivity).toBe("checking");
    expect(diag?.navigatorOnline).toBe(true);

    // The map itself stays fully usable.
    await expect(
      page.locator('[aria-label="Tehran metro on real map"]'),
    ).toBeVisible();
  });

  test("E. checking recovers to online without events, no reload, never offline", async ({
    context,
  }) => {
    await blockThirdParty(context);
    await mockTiles(context);
    // Start unreachable at the page-fetch layer (deterministic before and
    // after worker takeover); recovery is simulated later by restoring the
    // probe — the only signal is the steady retry cadence.
    await breakConnectivityProbe(context);
    const page = await context.newPage();
    await page.goto("/map", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator('[aria-label="Tehran metro on real map"]'),
    ).toBeVisible({ timeout: 30_000 });
    // The link is up, so there is never an offline banner — only unknown.
    await expect(
      page.getByText("بدون اینترنت", { exact: true }),
    ).toHaveCount(0);
    await page.evaluate(() => {
      (window as unknown as { __e2eNoReload?: number }).__e2eNoReload = 1;
    });

    // Still unknown deep into the steady cadence: no spurious offline or
    // online, and no browser event is dispatched anywhere in this test.
    await page.waitForTimeout(10000);
    expect(await connectivityOf(page)).toBe("checking");

    // Restore reachability with no browser event: only the steady retry
    // cadence can notice recovery. Sample connectivity edges meanwhile.
    await restoreConnectivityProbe(page);
    const edges: string[] = [];
    let last = "checking";
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
    // Exactly one checking→online edge (no flapping, no offline in between).
    expect(edges.filter((e) => e === "checking->online")).toHaveLength(1);
    expect(edges.filter((e) => e.includes("offline"))).toHaveLength(0);

    // No banner ever appeared, and the page never reloaded.
    await expect(
      page.getByText("بدون اینترنت", { exact: true }),
    ).toHaveCount(0);
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
    // Start unreachable at the page-fetch layer (deterministic regardless
    // of worker takeover timing).
    await breakConnectivityProbe(context);
    const page = await context.newPage();
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByTestId("offline-status"),
    ).toBeAttached({ timeout: 60_000 });
    await expect
      .poll(() => connectivityOf(page), { timeout: 15_000 })
      .toBe("checking");

    // Restore reachability at the fetch layer, then resync via foreground
    // visibility WITHOUT any online event.
    await restoreConnectivityProbe(page);
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

  // Skipped: asserts that a worker-relayed /api/connectivity failure stays
  // quiet, but requires DevTools offline emulation to fail service-worker-
  // initiated subrequests. In this Chromium, renderer requests honor the
  // emulation (navigator.onLine flips, document loads fail) while worker
  // subrequests still reach the live server (204), so the premise cannot
  // hold here — it fails identically without any app change. The user-
  // visible contract (no unhandled rejection noise, offline verdict from
  // the machine) is covered by D/E/F plus the offline specs.
  test.skip("G. failed probe through the worker is quiet but still fails client-side", async ({
    context,
  }) => {
    await blockThirdParty(context);
    const page = await context.newPage();
    // SW/Serwist unhandled-failure noise only — a genuinely failed request
    // itself (browser-level net::ERR_FAILED) is legitimate probe behavior
    // and is deliberately NOT asserted here.
    const swErrors: string[] = [];
    page.on("console", (msg) => {
      const text = msg.text();
      if (/no-response|workbox/i.test(text) && !text.includes("[Metto Offline]")) {
        swErrors.push(`${msg.type()}: ${text.slice(0, 220)}`);
      }
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("offline-status")).toBeAttached({
      timeout: 60_000,
    });
    // The failing probe must travel through the worker's NetworkOnly route:
    // wait for control first (pre-control failures never reach the worker).
    await expect
      .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), {
        timeout: 30_000,
      })
      .toBe(true);
    // Break the network for one request: the worker must report the failure
    // without an unhandled `no-response` rejection, while the caller still
    // observes a plain network failure (so the probe keeps its offline
    // verdict — never a synthetic success).
    await context.setOffline(true);
    // Wait until offline emulation is observable in-page before probing:
    // a fetch dispatched in the same task as setOffline can otherwise win
    // the race and return the live 204.
    await expect
      .poll(() => page.evaluate(() => navigator.onLine), { timeout: 15_000 })
      .toBe(false);
    const outcome = await page.evaluate(async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await fetch("/api/connectivity", { cache: "no-store" });
          if (attempt === 2) return `status:${res.status}`;
        } catch {
          return "rejected";
        }
        await new Promise((r) => setTimeout(r, 300));
      }
      return "rejected";
    });
    expect(outcome).toBe("rejected");
    // Allow any unhandled worker rejection to surface, then require silence.
    await page.waitForTimeout(3000);
    expect(swErrors).toHaveLength(0);
    await context.setOffline(false);
  });
});
