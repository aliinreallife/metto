// Build-time station summaries for crawlable HTML. This Node-only module is
// imported from the static station page, NEVER from client components.
// It reads the same bundled timetable file as Metto's offline bootstrap.
// The client uses the latest validated schedule when that becomes available.
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DayType, LineScheduleData } from "./schedule-data";
import { canBoardAtStation, resolveStationId } from "./metro/selectors";

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

let bundledSummaryPromise: Promise<Map<string, StationTimetableSummary>> | null = null;

async function readBundledSummaries(): Promise<Map<string, StationTimetableSummary>> {
  const raw = await readFile(path.join(process.cwd(), "public", "schedule-data.json"), "utf8");
  const data: LineScheduleData[] = JSON.parse(raw);
  const aggregate = new Map<string, Partial<Record<DayType, MutableSummary>>>();

  for (const group of data) {
    for (const train of group.trains) {
      if (!DAY_TYPES.includes(train.dayType)) continue;
      // Terminal arrivals are not departures. Metto's getAllDepartures
      // similarly excludes the last stop and stations where boarding is closed.
      for (const stop of train.stops.slice(0, -1)) {
        const stationId = resolveStationId(stop.stationId);
        if (!stationId || !canBoardAtStation(stationId, train.line)) continue;
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

/** Returns bundled scheduled facts or null (never blocks the station page). */
export async function getStationTimetableSummary(
  stationId: string,
): Promise<StationTimetableSummary | null> {
  try {
    bundledSummaryPromise ??= readBundledSummaries().catch(error => {
      bundledSummaryPromise = null; // safe retry on a later prerender
      throw error;
    });
    return (await bundledSummaryPromise).get(stationId) ?? null;
  } catch {
    return null;
  }
}
