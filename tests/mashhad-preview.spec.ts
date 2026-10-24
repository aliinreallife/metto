import { expect, type Locator } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { pickCityStation } from "./helpers/city-stations";
import { networkSafeTest as test } from "./helpers/walking";

async function expectTimetableLink(link: Locator, lang: "fa" | "en") {
  const target = new URL((await link.getAttribute("href"))!);
  if (target.origin === "https://data.metto.ir") {
    expect(target.pathname).toBe("/contribute");
    expect(target.searchParams.get("city")).toBe("mashhad");
    expect(target.searchParams.get("kind")).toBe("timetable");
    expect(target.searchParams.get("lang")).toBe(lang);
  } else {
    expect(target.origin).toBe("https://github.com");
    expect(target.pathname).toBe("/aliinreallife/metto/issues/new");
    expect(target.searchParams.get("title")).toContain(lang === "fa" ? "مشهد" : "Mashhad");
    expect(target.searchParams.get("body")).toContain(lang === "fa" ? "منبع و تاریخ" : "Source and date");
  }
  await expect(link).toHaveAttribute("target", "_blank");
}

test("selects Mashhad landmarks as exact endpoints and preserves them after reload", async ({page})=>{
  const queries:string[]=[];
  await page.route("https://nominatim.openstreetmap.org/search?*",async route=>{
    queries.push(new URL(route.request().url()).searchParams.get("viewbox")!);
    await route.fulfill({json:[{display_name:"Imam Reza Shrine, Mashhad",lat:"36.2879",lon:"59.6157",type:"place_of_worship"}]});
  });
  await page.goto("/mashhad/route?to=mashhad:station:airport&lang=en");
  await page.getByLabel("From",{exact:true}).click();
  await page.locator('input[role="combobox"]').fill("Imam Reza Shrine");
  await page.getByRole("option").filter({hasText:"Imam Reza Shrine"}).click();
  await expect(page.getByTestId("city-route-result")).toBeVisible();
  expect(queries).toContain("59.35,36.10,59.85,36.50");
  const url=new URL(page.url());
  expect(url.searchParams.get("from")).toMatch(/^mashhad:station:/);
  expect(url.searchParams.get("op")).toBeTruthy();
  await expect(page.getByRole("main")).toContainText("Imam Reza Shrine");
  await page.reload();
  await expect(page.getByTestId("city-route-result")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("op")).toBe(url.searchParams.get("op"));
});

// The same station/path scope is available in production and previews.
test.beforeEach(async ({ context, request }) => {
  const response = await request.get("/api/cities/mashhad/route?from=mashhad:station:airport&to=mashhad:station:tabarsi");
  test.skip(response.status() === 404, "Mashhad is unavailable in this deployment");
  expect(response.status()).toBe(200);
  await context.addInitScript(() => {
    localStorage.setItem("route.from", "tajrish");
    localStorage.setItem("route.to", "tehran-sadeghiyeh");
    const registered: string[] = [];
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: { registerTool: (tool: { name: string }) => { registered.push(tool.name); return () => undefined; } },
    });
    Object.assign(window, { registeredMetroTools: registered });
  });
});

