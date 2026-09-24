import { expect, test, type BrowserContext, type Page } from "@playwright/test";

// Regression: Leaflet tiles must never paint above the bottom navigation
// after offline panning. Reproduces the failure sequence (load → offline →
// pan away → pan back → repaint) and asserts the footer stays topmost.
//
// CARTO tiles are mocked (1px PNG, hermetic like map-tiles.spec.ts): the
// offline flag + pan gestures still drive the real Leaflet tile-container
// transform/repaint path. Cache/error state is deliberately NOT asserted —
// cache contents make that flaky. The critical assertion is
// `document.elementFromPoint()` inside the footer after the repaint:
// clipped Leaflet tiles can geometrically overlap without painting above,
// so rect intersection alone would prove nothing.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

async function dragMap(page: Page, dx: number, dy: number) {
  const box = await page
    .locator('[aria-label="Metro on real map"]')
    .boundingBox();
  expect(box).not.toBeNull();
  const cx = box!.x + box!.width / 2;
  const cy = box!.y + box!.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + dx, cy + dy, { steps: 15 });
  await page.mouse.up();
  // Let Leaflet settle (moveend + tile repaint).
  await page.waitForTimeout(900);
}

test.describe("Map / bottom-nav stacking", () => {
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

  test("tiles stay below bottom tabs after offline pan away and back", async ({
    context,
  }) => {
    const page = await context.newPage();
    await page.goto("/map", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator('[aria-label="Metro on real map"]'),
    ).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(
        async () =>
          page.evaluate(
            () =>
              document.querySelectorAll("img.leaflet-tile-loaded").length,
          ),
        { timeout: 30_000 },
      )
      .toBeGreaterThan(0);

    await context.setOffline(true);
    // Pan significantly away, then back.
    await dragMap(page, 260, 0);
    await dragMap(page, -260, 0);
    // Wait for Leaflet to settle/repaint after the pan-back.
    await expect
      .poll(
        async () =>
          page.evaluate(
            () => document.querySelectorAll("img.leaflet-tile").length,
          ),
        { timeout: 20_000 },
      )
      .toBeGreaterThan(0);
    await page.waitForTimeout(1000);

    // Single isolation boundary: the map-screen wrapper. The RealMap outer
    // viewport must NOT be a second `isolate` context.
    const stacking = await page.evaluate(() => {
      const mount = document.querySelector(
        '[aria-label="Metro on real map"]',
      );
      const viewport = mount?.parentElement ?? null;
      const screen = viewport?.parentElement ?? null;
      const cs = (el: Element | null) =>
        el ? getComputedStyle(el as HTMLElement) : null;
      const screenStyle = cs(screen);
      const viewportStyle = cs(viewport);
      const footer = document.querySelector("footer.fixed.bottom-0");
      const footerStyle = cs(footer);
      return {
        hasMount: !!mount,
        hasViewport: !!viewport,
        hasScreen: !!screen,
        screenIsolation: screenStyle?.isolation ?? null,
        screenZIndex: screenStyle?.zIndex ?? null,
        screenOverflow: screenStyle?.overflow ?? null,
        viewportIsolation: viewportStyle?.isolation ?? null,
        viewportZIndex: viewportStyle?.zIndex ?? null,
        viewportOverflow: viewportStyle?.overflow ?? null,
        footerPosition: footerStyle?.position ?? null,
        footerZIndex: footerStyle?.zIndex ?? null,
      };
    });
    expect(stacking.hasMount).toBe(true);
    expect(stacking.hasScreen).toBe(true);
    expect(stacking.screenIsolation).toBe("isolate");
    expect(stacking.screenZIndex).toBe("0");
    expect(stacking.screenOverflow).toBe("hidden");
    expect(stacking.viewportIsolation).not.toBe("isolate");
    expect(stacking.viewportZIndex).toBe("0");
    expect(stacking.viewportOverflow).toBe("hidden");
    expect(stacking.footerPosition).toBe("fixed");
    expect(stacking.footerZIndex).toBe("20");

    // The map viewport must end at or above the top edge of the footer.
    const geometry = await page.evaluate(() => {
      const mount = document.querySelector(
        '[aria-label="Metro on real map"]',
      );
      const viewport = mount?.parentElement;
      const footer = document.querySelector("footer.fixed.bottom-0");
      if (!viewport || !footer) return null;
      const mapRect = viewport.getBoundingClientRect();
      const footerRect = footer.getBoundingClientRect();
      return {
        mapBottom: mapRect.bottom,
        footerTop: footerRect.top,
      };
    });
    expect(geometry).not.toBeNull();
    expect(geometry!.mapBottom).toBeLessThanOrEqual(geometry!.footerTop + 1);

    // Footer tabs render above the map after the repaint: sample several
    // points across the footer and require the topmost element to be
    // inside the footer each time.
    const hits = await page.evaluate(() => {
      const footer = document.querySelector("footer.fixed.bottom-0");
      if (!footer) return null;
      const rect = footer.getBoundingClientRect();
      const y = rect.top + Math.min(10, rect.height / 2);
      return [0.15, 0.5, 0.85].map((f) => {
        const x = rect.left + rect.width * f;
        const el = document.elementFromPoint(x, y);
        return {
          x: Math.round(x),
          y: Math.round(y),
          hit: el
            ? `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).split(" ").slice(0, 2).join(".")}` : ""}`
            : "null",
          inFooter: !!el?.closest("footer.fixed.bottom-0"),
        };
      });
    });
    expect(hits).not.toBeNull();
    expect(hits!.length).toBe(3);
    for (const h of hits!) {
      expect(h.inFooter, `footer hit at (${h.x},${h.y}) got ${h.hit}`).toBe(
        true,
      );
    }

    await expect(page.locator("footer.fixed.bottom-0 nav")).toBeVisible();
    await context.setOffline(false);
  });
});
