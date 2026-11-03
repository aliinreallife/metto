import { describe, expect, it } from "vitest";
import data from "@/data/reference/tabriz-line1.json";
import { findTabrizTrips, tabrizServiceDay } from "./tabriz-timetable";
import { tehranMinuteToInstant } from "./tehran-time";
import { CITY_NETWORKS, getCityPreview, getUntimedCityPlanner } from "./city-previews";
import { cityCounts, CITY_EDGES, catalogStations } from "./city-catalog";
import { availableCityIds } from "./city-availability";

const from = "tabriz:station:el-goli", to = "tabriz:station:noor";
const at = (date: string, time: string) =>
  tehranMinuteToInstant(date, Number(time.slice(0, 2)) * 60 + Number(time.slice(3)));

describe("Tabriz published timetable and public release", () => {
  it("keeps original direction-specific source rows instead of interpolating missing trains", () => {
    expect(data.stationIds).toHaveLength(18);
    expect(data.tracks).toHaveLength(17);
    expect(data.trips).toHaveLength(212);
    expect(data.trips.filter(t => t.serviceId === "normal")).toHaveLength(114);
    expect(data.trips.filter(t => t.serviceId === "holiday")).toHaveLength(98);
    expect(data.trips.every(t => t.times.length === 18 && t.times.every(x => /^\d\d:\d\d$/.test(x)))).toBe(true);
    for (const trip of data.trips) {
      const values = trip.times.map(x => Number(x.slice(0, 2)) * 60 + Number(x.slice(3)));
      expect(values.every((n, i) => i === 0 || (trip.direction === "to_noor" ? n > values[i - 1] : n < values[i - 1]))).toBe(true);
    }
    expect(data.trips.find(t => t.id === "tabriz:normal:to-noor:001")?.times).toEqual([
      "05:55", "05:57", "05:59", "06:01", "06:03", "06:05", "06:07", "06:09", "06:11",
      "06:13", "06:15", "06:18", "06:20", "06:22", "06:24", "06:26", "06:28", "06:30",
    ]);
    // The source's last trains disagree with secondary sources. Never
    // fabricate missing 20:40/21:15 departures merely to match estimates.
    expect(data.trips.filter(t => t.serviceId === "normal" && t.direction === "to_noor").at(-1)?.times[0]).toBe("20:10");
    expect(data.trips.filter(t => t.serviceId === "normal" && t.direction === "to_el_goli").at(-1)?.times[17]).toBe("20:30");
    expect(data.release.operatorVerifiedTimetable).toBe(false);
    expect(data.provenance.timetableLicense).toBe("MIT");
  });

  it("selects real next trains, opposite direction and intermediate stations", () => {
    const morning = findTabrizTrips(from, to, at("2026-11-03", "10:00"), null);
    expect(morning.serviceId).toBe("normal");
    expect(morning.trips[0]).toMatchObject({ departure: "10:10", arrival: "10:45", minutes: 35, terminalId: to });
    expect(morning.trips[1].departure).toBe("10:25");
    const reverse = findTabrizTrips(to, from, at("2026-11-03", "06:14"), null);
    expect(reverse.trips[0]).toMatchObject({ departure: "06:15", arrival: "06:50", minutes: 35, terminalId: from });
    const inner = findTabrizTrips(data.stationIds[3], data.stationIds[6], at("2026-11-03", "10:00"), null);
    expect(inner.trips[0]).toMatchObject({ departure: "10:01", arrival: "10:07", minutes: 6 });
    expect(findTabrizTrips(from, from, at("2026-11-03", "10:00"), null).trips).toEqual([]);
    expect(findTabrizTrips("isfahan:station:qods", to, at("2026-11-03", "10:00"), null).trips).toEqual([]);
  });

  it("preserves Friday and deadline semantics without yesterday's train", () => {
    const fri = findTabrizTrips(from, to, at("2026-11-06", "07:29"), null);
    expect(fri.serviceId).toBe("holiday");
    expect(fri.trips[0]).toMatchObject({ departure: "07:30", arrival: "08:05" });
    const arrive = findTabrizTrips(from, to, at("2026-11-03", "10:45"), null,
      { arriveBy: true, notBeforeMs: at("2026-11-03", "10:00") });
    expect(arrive.trips[0]?.departure).toBe("10:10");
    const missed = findTabrizTrips(from, to, at("2026-11-03", "10:44"), null,
      { arriveBy: true, notBeforeMs: at("2026-11-03", "10:00") });
    expect(missed.trips).toEqual([]);
    expect(findTabrizTrips(from, to, at("2026-11-03", "20:11"), null).trips).toEqual([]);
    expect(findTabrizTrips(from, to, at("2026-11-04", "00:01"), null, {
      arriveBy: true, notBeforeMs: at("2026-11-03", "10:00"),
    }).trips).toEqual([]);
  });

  it("treats Thursdays and public holidays as provisional, not official", () => {
    expect(tabrizServiceDay(at("2026-11-05", "10:00"), null)).toMatchObject({
      serviceId: "normal", holidayAssumption: true,
    });
    expect(tabrizServiceDay(at("2026-11-06", "10:00"), null).serviceId).toBe("holiday");
  });

  it("publishes 18 operational OSM-mapped stations but keeps the timetable explicitly unverified", () => {
    expect(cityCounts(["tehran", "mashhad", "isfahan", "tabriz"]))
      .toEqual({ stations: 225, lines: 11, cities: 4 });
    expect(getCityPreview("tabriz")).toBeUndefined();
    const planner = getUntimedCityPlanner("tabriz")!;
    expect(planner.findPath(from, to)?.stationIds).toEqual(data.stationIds);
    expect(planner.findPath(to, from)?.stationIds).toEqual(data.stationIds.slice().reverse());
    expect(planner.findPath(from, from)).toBeNull();
    expect(catalogStations(["tabriz"])).toHaveLength(18);
    expect(catalogStations(["tabriz"]).every(s => s.status === "operational" && s.operationalLineIds.length === 1)).toBe(true);
    expect(CITY_EDGES.filter(e => e.lineId === "tabriz:line:1")).toHaveLength(17);
    expect(CITY_NETWORKS.find(c => c.cityId === "tabriz")?.network.stations.every(s => s.status === "operational")).toBe(true);
    expect(data.release.productionAuthorized).toBe(true);
    expect(data.release.operatorVerifiedTimetable).toBe(false);
    for (const env of [
      { VERCEL_ENV: "preview", NODE_ENV: "production" },
      { VERCEL_ENV: "production", NODE_ENV: "production" },
      { VERCEL_ENV: "preview", METTO_CITY_PREVIEWS: "0" },
      { NODE_ENV: "production" },
    ]) expect(availableCityIds(env)).toContain("tabriz");
  });
});
