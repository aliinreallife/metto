// Build-time station summaries for crawlable HTML. This Node-only module is
// imported from the static station page, NEVER from client components.
// It reads the same bundled timetable file as Metto's offline bootstrap.
// The client uses the latest validated schedule when that becomes available.
import { readFileSync } from "node:fs";
import path from "node:path";
import type { DayType, LineScheduleData } from "./schedule-data";
import { canBoardAtStation, resolveStationId } from "./metro/selectors";
import { regionalServicePatterns, regionalStationDepartures, type RegionalTimedCity } from "./regional-station-schedules";

export type StationServiceDaySummary = {
  count: number;
  first: string;
  last: string;
};
export type StationTimetableSummary = Partial<Record<DayType, StationServiceDaySummary>>;

const DAY_TYPES: DayType[] = ["saturday_wednesday", "thursday", "friday"];

function minuteOfDay(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

type MutableSummary = StationServiceDaySummary & {
  firstMinute: number;
  lastMinute: number;
};

let bundledSummaryCache: Map<string, StationTimetableSummary> | null = null;
let bundledDirectionsCache: Map<string, { line: number; destinationId: string }[]> | null = null;

function readBundledSummaries(): Map<string, StationTimetableSummary> {
  const raw = readFileSync(path.join(process.cwd(), "public", "schedule-data.json"), "utf8");
  const data: LineScheduleData[] = JSON.parse(raw);
  const aggregate = new Map<string, Partial<Record<DayType, MutableSummary>>>();
  const destinations = new Map<string, Map<string, { line: number; destinationId: string }>>();

  for (const group of data) {
    for (const train of group.trains) {
      if (!DAY_TYPES.includes(train.dayType)) continue;
      // Terminal arrivals are not departures. Metto's getAllDepartures
      // similarly excludes the last stop and stations where boarding is closed.
      const destinationId = resolveStationId(train.stops.at(-1)?.stationId ?? "");
      for (const stop of train.stops.slice(0, -1)) {
        const stationId = resolveStationId(stop.stationId);
        if (!stationId || !canBoardAtStation(stationId, train.line)) continue;
        // A direction must be an actual last stop reached by a scheduled train,
        // not a planned geographic endpoint or an arrival at this station.
        if (destinationId && destinationId !== stationId) {
          const byLine = destinations.get(stationId) ?? new Map();
          byLine.set(`${train.line}:${destinationId}`, { line: train.line, destinationId });
          destinations.set(stationId, byLine);
        }
        const time = minuteOfDay(stop.time);
        const days = aggregate.get(stationId) ?? {};
        const current = days[train.dayType];
        if (current) {
          current.count += 1;
          if (time < current.firstMinute) {
            current.first = stop.time;
            current.firstMinute = time;
          }
          if (time > current.lastMinute) {
            current.last = stop.time;
            current.lastMinute = time;
          }
        } else {
          days[train.dayType] = {
            count: 1,
            first: stop.time,
            last: stop.time,
            firstMinute: time,
            lastMinute: time,
          };
        }
        aggregate.set(stationId, days);
      }
    }
  }

  bundledDirectionsCache = new Map([...destinations].map(([id, values]) => [
    id, [...values.values()].sort((a,b) => a.line - b.line || a.destinationId.localeCompare(b.destinationId)),
  ]));

  // Strip private numeric comparison fields before serializing to a page.
  return new Map([...aggregate].map(([id, days]) => [
    id,
    Object.fromEntries(DAY_TYPES.flatMap(day => {
      const summary = days[day];
      return summary ? [[day, {
        count: summary.count,
        first: summary.first,
        last: summary.last,
      }]] : [];
    })) as StationTimetableSummary,
  ]));
}

/** Synchronous cached data avoids suspending the static station render.
 * Missing/corrupt data fails soft; never guess timetable facts. */
export function getStationTimetableSummarySync(
  stationId: string,
): StationTimetableSummary | null {
  try {
    bundledSummaryCache ??= readBundledSummaries();
    return bundledSummaryCache.get(stationId) ?? null;
  } catch {
    return null;
  }
}

/** Retain the async API used in unit tests and other non-rendering callers. */
export async function getStationTimetableSummary(
  stationId: string,
): Promise<StationTimetableSummary | null> {
  return getStationTimetableSummarySync(stationId);
}

/** Source-backed SEO summaries for the city-specific published timetable.
 * These use the same adapter as the expanded, interactive station timetable. */
export function getRegionalStationTimetableSummarySync(
  city: RegionalTimedCity, stationId: string,
): Record<string, StationServiceDaySummary> {
  return Object.fromEntries(regionalServicePatterns(city).flatMap(pattern => {
    const departures = regionalStationDepartures(city, stationId, pattern.id);
    return departures.length ? [[pattern.id, {
      count: departures.length,
      first: departures[0].time,
      last: departures[departures.length - 1].time,
    }]] : [];
  }));
}

/** Actual scheduled train destination terminals for a Tehran boarding stop.
 * Union of published service-day patterns; the timetable determines whether
 * a particular destination has departures on a selected day. */
export function getTehranStationDirectionsSync(
  stationId: string,
): { line: number; destinationId: string }[] {
  try {
    bundledSummaryCache ??= readBundledSummaries();
    return bundledDirectionsCache?.get(stationId) ?? [];
  } catch {
    return [];
  }
}
