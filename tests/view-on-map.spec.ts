import { expect } from "@playwright/test";
import { networkSafeTest as test } from "./helpers/walking";

const cityRoutes = [
  { name: "Tehran", route: "/route", map: "/map", from: "tajrish", to: "tehran-sadeghiyeh" },
  { name: "Mashhad", route: "/mashhad/route", map: "/mashhad/map", from: "mashhad:station:airport", to: "mashhad:station:vakilabad" },
  { name: "Isfahan", route: "/isfahan/route", map: "/isfahan/map", from: "isfahan:station:qods", to: "isfahan:station:defa-e-moghaddas" },
  { name: "Tabriz", route: "/tabriz/route", map: "/tabriz/map", from: "tabriz:station:el-goli", to: "tabriz:station:noor" },
] as const;

test.beforeEach(async ({ page }) => {
  // Keep the selected origin/destination within the published service window.
  await page.clock.setFixedTime(new Date("2026-11-03T06:30:00Z"));
});

for (const city of cityRoutes) {
  test(`${city.name} shows View on map only after a valid route exists`, async ({ page }) => {
    const mapLink = page.getByRole("link", { name: "View on map", exact: true });

    await page.goto(`${city.route}?lang=en`);
    await expect(mapLink).toHaveCount(0);

    await page.goto(`${city.route}?from=${encodeURIComponent(city.from)}&lang=en`);
    await expect(mapLink).toHaveCount(0);

    await page.goto(`${city.route}?from=${encodeURIComponent(city.from)}&to=${encodeURIComponent(city.from)}&lang=en`);
    await expect(mapLink).toHaveCount(0);

    await page.goto(`${city.route}?from=${encodeURIComponent(city.from)}&to=${encodeURIComponent(city.to)}&lang=en`);
    await expect(mapLink).toBeVisible();
    const href = new URL((await mapLink.getAttribute("href"))!, page.url());
    expect(href.pathname).toBe(city.map);
    expect(href.searchParams.get("from")).toBe(city.from);
    expect(href.searchParams.get("to")).toBe(city.to);

    await mapLink.click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(city.map);
    expect(new URL(page.url()).searchParams.get("from")).toBe(city.from);
    expect(new URL(page.url()).searchParams.get("to")).toBe(city.to);
  });
}

test("Persian View on map is hidden until the Tabriz journey exists", async ({ page }) => {
  const mapLink = page.getByRole("link", { name: "نمایش روی نقشه", exact: true });
  await page.goto("/tabriz/route?lang=fa");
  await expect(mapLink).toHaveCount(0);
  await page.goto("/tabriz/route?from=tabriz:station:el-goli&to=tabriz:station:noor&lang=fa");
  await expect(mapLink).toBeVisible();
});

test("No available Tabriz departure does not show View on map", async ({ page }) => {
  await page.goto("/tabriz/route?from=tabriz:station:el-goli&to=tabriz:station:noor&timeMode=depart&at=2026-11-03T16%3A41%3A00.000Z&lang=en");
  await expect(page.getByTestId("tabriz-no-service")).toBeVisible();
  await expect(page.getByRole("link", { name: "View on map", exact: true })).toHaveCount(0);
});

test("No available Isfahan departure does not show View on map", async ({ page }) => {
  await page.goto("/isfahan/route?from=isfahan:station:qods&to=isfahan:station:defa-e-moghaddas&at=2026-11-06T22:01&lang=en");
  await expect(page.getByTestId("isfahan-no-service")).toBeVisible();
  await expect(page.getByRole("link", { name: "View on map", exact: true })).toHaveCount(0);
});
