// Centralized metro schedule-day selection. Routing/timetable code must
// use this (with a pre-loaded sync resolver) instead of weekday-only logic.
// All date resolution uses Asia/Tehran via tehranParts — never server or
// browser timezones, never bare Date.getDay().

import type { DayType } from "../schedule-data";
import { tehranParts } from "../tehran-time";
import type { IsHolidayDate, ScheduleDayType } from "./types";

/**
 * Priority (exact):
 * 1. Resolve date in Asia/Tehran.
 * 2. Friday -> "holiday".
 * 3. Cached official holiday -> "holiday" (overrides Thu/Sat-Wed).
 * 4. Thursday -> "thursday".
 * 5. Otherwise -> "sat_to_wed".
 *
 * Unknown (cache miss) is treated conservatively as non-holiday here
 * (except Friday); storage still distinguishes unknown from confirmed false.
 */
export function getMetroScheduleDayType(
  date: Date | number,
  isHolidayDate?: IsHolidayDate,
): ScheduleDayType {
  const ms = date instanceof Date ? date.getTime() : date;
  const parts = tehranParts(ms);
  if (parts.dayType === "friday") return "holiday";
  if (isHolidayDate?.(parts.dateStr) === true) return "holiday";
  if (parts.dayType === "thursday") return "thursday";
  return "sat_to_wed";
}

/** Map the 3 schedule categories onto the existing timetable DayType. */
export function scheduleDayToDayType(day: ScheduleDayType): DayType {
  if (day === "holiday") return "friday";
  if (day === "thursday") return "thursday";
  return "saturday_wednesday";
}

/** Tehran date string + timetable DayType for one instant (routing legs). */
export function getDayTypeForInstant(
  instantMs: number,
  isHolidayDate?: IsHolidayDate,
): { tehranDateStr: string; dayType: DayType; scheduleDay: ScheduleDayType } {
  const scheduleDay = getMetroScheduleDayType(instantMs, isHolidayDate);
  return {
    tehranDateStr: tehranParts(instantMs).dateStr,
    dayType: scheduleDayToDayType(scheduleDay),
    scheduleDay,
  };
}

/**
 * Build a sync resolver from already-loaded cache entries.
 * The server/API layer loads today + next-day entries ONCE, then routing
 * re-evaluates per leg against this local map (no I/O inside findRoute).
 */
export function createIsHolidayDate(
  known: Record<string, boolean> | Map<string, boolean> | Set<string>,
): IsHolidayDate {
  if (known instanceof Set) return (d: string) => known.has(d);
  if (known instanceof Map) return (d: string) => known.get(d) === true;
  return (d: string) => known[d] === true;
}
