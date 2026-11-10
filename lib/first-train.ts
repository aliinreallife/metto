// Find the next *verified* first boarding time for the selected journey.
// Both the no-service shortcut and the time picker use the same Tehran-local
// dates. Nothing here guesses a network-wide opening hour.
import { computeRouteTopology, findRoute } from "./route";
import { getAllDepartures } from "./schedule-utils";
import { getDayTypeForServiceDate, PLAN_HORIZON_DAYS, shiftTehranDate } from "./route-planning";
import { parseServiceTimeToMinutes, tehranMinuteToInstant, tehranParts } from "./tehran-time";
import { findIsfahanTrips } from "./isfahan-timetable";
import { findTabrizTrips } from "./tabriz-timetable";
import type { HolidayDataset } from "./holidays/local-dataset";
import type { IsHolidayDate } from "./holidays/types";

export function firstTehranTrainForRoute(
  from: string,
  to: string,
  notBeforeMs: number,
  nowMs: number,
  isHolidayDate?: IsHolidayDate,
): number | null {
  const topology = computeRouteTopology(from, to);
  const line = topology?.segments[0]?.line;
  if (line === undefined) return null;

  const today = tehranParts(nowMs).dateStr;
  const horizonDate = shiftTehranDate(today, PLAN_HORIZON_DAYS);
  for (let offset = 0; offset <= PLAN_HORIZON_DAYS; offset++) {
    const date = shiftTehranDate(today, offset);
    const earliest = Math.max(nowMs, notBeforeMs, tehranMinuteToInstant(date, 0));
    if (tehranParts(earliest).dateStr !== date) continue;

    // In the usual case a single forward plan from midnight (or the selected
    // time today) finds the first boardable train AND proves all transfers.
    const verifiedDeparture = (readyAtMs: number): number | null => {
      const journey = findRoute(from, to, {
        departAt: new Date(readyAtMs),
        isHolidayDate,
      });
      const firstTrip = journey?.trips[0];
      if (journey?.status !== "complete" || !firstTrip) return null;
      const departureMs = tehranMinuteToInstant(
        tehranParts(readyAtMs).dateStr,
        parseServiceTimeToMinutes(firstTrip.departTime),
      );
      return departureMs >= earliest &&
        tehranParts(departureMs).dateStr <= horizonDate
        ? departureMs : null;
    };

    const first = verifiedDeparture(earliest);
    if (first !== null) return first;

    // A first train can miss a connection while a later train completes the
    // route. Search the origin's actual published departures, verifying every
    // candidate with the ordinary forward engine. Never invent a connection.
    const dayType = getDayTypeForServiceDate(date, isHolidayDate);
    const seen = new Set<number>();
    for (const departure of getAllDepartures(from, line, dayType)) {
      const readyAtMs = tehranMinuteToInstant(date, parseServiceTimeToMinutes(departure.time));
      if (readyAtMs < earliest || seen.has(readyAtMs)) continue;
      seen.add(readyAtMs);
      const next = verifiedDeparture(readyAtMs);
      if (next !== null) return next;
    }
  }
  return null;
}

export function firstCityTrainForRoute(
  city: "isfahan" | "tabriz",
  from: string,
  to: string,
  notBeforeMs: number,
  nowMs: number,
  holidays: HolidayDataset | null,
): number | null {
  const today = tehranParts(nowMs).dateStr;
  const horizonDate = shiftTehranDate(today, PLAN_HORIZON_DAYS);
  for (let offset = 0; offset <= PLAN_HORIZON_DAYS; offset++) {
    const date = shiftTehranDate(today, offset);
    const readyAtMs = Math.max(nowMs, notBeforeMs, tehranMinuteToInstant(date, 0));
    if (tehranParts(readyAtMs).dateStr !== date) continue;
    const result = city === "isfahan"
      ? findIsfahanTrips(from, to, readyAtMs, holidays)
      : findTabrizTrips(from, to, readyAtMs, holidays);
    if (!result.applicable || result.blocked) continue;
    const first = result.trips[0]?.departureMs;
    if (first !== undefined && first >= readyAtMs &&
      tehranParts(first).dateStr <= horizonDate) return first;
  }
  return null;
}
