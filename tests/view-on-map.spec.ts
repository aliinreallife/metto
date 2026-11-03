import { expect } from "@playwright/test";
import { networkSafeTest as test } from "./helpers/walking";

const cityRoutes = [
  { name: "Tehran", route: "/route", map: "/map", from: "tajrish", to: "tehran-sadeghiyeh" },
  { name: "Mashhad", route: "/mashhad/route", map: "/mashhad/map", from: "mashhad:station:airport", to: "mashhad:station:vakilabad" },
  { name: "Isfahan", route: "/isfahan/route", map: "/isfahan/map", from: "isfahan:station:qods", to: "isfahan:station:defa-e-moghaddas" },
  { name: "Tabriz", route: "/tabriz/route", map: "/tabriz/map", from: "tabriz:station:el-goli", to: "tabriz:station:noor" },
] as const;

for (const city of cityRoutes) {
  test(`${city.name} always offers View on map before and after choosing stations`, async ({ page }) => {
    await page.goto(`${city.route}?lang=en`);

    const mapLink = page.getByRole("link", { name: "View on map", exact: true });
    await expect(mapLink).toBeVisible();
    const emptyHref = new URL((await mapLink.getAttribute("href"))!, page.url());
    expect(emptyHref.pathname).toBe(city.map);
    expect(emptyHref.searchParams.has("from")).toBe(false);
    expect(emptyHref.searchParams.has("to")).toBe(false);

    await page.goto(`${city.route}?from=${encodeURIComponent(city.from)}&to=${encodeURIComponent(city.to)}&lang=en`);
    await expect(mapLink).toBeVisible();
    const selectedHref = new URL((await mapLink.getAttribute("href"))!, page.url());
    expect(selectedHref.pathname).toBe(city.map);
    expect(selectedHref.searchParams.get("from")).toBe(city.from);
    expect(selectedHref.searchParams.get("to")).toBe(city.to);

    await mapLink.click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(city.map);
    expect(new URL(page.url()).searchParams.get("from")).toBe(city.from);
    expect(new URL(page.url()).searchParams.get("to")).toBe(city.to);
  });
}

test("Persian View on map action is present without a route", async ({ page }) => {
  await page.goto("/tabriz/route?lang=fa");
  await expect(page.getByRole("link", { name: "نمایش روی نقشه", exact: true })).toBeVisible();
});
