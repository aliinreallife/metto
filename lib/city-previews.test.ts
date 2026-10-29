import { expect, it } from "vitest";
import data from "@/data/reference/isfahan-candidate-preview.json";
import { CITIES, cityFromPath, cityHref } from "./cities";
import { availableCityIds } from "./city-availability";
import { catalogStations, cityCounts, CITY_EDGES } from "./city-catalog";
import { CITY_PREVIEWS, getCityPreview, getUntimedCityPlanner } from "./city-previews";
import { createCityPathPlanner } from "./city-route-path";

it("registers preview cities only in preview/development and fails closed in production", () => {
  for (const env of [{ VERCEL_ENV: "preview", NODE_ENV: "production" }, { NODE_ENV: "development" }])
    expect(availableCityIds(env)).toEqual(["tehran", "mashhad", "isfahan"]);
  for (const env of [
    { VERCEL_ENV: "production", NODE_ENV: "production" },
    { VERCEL_ENV: "production", NODE_ENV: "development" },
    { VERCEL_ENV: "preview", METTO_CITY_PREVIEWS: "0" },
    { NODE_ENV: "production" }, {},
  ]) expect(availableCityIds(env)).toEqual(["tehran", "mashhad"]);
  expect(availableCityIds({ VERCEL_ENV: "preview", METTO_MASHHAD_ENABLED: "0" })).toEqual(["tehran", "isfahan"]);
  expect(CITY_PREVIEWS.map(c => c.cityId)).toEqual(CITIES.filter(c => c.release === "preview").map(c => c.slug));
});

it("uses ordinary city URLs and catalogs without changing public counts or boarding claims", () => {
  expect(cityFromPath("/isfahan/map")).toBe("isfahan");
  expect(cityHref("isfahan", "stations")).toBe("/isfahan/stations");
  expect(cityCounts(["tehran", "mashhad"])).toEqual({ stations: 187, lines: 9, cities: 2 });
  expect(cityCounts(["tehran", "mashhad", "isfahan"])).toEqual({ stations: 207, lines: 10, cities: 3 });
  const stations = catalogStations(["isfahan"]);
  expect(stations).toHaveLength(20);
  expect(stations.every(s => s.id.startsWith("isfahan:station:") && s.operationalLineIds.length === 0 && Object.keys(s.amenities).length === 0)).toBe(true);
  expect(stations.filter(s => s.status === "review_disputed").map(s => s.names.fa)).toEqual(["دانشگاه", "کارگر"]);
  expect(data.readyForProduction).toBe(false);
  expect(data.source.commit).toBe("1e83f67df3b3dd8e599eb416c42ed93a2a2bee7f");
  const tracks = CITY_EDGES.filter(e => e.lineId === "isfahan:line:1");
  expect(tracks).toHaveLength(19);
  expect(tracks.map(t => t.coordinates)).toEqual(data.tracks.map(t => t.geometry.map(p => [p.lat, p.lng])));
});

it("requires explicit review mode to trace candidate tracks and rejects foreign endpoints", () => {
  const preview = getCityPreview("isfahan")!;
  const ids = preview.network.stations.map(s => s.id);
  const passenger = createCityPathPlanner(preview.network);
  expect(passenger.findPath(ids[0], ids[19])).toBeNull();
  expect(passenger.stations).toEqual([]);
  const planner = getUntimedCityPlanner("isfahan")!;
  for (const from of ids) for (const to of ids) {
    if (from === to) continue;
    const path = planner.findPath(from, to)!;
    expect(path.reviewOnly).toBe(true);
    expect(path.stationIds).toEqual(planner.findPath(to, from)!.stationIds.slice().reverse());
    expect(Object.keys(path).sort()).toEqual(["cityId", "legs", "reviewOnly", "stationIds", "stops", "transfers"]);
  }
  expect(planner.findPath("tehran:station:qods", ids[0])).toBeNull();
  expect(planner.findPath(ids[0], ids[0])).toBeNull();
  expect(planner.findPath("isfahan:station:extension", ids[0])).toBeNull();
});