test("routes the two-line scope without timing, Tehran tools or selection leakage", async ({ page }) => {
  await page.goto("/mashhad/route?lang=en");
  const planner = page.getByTestId("city-path-preview");
  await expect(planner).toHaveAttribute("dir", "ltr");
  await expect(planner.getByText("Browse stations (36)")).toHaveCount(0);
  await expect(planner.locator("details")).toHaveCount(0);
  await expectTimetableLink(planner.getByTestId("city-no-times").getByRole("link"), "en");
  await pickCityStation(page, "From", "Airport");
  await pickCityStation(page, "To", "Tabarsi");
  const result = planner.getByTestId("city-route-result");
  await expect(result.getByText("Transfer to Line 2 via Shariati")).toBeVisible();
  const summary = result.getByTestId("route-summary-stats");
  await expect(summary).toContainText("16 stops");
  await expect(summary).toContainText("1 transfer");
  await expect(summary).not.toContainText(/—|travel time|arrival/i);
  await expect(result.getByRole("button", { name: "Copy route link", exact: true })).toBeVisible();
  await expect(result.getByRole("link", { name: /Directions to start/ })).toBeVisible();
  await expect(result).not.toContainText(/\d{1,2}:\d{2}|\d+ minutes|estimated/i);
  const contribution = planner.getByTestId("city-no-times").getByRole("link");
  await expectTimetableLink(contribution, "en");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://metto.ir/mashhad/route");
  const selections = await page.evaluate(() => [localStorage.getItem("route.from"), localStorage.getItem("route.to")]);
  expect(selections).toEqual(["tajrish", "tehran-sadeghiyeh"]);
  expect(await page.evaluate(() => (window as typeof window & { registeredMetroTools: string[] }).registeredMetroTools)).toEqual([]);
  await page.reload();
  await expect(page.getByRole("main").getByTestId("city-route-result")).toContainText("Transfer to Line 2 via Shariati");
});

test("supports Persian, keyboard controls and accessible results", async ({ page }) => {
  await page.goto("/mashhad/route?lang=fa");
  const planner = page.getByTestId("city-path-preview");
  await expect(planner).toHaveAttribute("dir", "rtl");
  await expectTimetableLink(planner.getByTestId("city-no-times").getByRole("link"), "fa");
  await pickCityStation(page, "مبدأ", "VakilAbad");
  await pickCityStation(page, "مقصد", "Airport");
  const summary = planner.getByTestId("route-summary-stats");
  await expect(summary).toContainText("۲۴ ایستگاه");
  await expect(summary).toContainText("بدون تعویض خط");
  await expect(summary).not.toContainText(/—|دقیقه سفر|رسیدن/);
  const swap = planner.getByRole("button", { name: "جابجایی" });
  await swap.focus(); await page.keyboard.press("Enter");
  await expect(planner.getByLabel("مبدأ", { exact: true })).toContainText("فرودگاه");
  const audit = await new AxeBuilder({ page }).include('[data-testid="city-path-preview"]').analyze();
  expect(audit.violations.filter(v => v.impact === "serious" || v.impact === "critical")).toEqual([]);
});

test("rejects cross-city links and leaves disputed Line 3 stops unselectable", async ({ page, request }) => {
  await page.goto("/mashhad/route?from=tajrish&to=mashhad:station:airport&lang=en");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("outside these two lines");
  // Check the local station inventory; a Line 3 station name may also be a
  // valid online landmark, routed through a nearby Line 1/2 station.
  await page.context().setOffline(true);
  await page.getByLabel("From", { exact: true }).click();
  await page.locator('input[role="combobox"]').fill("باب الجواد");
  await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.context().setOffline(false);
  await expect(page.getByTestId("city-route-result")).toHaveCount(0);
  const denied = await request.get("/api/cities/mashhad/route?from=tajrish&to=mashhad:station:airport");
  expect(denied.status()).toBe(400);
});


test("uses the shared itinerary disclosure and chooses GPS origin within Mashhad", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 36.231, longitude: 59.643 });
  const timetableRequests: string[] = [];
  page.on("request", request => { if (/schedule-data|\/data\/schedule-/.test(request.url())) timetableRequests.push(request.url()); });
  await page.goto("/mashhad/route?from=mashhad:station:vakilabad&to=mashhad:station:airport&lang=en");
  const disclosure = page.getByRole("button", { name: "Intermediate stops" });
  await expect(disclosure).toHaveAttribute("aria-expanded", "false");
  await disclosure.click();
  await expect(disclosure).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("city-route-result").getByRole("list").last()).toContainText("Shariati");
  await page.getByRole("button", { name: "Use my location", exact: true }).click();
  await expect(page.getByLabel("From", { exact: true })).toContainText("Airport");
  expect(timetableRequests).toEqual([]);
});
