import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Production offline suite: real `next start` build + real browser offline.
// Never touches live Nominatim/CARTO/Esri/upstream-holiday (all intercepted).
// Run: pnpm build && pnpm test:e2e:offline
//
// Flow: online setup → readiness → interactive station select + route →
// cold offline reload → route/stations/nearby/map → place-search + holiday
// offline behavior → restore + recover.

const ORIGIN_ID = "tajrish";
const DEST_ID = "tehran-sadeghiyeh";
const ORIGIN_FA = "تجریش";

const THIRD_PARTY = [
  "**://nominatim.openstreetmap.org/**",
  "**://*.arcgisonline.com/**",
  "**://*.basemaps.cartocdn.com/**",
  "**://api.timestamp.ir/**",
];

async function blockThirdParty(
  context: BrowserContext,
  upstreamHits: { count: number },
) {
  for (const pattern of THIRD_PARTY) {
    await context.route(pattern, (route) => {
      if (pattern.includes("timestamp")) upstreamHits.count += 1;
      return route.abort("blockedbyclient");
    });
  }
}

/** Wait until the app declares the offline core ready. */
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

/** Route result is visible (arrival stat + line badge). */
async function expectRouteResult(page: Page) {
  await expect(page.getByText("رسیدن", { exact: true }).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("خط", { exact: false }).first()).toBeVisible();
}

