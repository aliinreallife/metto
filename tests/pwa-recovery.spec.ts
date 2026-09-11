import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Stale-deploy + recovery suite (production build, real Chromium).
// 1. Online + empty caches → normal render, background preparation, and the
//    Persian "connect to internet" warning is NEVER shown.
// 3. Stale chunk failure → exactly one automatic reload, then visible
//    recovery UI; never a blank page, never a reload loop.
// 4. Deploy (new sw.js) + stale metto-pages → next safe session is
//    controlled by the new worker and stale document caches are gone.
// (2. truly-offline + incomplete caches → warning, and 5. offline nav, are
// covered by tests/offline.spec.ts + tests/offline-nav.spec.ts.)

const INCOMPLETE_WARNING_FA =
  "این دستگاه هنوز برای استفاده آفلاین آماده نشده است";

async function blockThirdParty(context: BrowserContext) {
  for (const pattern of [
    "**://nominatim.openstreetmap.org/**",
    "**://*.arcgisonline.com/**",
    "**://*.basemaps.cartocdn.com/**",
    "**://api.timestamp.ir/**",
  ]) {
    await context.route(pattern, (route) => route.abort("blockedbyclient"));
  }
}

/** Route tab inputs are rendered (origin combobox toggle). */
async function expectRouteInputs(page: Page) {
  await expect(
    page.getByRole("button", { name: /ایستگاه یا نام مکان/ }).first(),
  ).toBeVisible({ timeout: 30_000 });
}

