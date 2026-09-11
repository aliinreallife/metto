import { expect, test, type Page } from "@playwright/test";

// Map stacking regression (mobile PWA viewport): Leaflet paints panes at
// z-200..700 and controls at z-800/1000. The map root must contain all of
// that inside its own isolated z-0 stacking context so nothing — tiles,
// markers, attribution, zoom/locate buttons — can ever cover the fixed
// bottom navigation, even while panning/zooming through unloaded areas.
//
// Tile hosts are blocked (instant gray, no flakiness) so the core layout
// assertions don't depend on offline network-emulation semantics.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

type Box = { x: number; y: number; width: number; height: number };

function intersects(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

async function tabBar(page: Page) {
  const bar = page.getByTestId("mobile-tabbar");
  await expect(bar).toBeVisible();
  const box = await bar.boundingBox();
  expect(box).not.toBeNull();
  return { bar, box: box as Box };
}

/**
 * The whole app-chrome-wins assertion: every bottom tab is visible,
 * hit-testable (elementFromPoint at its center lands inside the nav, never
 * on the map/attribution), and no map control touches the nav.
 */
async function expectChromeAboveMap(page: Page) {
  const { box: navBox } = await tabBar(page);
  const links = page.getByTestId("mobile-tabbar").getByRole("link");
  expect(await links.count()).toBe(4);
  for (let i = 0; i < 4; i++) {
    const link = links.nth(i);
    await expect(link).toBeVisible();
    const box = await link.boundingBox();
    expect(box).not.toBeNull();
    const cx = (box as Box).x + (box as Box).width / 2;
    const cy = (box as Box).y + (box as Box).height / 2;
    const hit = await page.evaluate(
      ({ x, y }) => {
        const el = document.elementFromPoint(x, y) as Element | null;
        if (!el) return "none";
        if (el.closest('[data-testid="mobile-tabbar"]')) return "nav";
        const cls =
          typeof el.className === "string"
            ? el.className.split(" ")[0]
            : el.tagName.toLowerCase();
        return `${el.tagName.toLowerCase()}.${cls}`;
      },
      { x: cx, y: cy },
    );
    expect(hit).toBe("nav");
  }

  // Attribution stays visible (licensing) but never over the tabs.
  const attribution = page.locator(".leaflet-control-attribution").first();
  await expect(attribution).toBeVisible({ timeout: 15_000 });
  const attrBox = await attribution.boundingBox();
  expect(attrBox).not.toBeNull();
  expect(intersects(attrBox as Box, navBox)).toBe(false);

  // Custom zoom/locate buttons clear the navigation too.
  for (const name of ["Zoom in", "Zoom out", "Locate me"]) {
    const btn = page.getByRole("button", { name, exact: true });
    await expect(btn).toBeVisible();
    const box = await btn.boundingBox();
    expect(box).not.toBeNull();
    expect(intersects(box as Box, navBox)).toBe(false);
  }
}

test.describe("Map stacking over app chrome", () => {
  test("pan/zoom through unloaded areas never covers the bottom nav", async ({
    context,
    page,
  }) => {
    // Gray tiles on demand: CARTO + Esri never load, map stays interactive.
    await context.route("**://*.basemaps.cartocdn.com/**", (route) =>
      route.abort("blockedbyclient"),
    );
    await context.route("**://*.arcgisonline.com/**", (route) =>
      route.abort("blockedbyclient"),
    );

    await page.goto("/map", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator('[aria-label="Tehran metro on real map"]'),
    ).toBeVisible({ timeout: 30_000 });
    await expectChromeAboveMap(page);

    const map = page.locator('[aria-label="Tehran metro on real map"]');
    const mapBox = await map.boundingBox();
    expect(mapBox).not.toBeNull();
    const cx = (mapBox as Box).x + (mapBox as Box).width / 2;
    const cy = (mapBox as Box).y + (mapBox as Box).height / 2;

    for (let round = 0; round < 3; round++) {
      // Horizontal + vertical drags across unloaded gray tiles.
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + 120, cy - 90, { steps: 8 });
      await page.mouse.move(cx - 140, cy + 110, { steps: 8 });
      await page.mouse.up();
      // Vertical drag starting near the bottom of the usable map area —
      // the reported tab-disappearing gesture.
      const nearBottom = (mapBox as Box).y + (mapBox as Box).height - 60;
      await page.mouse.move(cx, nearBottom);
      await page.mouse.down();
      await page.mouse.move(cx + 40, nearBottom - 160, { steps: 8 });
      await page.mouse.up();
      // Wheel zoom in and back out.
      await page.mouse.move(cx, cy);
      await page.mouse.wheel(0, -480);
      await page.waitForTimeout(600);
      await page.mouse.wheel(0, 480);
      await page.waitForTimeout(600);
      // Button zoom (custom controls).
      await page.getByRole("button", { name: "Zoom in", exact: true }).click();
      await page.waitForTimeout(400);
      await page
        .getByRole("button", { name: "Zoom out", exact: true })
        .click();
      await page.waitForTimeout(400);

      await expectChromeAboveMap(page);
    }
  });
});
