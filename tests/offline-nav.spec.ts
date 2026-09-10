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
      void Promise.all([
        req.headerValue("rsc"),
        req.headerValue("next-router-prefetch"),
      ]).then(([rsc, prefetch]) => {
        if (rsc !== null && prefetch === null) navRscRequests.push(req.url());
      });
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
      page.getByPlaceholder("جستجوی ایستگاه…"),
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
});
