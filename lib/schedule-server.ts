// Server-only timetable + holiday wiring for API/MCP route calculation.
//
// WARNING: this module uses node:fs and MUST NOT be imported by client
// components (it would break the browser bundle). Import only from route
// handlers, server components/actions, scripts, or mcp-server.ts.
//
// Design constraints (do not weaken):
// - No Redis I/O and no timestamp.ir requests happen inside findRoute().
//   The caller pre-loads the two relevant Tehran dates ONCE per request;
//   routing re-evaluates per leg against the local sync resolver.
// - Dates beyond the holiday cache horizon resolve as non-holiday
//   (except Friday, always holiday timetable). This is a documented
//   fallback, not an error: we never call timestamp.ir during routing.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { nextTehranCalendarDate } from "./holidays/jalali";
import {
  createIsHolidayDate,
  getMetroScheduleDayType,
} from "./holidays/schedule-day";
import {
  createRedisHolidayStore,
  resolveRedisConfig,
  type HolidayStore,
} from "./holidays/store";
import type { IsHolidayDate } from "./holidays/types";
import type { LineScheduleData } from "./schedule-data";
import {
  isScheduleDataLoaded,
  setServerScheduleData,
} from "./schedule-utils";
import { tehranParts } from "./tehran-time";
import type { LegTiming } from "./route";
import { findRoute, type RouteResult } from "./route";

let scheduleLoadPromise: Promise<boolean> | null = null;

/**
 * Load public/schedule-data.json from disk into the shared schedule cache.
 * Resolves true when timetable data is available, false when the caller
 * must fall back to geometric estimates (missing/corrupt file). Never throws.
 * Concurrent first calls share one in-flight read.
 */
export function ensureServerScheduleData(
  scheduleFilePath?: string,
): Promise<boolean> {
  if (isScheduleDataLoaded()) return Promise.resolve(true);
  if (scheduleLoadPromise) return scheduleLoadPromise;
  scheduleLoadPromise = (async () => {
    try {
      const filePath =
        scheduleFilePath ?? path.join(process.cwd(), "public", "schedule-data.json");
      const raw = await readFile(filePath, "utf8");
      const data: unknown = JSON.parse(raw);
      if (!Array.isArray(data)) throw new Error("schedule-data.json is not an array");
      setServerScheduleData(data as LineScheduleData[]);
      return true;
    } catch (err) {
      console.error(
        JSON.stringify({
          job: "server-schedule-load",
          level: "error",
          message: err instanceof Error ? err.message : "unknown",
        }),
      );
      // Allow a later request to retry (e.g. file appears after deploy).
      scheduleLoadPromise = null;
      return false;
    }
  })();
  return scheduleLoadPromise;
}

/**
 * Build a sync holiday resolver for one requested departure instant.
 * Pre-loads exactly two Asia/Tehran calendar dates from the holiday store:
 * the Tehran date containing departAt, and the following Tehran date
 * (legs of a midnight-crossing journey re-evaluate per leg inside
 * findRoute, so both dates must be known up front).
 *
 * Uses the explicitly requested departure — never Date.now().
 * Store failures resolve to an empty map (fail open to weekday
 * classification, matching the no-holiday-data behavior).
 */
export async function getRequestHolidayResolver(
  departAt: Date,
  store?: HolidayStore,
): Promise<IsHolidayDate> {
  const firstDay = tehranParts(departAt.getTime()).dateStr;
  const secondDay = nextTehranCalendarDate(firstDay);
  const known: Record<string, boolean> = {};
  try {
    // No Redis configured -> skip the store entirely (no doomed fetch
    // attempts); unknown dates fall back to weekday classification.
    const holidayStore =
      store ?? (resolveRedisConfig() ? createRedisHolidayStore() : null);
    if (holidayStore) {
      for (const day of [firstDay, secondDay]) {
        const entry = await holidayStore.get(day);
        if (entry) known[day] = entry.isHoliday === true;
      }
    }
  } catch (err) {
    console.warn(
      JSON.stringify({
        job: "request-holiday-resolver",
        level: "warn",
        message: err instanceof Error ? err.message : "unknown",
      }),
    );
  }
  return createIsHolidayDate(known);
}

// ISO-8601 datetime with an EXPLICIT timezone (Z or ±hh:mm / ±hhmm).
// Naive timestamps (no offset) are ambiguous and rejected.
const ISO_WITH_TZ =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?([Zz]|[+-]\d{2}:?\d{2})$/;

/**
 * Parse a depart_at/departAt parameter. Returns null for anything that is
 * not ISO-8601 with an explicit timezone offset or Z (e.g. "2026-09-07T14:00:00"
 * is rejected). Callers map null to isError (MCP) or HTTP 400 (REST).
 */
export function parseDepartAtParam(value: string): Date | null {
  if (!ISO_WITH_TZ.test(value.trim())) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

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

export type ScheduledRoute =
  | { ok: true; route: RouteResult; scheduleNote: string }
  | { ok: false; error: string };

/**
 * findRoute with server-side timetable data + a request-scoped holiday
 * resolver. departAtParam must be ISO-8601 with explicit offset/Z when
 * provided (undefined = now). Returns { ok: false } for invalid input
 * (callers map to MCP isError / REST 400) and null when no route exists.
 */
export async function findRouteWithSchedule(
  from: string,
  to: string,
  departAtParam?: string,
): Promise<ScheduledRoute | null> {
  let departAt = new Date();
  if (departAtParam !== undefined) {
    const parsed = parseDepartAtParam(departAtParam);
    if (!parsed) {
      return {
        ok: false,
        error:
          "Invalid depart_at (expected ISO-8601 datetime with explicit timezone offset or Z, e.g. 2026-09-07T14:00:00+03:30)",
      };
    }
    departAt = parsed;
  }
  await ensureServerScheduleData();
  const isHolidayDate = await getRequestHolidayResolver(departAt);
  const route = findRoute(from, to, { departAt, isHolidayDate });
  if (!route) return null;
  const source = classifyTimingSource(route.legTiming);
  return {
    ok: true,
    route,
    scheduleNote: `${departureScheduleLabel(departAt, isHolidayDate)} · ${timingSourceWord(source)}`,
  };
}
