import { expect, test, type Page } from "@playwright/test";

// Offline bottom-navigation: tapping static tabs while offline must open
// them via full-document navigation (served from precache), because
// client-side RSC fetches cannot succeed offline. Uses the mobile
// viewport so the bottom tab bar (the reported component) is exercised.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

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

async function pathname(page: Page): Promise<string> {
  return new URL(page.url()).pathname;
}

/** The mobile bottom tab bar (the reported component). */
function bottomNav(page: Page) {
  return page.locator("div.fixed.bottom-0 nav");
}

function tabLink(page: Page, name: string) {
  return bottomNav(page).getByRole("link", { name, exact: true });
}

test.describe("Offline bottom navigation", () => {
  test("Route → Map → Stations → Nearby → Route all open offline", async ({
    context,
  }) => {
    const page = await context.newPage();
    await page.goto("/?from=ahang&to=aliabad", {
      waitUntil: "domcontentloaded",
    });
    await waitForOfflineReady(page);
    await expectRouteResult(page);

    // The Route tab preserves the query in both modes.
    const routeHref = await tabLink(page, "مسیر").getAttribute("href");
    expect(routeHref).toContain("from=ahang");
    expect(routeHref).toContain("to=aliabad");

    await context.setOffline(true);

    // Mechanism guard: offline taps must not issue client-side *navigation*
    // RSC requests at all (they are what used to abort the transition).
    // Link prefetch requests also carry `RSC: 1` (plus
    // `Next-Router-Prefetch`) — those stay allowed and are excluded here.
    const navRscRequests: string[] = [];
    page.on("request", (req) => {
      // catch(): header reads reject for requests torn down mid-flight;
      // an unhandled rejection would fail the test spuriously.
      void Promise.all([
        req.headerValue("rsc"),
        req.headerValue("next-router-prefetch"),
      ])
        .then(([rsc, prefetch]) => {
          if (rsc !== null && prefetch === null) navRscRequests.push(req.url());
        })
        .catch(() => {});
    });

    await tabLink(page, "نقشه").click();
    await expect.poll(() => pathname(page), { timeout: 30_000 }).toBe("/map");
    await expect(
      page.locator('[aria-label="Tehran metro on real map"]'),
    ).toBeVisible({ timeout: 30_000 });

    await tabLink(page, "ایستگاه‌ها").click();
    await expect.poll(() => pathname(page), { timeout: 30_000 }).toBe(
      "/stations",
    );
    await expect(
      page.locator('input[placeholder="جستجوی ایستگاه…"]:visible'),
    ).toBeVisible({ timeout: 30_000 });

    await tabLink(page, "نزدیک من").click();
    await expect.poll(() => pathname(page), { timeout: 30_000 }).toBe(
      "/nearby",
    );
    await expect(
      page.getByText("موقعیت شما", { exact: true }),
    ).toBeVisible({ timeout: 30_000 });

    // Back to Route: same href semantics as online, route state intact.
    await tabLink(page, "مسیر").click();
    await expect.poll(() => pathname(page), { timeout: 30_000 }).toBe("/");
    expect(new URL(page.url()).searchParams.get("from")).toBe("ahang");
    expect(new URL(page.url()).searchParams.get("to")).toBe("aliabad");
    await expectRouteResult(page);
    // Flush any in-flight header reads, then assert zero navigation RSC.
    await page.waitForTimeout(1000);
    expect(navRscRequests).toEqual([]);

    await context.setOffline(false);
  });

  test("modifier clicks keep normal browser semantics offline", async ({
    context,
  }) => {
    const page = await context.newPage();
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForOfflineReady(page);
    await context.setOffline(true);

    // Ctrl-click must NOT trigger the offline document navigation on this
    // page: the current tab stays put (the browser handles the new tab).
    await tabLink(page, "نقشه").click({ modifiers: ["Control"] });
    await page.waitForTimeout(2000);
    expect(await pathname(page)).toBe("/");
    // Clean up any tab the browser opened for the modifier click.
    for (const p of context.pages()) {
      if (p !== page) await p.close();
    }

    await context.setOffline(false);
  });

  test("cold query navigations serve their canonical precached document", async ({
    context,
  }) => {
    // Truly cold: only `/` is ever loaded online. In particular NO
    // query-bearing document may be warmed into `metto-pages` first.
    const page = await context.newPage();
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForOfflineReady(page);

    // Canonical static documents exist ONLY because of precache…
    const precachedPaths: string[] = await page.evaluate(async () => {
      const found = new Set<string>();
      for (const name of await caches.keys()) {
        if (!name.includes("precache")) continue;
        const cache = await caches.open(name);
        for (const req of await cache.keys()) {
          found.add(new URL(req.url).pathname);
        }
      }
      return [...found].sort();
    });
    for (const p of ["/", "/map", "/stations", "/nearby"]) {
      expect(precachedPaths).toContain(p);
    }

    // …while query-specific versions are absent from the runtime cache.
    const warmedQueryDocs: string[] = await page.evaluate(async () => {
      const out: string[] = [];
      try {
        const cache = await caches.open("metto-pages");
        for (const req of await cache.keys()) {
          const u = new URL(req.url);
          if (u.search.length > 0) out.push(u.pathname + u.search);
        }
      } catch {
        // Cache may not exist yet — equally cold.
      }
      return out;
    });
    expect(warmedQueryDocs).toEqual([]);

    // Create route context WITHOUT navigating: combobox selection updates
    // tab hrefs client-side to arbitrary (non-hardcoded) values.
    await page
      .getByRole("button", { name: /ایستگاه یا نام مکان/ })
      .first()
      .click();
    await page.locator('input[dir="auto"]').first().fill("تجریش");
    await page.getByRole("button", { name: /تجریش/ }).first().click();
    await expect(page).toHaveURL(/from=tajrish/, { timeout: 15_000 });
    await page
      .getByRole("button", { name: /ایستگاه یا نام مکان/ })
      .first()
      .click();
    await page.locator('input[dir="auto"]').first().fill("تهران (صادقیه)");
    await page.getByRole("button", { name: /تهران/ }).first().click();
    const mapHref =
      (await tabLink(page, "نقشه").getAttribute("href")) ?? "";
    expect(mapHref).toContain("from=tajrish");
    expect(mapHref).toContain("to=tehran-sadeghiyeh");
    await expectRouteResult(page);

    // Offline from here on. Track fatal document failures + RSC fallback.
    const failedDocs: string[] = [];
    page.on("requestfailed", (req) => {
      if (req.resourceType() === "document") failedDocs.push(req.url());
    });
    const navRscRequests: string[] = [];
    page.on("request", (req) => {
      // catch(): header reads reject for requests torn down mid-flight;
      // an unhandled rejection would fail the test spuriously.
      void Promise.all([
        req.headerValue("rsc"),
        req.headerValue("next-router-prefetch"),
      ])
        .then(([rsc, prefetch]) => {
          if (rsc !== null && prefetch === null) navRscRequests.push(req.url());
        })
        .catch(() => {});
    });
    await context.setOffline(true);

    // Map with query → Map HTML (never Route HTML), query intact.
    await tabLink(page, "نقشه").click();
    await expect.poll(() => pathname(page), { timeout: 30_000 }).toBe("/map");
    expect(new URL(page.url()).searchParams.get("from")).toBe("tajrish");
    expect(new URL(page.url()).searchParams.get("to")).toBe(
      "tehran-sadeghiyeh",
    );
    await expect(
      page.locator('[aria-label="Tehran metro on real map"]'),
    ).toBeVisible({ timeout: 30_000 });

    // Stations with query → Stations HTML.
    await tabLink(page, "ایستگاه‌ها").click();
    await expect.poll(() => pathname(page), { timeout: 30_000 }).toBe(
      "/stations",
    );
    expect(new URL(page.url()).searchParams.get("from")).toBe("tajrish");
    await expect(
      page.locator('input[placeholder="جستجوی ایستگاه…"]:visible'),
    ).toBeVisible({ timeout: 30_000 });

    // Nearby with query → Nearby HTML.
    await tabLink(page, "نزدیک من").click();
    await expect.poll(() => pathname(page), { timeout: 30_000 }).toBe(
      "/nearby",
    );
    expect(new URL(page.url()).searchParams.get("to")).toBe(
      "tehran-sadeghiyeh",
    );
    await expect(
      page.getByText("موقعیت شما", { exact: true }),
    ).toBeVisible({ timeout: 30_000 });

    // Route with query → Route HTML.
    await tabLink(page, "مسیر").click();
    await expect.poll(() => pathname(page), { timeout: 30_000 }).toBe("/");
    await expectRouteResult(page);

    // Cold arbitrary combo incl. junk param → canonical Nearby HTML,
    // full requested URL preserved.
    await page.goto(
      "/nearby?from=tajrish&to=tehran-sadeghiyeh&x=1",
      { waitUntil: "domcontentloaded" },
    );
    await expect(
      page.getByText("موقعیت شما", { exact: true }),
    ).toBeVisible({ timeout: 30_000 });
    expect(page.url()).toContain("x=1");

    await page.waitForTimeout(1000);
    expect(failedDocs).toEqual([]);
    expect(navRscRequests).toEqual([]);

    await context.setOffline(false);
  });
});