test.describe("Metto offline PWA", () => {
  test.beforeEach(async ({ context }) => {
    // Tehran coordinate for geolocation-dependent paths.
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 35.6892, longitude: 51.389 });
  });

  test("cold offline restart keeps the metro planner working", async ({
    context,
  }) => {
    const upstreamHits = { count: 0 };
    await blockThirdParty(context, upstreamHits);

    // 1-4. Online setup + readiness (silent: no user-facing prep text).
    let page = await context.newPage();
    const offlineLogs: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "debug" && msg.text().includes("[Metto Offline]")) {
        offlineLogs.push(msg.text());
      }
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForOfflineReady(page);
    await expect(
      page.getByText("در حال آماده‌سازی آفلاین"),
    ).toHaveCount(0);
    await expect(
      page.getByText("متو برای استفاده آفلاین آماده است"),
    ).toHaveCount(0);
    await expect(page.getByText("Preparing offline")).toHaveCount(0);
    await expect(
      page.getByText("Metto is ready for offline use"),
    ).toHaveCount(0);
    expect(offlineLogs.length).toBeGreaterThan(0);
    // Healthy run: the registration-failure probe must stay silent.
    expect(
      offlineLogs.filter((l) => l.includes("registration failed")),
    ).toHaveLength(0);
    // No update banner ever: silent lifecycle means no "new version" text
    // and no refresh CTA in the status area.
    await expect(
      page.getByTestId("offline-status").getByText("نسخه جدید"),
    ).toHaveCount(0);
    await expect(
      page.getByTestId("offline-status").getByRole("button"),
    ).toHaveCount(0);

    // 5-7. Interactive station select + route calc (origin via combobox).
    const originToggle = page.getByRole("button", {
      name: /ایستگاه یا نام مکان/,
    });
    await originToggle.first().click();
    const searchInput = page.locator('input[dir="auto"]').first();
    await searchInput.fill(ORIGIN_FA);
    await page
      .getByRole("button", { name: new RegExp(ORIGIN_FA) })
      .first()
      .click();
    await expect(page).toHaveURL(new RegExp(`from=${ORIGIN_ID}`), {
      timeout: 15_000,
    });

    // Destination via shareable URL (same state path as tab switches).
    await page.goto(`/?from=${ORIGIN_ID}&to=${DEST_ID}`, {
      waitUntil: "domcontentloaded",
    });
    await expectRouteResult(page);
    expect(upstreamHits.count).toBe(0);

    // 8-10. Browser-level offline + COLD start of `/` (fresh page in the
    // same profile, exactly like reopening the app — never a warm reload).
    await context.setOffline(true);
    await page.close();
    page = await context.newPage();
    await page.goto("/", { waitUntil: "domcontentloaded" });
    // Cold boot must hydrate schedule + holiday data from cache (not HTTP
    // cache luck) before the planner can run — poll for the steady state.
    await expect
      .poll(
        async () =>
          page
            .getByTestId("offline-status")
            .getAttribute("data-phase")
            .then((p) => p ?? "unknown"),
        { timeout: 60_000 },
      )
      .toBe("offline-ready");

    // 11. Station-to-station route calc while offline (no global offline
    // banner: the planner simply works).
    await page.goto(`/?from=${ORIGIN_ID}&to=${DEST_ID}`, {
      waitUntil: "domcontentloaded",
    });
    await expectRouteResult(page);
    await expect(page.getByText("شما آفلاین هستید")).toHaveCount(0);

    // 12-13. Station search works offline (stations page, direct load).
    await page.goto("/stations", { waitUntil: "domcontentloaded" });
    const stationSearch = page.getByPlaceholder("جستجوی ایستگاه…");
    await expect(stationSearch).toBeVisible({ timeout: 30_000 });
    await stationSearch.fill(ORIGIN_FA);
    await expect(
      page.getByRole("heading", { name: ORIGIN_FA }).first(),
    ).toBeVisible({ timeout: 15_000 });

    // 14. Nearby loads offline; mocked GPS yields local results.
    await page.goto("/nearby", { waitUntil: "domcontentloaded" });
    await page
      .getByRole("button", { name: /موقعیت من|استفاده از موقعیت من/ })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: /.+/ }).first(),
    ).toBeVisible({ timeout: 20_000 });

    // 15-17. Map loads offline, vectors render, basemap note shows.
    await page.goto("/map", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator('[aria-label="Tehran metro on real map"]'),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText("بدون اینترنت", { exact: true }),
    ).toBeVisible({ timeout: 15_000 });

    // 18-20. Landmark search explains the Internet requirement offline.
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page
      .getByRole("button", { name: /ایستگاه یا نام مکان/ })
      .first()
      .click();
    await page.locator('input[dir="auto"]').first().fill("Iran Mall");
    await expect(
      page.getByText("برای جستجوی مکان به اینترنت نیاز است."),
    ).toBeVisible({ timeout: 15_000 });
    // Station search still works alongside the offline place note.
    await page.locator('input[dir="auto"]').first().fill(ORIGIN_FA);
    await expect(
      page.getByRole("button", { name: new RegExp(ORIGIN_FA) }).first(),
    ).toBeVisible({ timeout: 15_000 });

    // 21-23. Holiday info renders offline from the local dataset via the
    // existing timetable UI; routing made zero upstream holiday calls.
    await page.goto("/stations", { waitUntil: "domcontentloaded" });
    await page.getByPlaceholder("جستجوی ایستگاه…").fill(ORIGIN_FA);
    await page.getByRole("button", { name: /برنامه/ }).first().click();
    await expect(page.getByText("تعطیلات رسمی").first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/آخرین بروزرسانی/).first()).toBeVisible();
    expect(upstreamHits.count).toBe(0);

    // 24-25. Restore network; app recovers (ready again, route works).
    await context.setOffline(false);
    await page.goto(`/?from=${ORIGIN_ID}&to=${DEST_ID}`, {
      waitUntil: "domcontentloaded",
    });
    await expectRouteResult(page);
    await expect(page.getByTestId("offline-status")).toHaveAttribute(
      "data-phase",
      /ready|preparing/,
      { timeout: 30_000 },
    );
  });

  test("waiting worker stays silent, never reloads, activates naturally", async ({
    context,
  }) => {
    const page = await context.newPage();
    const swLogs: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "debug" && msg.text().includes("[Metto Offline]")) {
        swLogs.push(msg.text());
      }
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForOfflineReady(page);

    // Marker: any automatic reload would wipe window state.
    await page.evaluate(() => {
      (window as unknown as { __updateProbe?: number }).__updateProbe = 1;
    });

    // Simulate a newly deployed worker: byte-different sw.js on disk, then
    // an update check. It installs and waits (skipWaiting is false) while
    // this page keeps running. Restored afterwards no matter what.
    const swPath = path.join(process.cwd(), "public", "sw.js");
    const originalSw = fs.readFileSync(swPath, "utf8");
    try {
      fs.appendFileSync(swPath, "\n;// e2e simulated release\n");
      await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.getRegistration();
        await reg?.update();
      });
      await expect
        .poll(
          async () =>
            page.evaluate(async () => {
              const reg = await navigator.serviceWorker.getRegistration();
              return reg?.waiting ? reg.waiting.scriptURL : null;
            }),
          { timeout: 30_000 },
        )
        .not.toBeNull();

      // The waiting worker must not interrupt: no reload, no banner, no CTA.
      await page.waitForTimeout(3000);
      expect(
        await page.evaluate(
          () => (window as unknown as { __updateProbe?: number }).__updateProbe,
        ),
      ).toBe(1);
      await expect(
        page.getByTestId("offline-status").getByText("نسخه جدید"),
      ).toHaveCount(0);
      await expect(
        page.getByTestId("offline-status").getByRole("button"),
      ).toHaveCount(0);
      // Console-only diagnostics may note the waiting worker.
      expect(swLogs.some((l) => l.includes("waiting"))).toBe(true);

      // The app remains fully functional while the newer worker waits.
      await page.goto(`/?from=${ORIGIN_ID}&to=${DEST_ID}`, {
        waitUntil: "domcontentloaded",
      });
      await expectRouteResult(page);

      // Old clients disappear → the waiting worker activates naturally, and
      // the next launch is controlled by it. No SKIP_WAITING, no reload loop.
      // If the fresh navigation wins the race and lands on the old worker,
      // it blocks activation itself — reloading retries the navigation at a
      // moment with zero controlled clients, which is also exactly how a
      // real user launch behaves.
      await page.close();
      const page2 = await context.newPage();
      await page2.goto("/", { waitUntil: "domcontentloaded" });
      let settled = false;
      for (let i = 0; i < 6 && !settled; i++) {
        const s = await page2.evaluate(async () => {
          const reg = await navigator.serviceWorker.getRegistration();
          return {
            controlled: !!navigator.serviceWorker.controller,
            waiting: !!reg?.waiting,
          };
        });
        settled = s.controlled && !s.waiting;
        if (!settled) {
          await page2.reload({ waitUntil: "domcontentloaded" });
          await page2.waitForTimeout(2000);
        }
      }
      expect(settled).toBe(true);
      await waitForOfflineReady(page2);
    } finally {
      fs.writeFileSync(swPath, originalSw);
    }
  });

  test("offline with missing core data shows the setup warning", async ({
    context,
  }) => {
    const upstreamHits = { count: 0 };
    await blockThirdParty(context, upstreamHits);

    const page = await context.newPage();
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForOfflineReady(page);

    // Simulate a device whose offline download never finished: evict the
    // datasets from every cache while keeping the app shell.
    await page.evaluate(async () => {
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const req of await cache.keys()) {
          if (
            req.url.includes("schedule-data.json") ||
            (req.url.includes("holidays.json") &&
              !req.url.includes("version"))
          ) {
            await cache.delete(req);
          }
        }
      }
    });

    await context.setOffline(true);
    await page.close();
    const offlinePage = await context.newPage();
    await offlinePage.goto("/", { waitUntil: "domcontentloaded" });
    await expect
      .poll(
        async () =>
          offlinePage
            .getByTestId("offline-status")
            .getAttribute("data-phase")
            .then((p) => p ?? "unknown"),
        { timeout: 60_000 },
      )
      .toBe("offline-incomplete");
    await expect(
      offlinePage.getByText("این دستگاه هنوز برای استفاده آفلاین آماده نشده است"),
    ).toBeVisible({ timeout: 15_000 });
    expect(upstreamHits.count).toBe(0);
  });
});
