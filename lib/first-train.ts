// Find the next *verified* first boarding time for the selected journey.
// Both the no-service shortcut and the time picker use the same Tehran-local
// dates. Nothing here guesses a network-wide opening hour.
import { computeRouteTopology, findRoute } from "./route";
import { getAllDepartures } from "./schedule-utils";
import { getDayTypeForServiceDate, shiftTehranDate } from "./route-planning";
import { parseServiceTimeToMinutes, tehranMinuteToInstant, tehranParts } from "./tehran-time";
import { findIsfahanTrips } from "./isfahan-timetable";
import { findTabrizTrips } from "./tabriz-timetable";
import type { HolidayDataset } from "./holidays/local-dataset";
import type { IsHolidayDate } from "./holidays/types";

const MAX_DAYS_AHEAD = 7;

export function firstTehranTrainForRoute(
  from: string,
  to: string,
  notBeforeMs: number,
  isHolidayDate?: IsHolidayDate,
): number | null {
  const topology = computeRouteTopology(from, to);
  const line = topology?.segments[0]?.line;
  if (line === undefined) return null;

  const today = tehranParts(notBeforeMs).dateStr;
  for (let offset = 0; offset <= MAX_DAYS_AHEAD; offset++) {
    const date = shiftTehranDate(today, offset);
    const earliest = Math.max(notBeforeMs, tehranMinuteToInstant(date, 0));

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
      return departureMs >= earliest ? departureMs : null;
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
  holidays: HolidayDataset | null,
): number | null {
  const today = tehranParts(notBeforeMs).dateStr;
  for (let offset = 0; offset <= MAX_DAYS_AHEAD; offset++) {
    const date = shiftTehranDate(today, offset);
    const readyAtMs = Math.max(notBeforeMs, tehranMinuteToInstant(date, 0));
    const result = city === "isfahan"
      ? findIsfahanTrips(from, to, readyAtMs, holidays)
      : findTabrizTrips(from, to, readyAtMs, holidays);
    if (!result.applicable || result.blocked) continue;
    const first = result.trips[0]?.departureMs;
    if (first !== undefined && first >= readyAtMs) return first;
  }
  return null;
}
