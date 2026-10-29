import { describe, expect, it } from "vitest";
import { CITY_EDGES, CITY_STATIONS, catalogStations, cityCounts, normalizeCitySearch, stationByCityId, stationRouteHref } from "./city-catalog";
import { reportedMashhadAmenities } from "./mashhad-reported-amenities";
import { cityFromPath, cityHref, viewFromPath } from "./cities";

describe("city-scoped station catalog", () => {
  it("counts physical stations once per city, including a shared interchange only once", () => {
    expect(cityCounts(["tehran"])).toEqual({ stations: 151, lines: 7, cities: 1 });
    expect(cityCounts(["tehran", "mashhad"])).toEqual({ stations: 187, lines: 9, cities: 2 });
    expect(cityCounts(["tehran", "mashhad"], "mashhad")).toEqual({ stations: 36, lines: 2, cities: 1 });
    expect(catalogStations(["tehran"], "mashhad")).toEqual([]);
    expect(catalogStations(["mashhad"]).some(s => s.id === "mashhad:station:bab-al-javad")).toBe(false);
  });
  it("keeps duplicate names in different cities as distinct results and links", () => {
    const basij = CITY_STATIONS.filter(s => normalizeCitySearch(s.names.fa) === "بسیج");
    expect(basij.map(s => s.cityId).sort()).toEqual(["mashhad", "tehran"]);
    expect(new Set(CITY_STATIONS.map(s => s.id)).size).toBe(207);
    for (const s of basij) {
      const url = new URL(stationRouteHref(s, "to", "en"), "https://metto.ir");
      expect(url.pathname).toBe(`/${s.cityId}/route`);
      expect(url.searchParams.get("to")).toBe(s.localId);
    }
  });
  it("never constructs an edge between cities or aliases station IDs by display name", () => {
    for (const edge of CITY_EDGES) {
      const a = stationByCityId.get(edge.from), b = stationByCityId.get(edge.to);
      expect(a).toBeDefined(); expect(b).toBeDefined();
      expect(a!.cityId).toBe(b!.cityId);
      expect(edge.lineId.startsWith(`${a!.cityId}:line:`)).toBe(true);
    }
  });
  it("keeps upstream amenity reports separate from unknown canonical facts", () => {
    const station = stationByCityId.get("mashhad:station:vakilabad")!;
    expect(Object.values(station.amenities).every(value => value === null)).toBe(true);
    expect(station.reportedAmenities).toMatchObject({ wc: true, elevator: true, freeWifi: false, police: true, parking: true });
    expect(reportedMashhadAmenities("not-a-source-station")).toEqual({});
    expect(stationByCityId.get("tehran:station:basij")!.reportedAmenities).toBeUndefined();
  });
  it("keeps explicit city URLs and the old Tehran tabs identifiable", () => {
    expect(cityFromPath("/map")).toBe("tehran");
    expect(cityFromPath("/mashhad/map")).toBe("mashhad");
    expect(cityFromPath("/cities/map")).toBe("all");
    expect(viewFromPath("/mashhad/stations")).toBe("stations");
    expect(cityHref("tehran", "map", true)).toBe("/map");
    expect(cityHref("mashhad", "map")).toBe("/mashhad/map");
    expect(cityHref("all", "map")).toBe("/cities/map");
  });
});
