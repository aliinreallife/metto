// Client-safe schedule-note helpers (moved from schedule-server.ts, unchanged).
//
// Pure presentation/classification over already-computed routing results:
// no I/O, no node: imports. Shared by the server route pipeline
// (re-exported through schedule-server.ts) and the WebMCP client executors.

import { tehranParts } from "../tehran-time";
import {
  getMetroScheduleDayType,
  scheduleDayToDayType,
} from "../holidays/schedule-day";
import type { IsHolidayDate } from "../holidays/types";
import type { LegTiming } from "../route";

export type TimingSource = "timetable" | "mixed" | "estimated";

/**
 * Classify where a route's timing came from. An empty legTiming array
 * must NOT classify as timetable (Array.every on [] is vacuously true).
 */
export function classifyTimingSource(legTiming: LegTiming[]): TimingSource {
  if (legTiming.length === 0) return "estimated";
  if (legTiming.every((t) => t === "timetable")) return "timetable";
  if (legTiming.some((t) => t === "timetable")) return "mixed";
  return "estimated";
}

/**
 * Human label for the departure's schedule day, e.g. "Friday (holiday)",
 * "Thursday", "Saturday–Wednesday", "Weekday (official holiday)".
 * Describes the departure instant only — a midnight-crossing journey may
 * span two schedule days (legs re-evaluate inside findRoute).
 */
export function departureScheduleLabel(
  departAt: Date,
  isHolidayDate: IsHolidayDate,
): string {
  const parts = tehranParts(departAt.getTime());
  const scheduleDay = getMetroScheduleDayType(departAt.getTime(), isHolidayDate);
  if (scheduleDay === "holiday") {
    return parts.dayType === "friday"
      ? "Friday (holiday)"
      : "Weekday (official holiday)";
  }
  if (scheduleDay === "thursday") return "Thursday";
  return "Saturday–Wednesday";
}

export function timingSourceWord(source: TimingSource): string {
  if (source === "timetable") return "timetable-based";
  if (source === "mixed") return "partially timetable-based";
  return "estimated";
}

/** Day-type label coda appended to route summaries (shared wording). */
export function buildScheduleNote(
  departAt: Date,
  isHolidayDate: IsHolidayDate,
  legTiming: LegTiming[],
): string {
  return `${departureScheduleLabel(departAt, isHolidayDate)} · ${timingSourceWord(classifyTimingSource(legTiming))}`;
}

/** Map the 3 schedule categories onto the existing timetable DayType. */
export { scheduleDayToDayType };