test.describe("PWA recovery", () => {
  test("1. online + empty caches: renders, prepares silently, never warns", async ({
    context,
  }) => {
    await blockThirdParty(context);
    const page = await context.newPage();
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Fresh profile ⇒ empty Cache Storage: prove the precondition.
    const cacheNames: string[] = await page.evaluate(() => caches.keys());
    expect(cacheNames).toEqual([]);

    // Content renders even before readiness settles …
    await expectRouteInputs(page);

    // … and at NO point — preparing, ready, or in between — does the
    // "connect to the internet" warning appear while online.
    const status = page.getByTestId("offline-status");
    await expect(status).toBeAttached({ timeout: 60_000 });
    for (let i = 0; i < 60; i++) {
      expect(await page.getByText(INCOMPLETE_WARNING_FA).count()).toBe(0);
      const phase = await status.getAttribute("data-phase");
      if (phase !== "preparing") break;
      await page.waitForTimeout(500);
      if (i === 59) throw new Error("never left preparing");
    }
    expect(await status.getAttribute("data-phase")).toBe("ready");
    expect(await page.getByText(INCOMPLETE_WARNING_FA).count()).toBe(0);

    // Build identity is exposed for stale-client diagnostics.
    const version = await page.evaluate(
      () =>
        (window as unknown as { __mettoVersion?: { buildId?: string } })
          .__mettoVersion,
    );
    expect(version?.buildId).toBeTruthy();

    // Map tab works too (no blank segment anywhere).
    await page.goto("/map", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator('[aria-label="Tehran metro on real map"]'),
    ).toBeVisible({ timeout: 30_000 });
    expect(await page.getByText(INCOMPLETE_WARNING_FA).count()).toBe(0);
  });

  test("3. chunk failure: one auto-reload, then recovery UI, no loop", async ({
    context,
  }) => {
    await blockThirdParty(context);
    const page = await context.newPage();
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expectRouteInputs(page);

    // Stability marker: any reload wipes window state.
    await page.evaluate(() => {
      (window as unknown as { __e2eStable?: number }).__e2eStable = 1;
    });

    // First stale-chunk failure → the single automatic reload.
    await page.evaluate(() => {
      window.dispatchEvent(
        new ErrorEvent("error", { message: "Loading chunk 123 failed" }),
      );
    });
    // First stale-chunk failure → the single automatic reload. The poll
    // tolerates destroyed execution contexts mid-navigation.
    await expect
      .poll(
        async () => {
          try {
            return await page.evaluate(
              () =>
                (window as unknown as { __e2eStable?: number }).__e2eStable ??
                null,
            );
          } catch {
            return "navigating";
          }
        },
        { timeout: 15_000 },
      )
      .toBeNull();
    // Reloaded page is functional again (not blank).
    await expectRouteInputs(page);
    const retried = await page.evaluate(() => {
      try {
        return sessionStorage.getItem("metto:chunk-retry");
      } catch {
        return null;
      }
    });
    expect(retried).toBe("1");

    // Second failure (reload did not help) → visible recovery UI, NO
    // further automatic reload.
    await page.evaluate(() => {
      (window as unknown as { __e2eStable?: number }).__e2eStable = 1;
      window.dispatchEvent(
        new ErrorEvent("error", {
          message: "Failed to fetch dynamically imported module",
        }),
      );
    });
    await expect(page.getByTestId("chunk-recovery")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("chunk-recovery")).toContainText(
      /بارگذاری تازه|Reload fresh/,
    );
    // Route content is still there behind the card — never a blank page.
    await expectRouteInputs(page);
    // And the page is stable: no reload loop.
    await page.waitForTimeout(4000);
    expect(
      await page.evaluate(
        () => (window as unknown as { __e2eStable?: number }).__e2eStable,
      ),
    ).toBe(1);
    await expect(page.getByTestId("chunk-recovery")).toBeVisible();
  });

  test("4. deploy: next safe session uses the new worker, stale docs purged", async ({
    context,
  }) => {
    await blockThirdParty(context);
    const page = await context.newPage();
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expectRouteInputs(page);
    const status = page.getByTestId("offline-status");
    await expect(status).toBeAttached({ timeout: 60_000 });

    // Seed a stale document-cache entry simulating the previous build.
    await page.evaluate(async () => {
      const cache = await caches.open("metto-pages");
      await cache.put(
        "/__e2e-stale-doc__",
        new Response("stale", {
          headers: { "Content-Type": "text/html" },
        }),
      );
    });

    // Marker: the silent lifecycle must never reload this session.
    await page.evaluate(() => {
      (window as unknown as { __updateProbe?: number }).__updateProbe = 1;
    });

    // Simulate a deploy: byte-different sw.js, then an update check. The
    // new worker installs and waits; the session keeps running untouched.
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

      // Silent: no reload, no banner, no CTA while waiting.
      await page.waitForTimeout(2000);
      expect(
        await page.evaluate(
          () => (window as unknown as { __updateProbe?: number }).__updateProbe,
        ),
      ).toBe(1);
      await expect(
        page.getByTestId("offline-status").getByText("نسخه جدید"),
      ).toHaveCount(0);

      // Safe lifecycle point: closing the page hands control over (no
      // reload involved). Give activation a moment, then launch the next
      // session — it must be controlled with nothing left waiting.
      await page.close();
      await new Promise((r) => setTimeout(r, 3000));
      const page2 = await context.newPage();
      await page2.goto("/", { waitUntil: "domcontentloaded" });
      await expect
        .poll(
          async () =>
            page2.evaluate(async () => {
              const reg = await navigator.serviceWorker.getRegistration();
              return {
                controlled: !!navigator.serviceWorker.controller,
                waiting: !!reg?.waiting,
              };
            }),
          { timeout: 30_000 },
        )
        .toMatchObject({ controlled: true, waiting: false });

      // Stale document caches from the previous build are gone …
      const staleLeft = await page2.evaluate(async () => {
        const out: string[] = [];
        for (const name of await caches.keys()) {
          if (name === "metto-pages" || name.startsWith("metto-pages-")) {
            const cache = await caches.open(name);
            for (const req of await cache.keys()) {
              if (req.url.includes("__e2e-stale-doc__")) {
                out.push(`${name} :: ${req.url}`);
              }
            }
          }
        }
        return out;
      });
      expect(staleLeft).toEqual([]);

      // … and the new session is fully functional with build identity.
      await expectRouteInputs(page2);
      const version = await page2.evaluate(
        () =>
          (window as unknown as { __mettoVersion?: { buildId?: string } })
            .__mettoVersion,
      );
      expect(version?.buildId).toBeTruthy();
    } finally {
      fs.writeFileSync(swPath, originalSw);
    }
  });
});
