import { describe, expect, it } from "vitest";
import { CITIES } from "./cities";
import { SEO_CITY_STATIONS, getSeoCityStation, cityStationSeoPath, cityStationBreadcrumbs, cityStationJsonLd } from "./station-seo";
import { buildStationGuideModel } from "./station-guide-model";
import { getRegionalStationTimetableSummarySync } from "./station-seo-timetable";
import { regionalStationDepartures } from "./regional-station-schedules";

describe("one station guide for every public timed city", () => {
  it("auto-publishes operational, boardable stations only where service times exist", () => {
    for (const cityId of ["tehran", "isfahan", "tabriz"] as const) {
      const pages = SEO_CITY_STATIONS.filter(station => station.cityId === cityId);
      expect(pages.length, `missing ${cityId} station pages`).toBeGreaterThan(10);
      for (const station of pages) {
        expect(station.status).toBe("operational");
        expect(station.operationalLineIds.length).toBeGreaterThan(0);
        expect(getSeoCityStation(cityId, station.localId)).toBe(station);
        expect(cityStationSeoPath(cityId, station.localId))
          .toBe(`/${cityId}/stations/${station.localId.split(":station:").at(-1)}`);
      }
    }
    expect(SEO_CITY_STATIONS.some(station => station.cityId === "mashhad")).toBe(false);
    expect(CITIES.find(city => city.slug === "mashhad")?.timing).toBe(false);
    expect(SEO_CITY_STATIONS.some(station => station.status.startsWith("review_"))).toBe(false);
    expect(new Set(SEO_CITY_STATIONS.map(station => `${station.cityId}:${station.localId}`)).size)
      .toBe(SEO_CITY_STATIONS.length);
  });

  it.each([
    ["isfahan", "qods", "قدس", "اصفهان"],
    ["tabriz", "el-goli", "ائل‌گلی", "تبریز"],
  ] as const)("uses real %s geography, schematic neighbors and city breadcrumbs", (city, id, name, cityFa) => {
    const station = getSeoCityStation(city, id)!;
    expect(station.names.fa).toBe(name);
    const model = buildStationGuideModel(station);
    expect(model.lines).toHaveLength(1);
    expect(model.lines[0].id).toBe(`${city}:line:1`);
    expect(model.neighbors.length).toBeGreaterThan(0);
    expect(model.neighbors.every(neighbor =>
      getSeoCityStation(city, neighbor.id) !== undefined)).toBe(true);
    const crumbs = cityStationBreadcrumbs(station);
    expect(crumbs.map(crumb => crumb.href)).toEqual([
      `/${city}`, `/${city}/stations`, `/${city}/stations/${id}`,
    ]);
    const schema = cityStationJsonLd(station);
    expect(schema).toMatchObject({
      "@type": "SubwayStation", name, url: `https://metto.ir/${city}/stations/${id}`,
      address: { addressCountry: "IR", addressLocality: cityFa },
    });
    expect("amenityFeature" in schema).toBe(false); // not verified in either city's source
  });

  it("labels actual boarding directions by the last stop of scheduled trains", () => {
    const examples = [
      { city: "isfahan", station: "qods", terminal: "defa-e-moghaddas" },
      { city: "tabriz", station: "el-goli", terminal: "noor" },
    ] as const;
    for (const { city, station: id, terminal } of examples) {
      const station = getSeoCityStation(city, id)!;
      const model = buildStationGuideModel(station);
      expect(model.directions).toContainEqual({
        lineId: `${city}:line:1`,
        destinationId: terminal,
        name: getSeoCityStation(city, terminal)!.names,
        side: "after", // Start-of-line stations face the last stop to the left in RTL.
      });
      expect(model.directions.every(direction =>
        direction.destinationId !== id &&
        model.lines.some(line => line.id === direction.lineId)
      )).toBe(true);
    }

    const middle = getSeoCityStation("tabriz", "sahand")!;
    const middleDirections = buildStationGuideModel(middle).directions;
    expect(middleDirections).toEqual(expect.arrayContaining([
      expect.objectContaining({ destinationId: "el-goli", side: "before" }),
      expect.objectContaining({ destinationId: "noor", side: "after" }),
    ]));

    const azadegan = getSeoCityStation("tehran", "azadegan")!;
    const tehranDirections = buildStationGuideModel(azadegan).directions;
    expect(tehranDirections.length).toBeGreaterThan(0);
    expect(tehranDirections.every(direction => direction.lineId.startsWith("tehran:line:"))).toBe(true);
    expect(tehranDirections.every(direction => direction.side === "before" || direction.side === "after")).toBe(true);
    expect(tehranDirections.every(direction => direction.destinationId !== "azadegan")).toBe(true);

    const lastStop = getSeoCityStation("tabriz", "noor")!;
    expect(buildStationGuideModel(lastStop).directions.some(direction =>
      direction.destinationId === lastStop.localId)).toBe(false);
  });

  it("derives per-station scheduled summaries from the matching published source", () => {
    for (const [city, id, pattern] of [
      ["isfahan", "isfahan:station:qods", "saturday_thursday"],
      ["tabriz", "tabriz:station:el-goli", "normal"],
    ] as const) {
      const rows = regionalStationDepartures(city, id, pattern);
      const summary = getRegionalStationTimetableSummarySync(city, id);
      expect(rows.length).toBeGreaterThan(20);
      expect(summary[pattern]).toEqual({
        count: rows.length,
        first: rows[0].time,
        last: rows[rows.length - 1].time,
      });
    }
    // Published Friday schedule explicitly excludes boarding at Baharestan.
    expect(regionalStationDepartures("isfahan", "isfahan:station:baharestan", "friday")).toEqual([]);
    expect(getRegionalStationTimetableSummarySync("isfahan", "isfahan:station:baharestan").friday)
      .toBeUndefined();
    // No terminal arrivals masquerade as departures.
    expect(regionalStationDepartures("tabriz", "tabriz:station:noor", "normal")
      .some(row => row.directionId === "tabriz:station:noor")).toBe(false);
  });
});
