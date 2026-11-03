import { expect, it } from "vitest";
import { findIsfahanTrips, isfahanServiceData } from "./isfahan-timetable";
import { tehranMinuteToInstant } from "./tehran-time";
import raw from "../public/holidays.json";
import { parseHolidayDataset } from "./holidays/local-dataset";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import source from "../data/reference/isfahan-service-source.json";
const holidays = parseHolidayDataset(raw)!;
const start = "isfahan:station:qods", end = "isfahan:station:defa-e-moghaddas";
const at = (date: string, h: number, m = 0) => tehranMinuteToInstant(date, h * 60 + m);
it("pins the public artifact and keeps the original source review distinct from release permission", () => {
  expect(createHash("sha256").update(readFileSync("data/reference/isfahan-service.json")).digest("hex")).toBe(source.sha256);
  expect(isfahanServiceData.release.productionAuthorized).toBe(true);
  expect(isfahanServiceData.calendar.nonFridayHolidayRule.operatorVerified).toBe(false);
  expect(isfahanServiceData.trips).toHaveLength(278);
});
it("uses full source rows both ways, including Friday 22:00 and arrival after the operating-hours banner", () => {
  for (const [from, to] of [[start, end], [end, start]]) {
    const r = findIsfahanTrips(from, to, at("2026-11-06", 22), holidays);
    expect(r.trips).toHaveLength(1);
    expect(r.trips[0]).toMatchObject({ departure: "22:00", arrival: "22:39", minutes: 39 });
    expect(findIsfahanTrips(from, to, at("2026-11-06", 22, 1), holidays).trips).toEqual([]);
  }
  // Last run is still boarding downstream after the terminal's last departure.
  const downstream = findIsfahanTrips("isfahan:station:azadi", end, at("2026-11-06", 22, 30), holidays);
  expect(downstream.trips[0].departure).toBe("22:31");
});
it("rejects Friday closed endpoints but retains physical passage and weekday boarding", () => {
  for (const id of isfahanServiceData.release.fridayNoBoardingStationIds) {
    expect(findIsfahanTrips(id, end, at("2026-11-06", 10), holidays)).toMatchObject({ blocked: true, trips: [] });
    expect(findIsfahanTrips(start, id, at("2026-11-06", 10), holidays)).toMatchObject({ blocked: true, trips: [] });
    expect(findIsfahanTrips(id, end, at("2026-11-03", 10), holidays).trips.length).toBeGreaterThan(0);
  }
  expect(findIsfahanTrips(start, end, at("2026-11-06", 10), holidays).trips[0].minutes).toBe(39);
});
it("flags the holiday Friday assumption and unknown calendars without inventing next-day or conditional runs", () => {
  const date = "2026-11-04";
  const calendar = structuredClone(holidays);
  calendar.records[date] = { gregorianDate: date, jalaliDate: "1405-08-13", state: "holiday", kind: "official" };
  expect(findIsfahanTrips(start, end, at(date, 6), calendar)).toMatchObject({ holidayAssumption: true, serviceId: "friday" });
  expect(findIsfahanTrips(start, end, at(date, 6), calendar).trips[0].departure).toBe("09:00");
  expect(findIsfahanTrips(start, end, at("2027-04-03", 10), holidays).trips).toEqual([]);
  expect(findIsfahanTrips(start, end, at("2026-11-03", 6, 40), holidays).trips[0].departure).not.toBe("06:42");
  expect(findIsfahanTrips("mashhad:station:qods", end, at(date, 10), calendar).trips).toEqual([]);
});
