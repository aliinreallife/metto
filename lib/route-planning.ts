// Advanced time routing: depart-at and arrive-by planning over the same
// timetable engine as findRoute (lib/route.ts).
//
// - "now" and "depart-at" are thin wrappers: an explicit departure instant is
//   threaded through the unchanged chronological forward engine, so every
//   timetable guarantee (waits, walks, missed connections, day types,
//   found/missing/no_service) holds by construction.
// - "arrive-by" runs reverse timetable propagation on the selected topology
//   (latest-departure greedy per leg, see propagateBackward), then verifies
//   the derived origin instant with a full forward run. The returned
//   RouteResult always comes from the forward engine — never synthesized.
//
// Topology note: candidate topologies are evaluated as a list so alternative
// Dijkstra topologies can be added later (pick the plan with the latest
// feasible origin departure). Today the list holds the single existing
// topology, so arrive-by proves the latest feasible departure ON THAT
// TOPOLOGY — not a global optimum over every theoretical path. Documented,
// not overclaimed.

import {
  computeRouteTopology,
  estimateSegmentSeconds,
  findRoute,
  type ReverseTripLookupArgs,
  type RouteResult,
  type RouteTopology,
  type TripLookupArgs,
} from "./route";
import {
  findTripArrivingByDetailed,
  type TripLookupResult,
} from "./schedule-utils";
import {
  getMetroScheduleDayType,
  scheduleDayToDayType,
} from "./holidays/schedule-day";
import { nextTehranCalendarDate } from "./holidays/jalali";
import type { DayType } from "./schedule-data";
import type { IsHolidayDate } from "./holidays/types";
import { TRAIN_CHANGE_WALK_SECONDS } from "./metro/transfers";
import { parseDepartAtParam } from "./mcp/tool-defs";
import {
  TEHRAN_TZ,
  formatTehranClock,
  parseServiceTimeToMinutes,
  tehranMidnightEpoch,
  tehranMinuteToInstant,
  tehranParts,
} from "./tehran-time";
import { STRINGS, persianDigits, type Lang } from "./i18n";

export type RouteTimePreference =
  | { mode: "now" }
  | {
      /** Instant the passenger is available at the origin station. */
      mode: "depart-at";
      at: Date;
    }
  | {
      /** Instant the passenger must have reached the destination by. */
      mode: "arrive-by";
      at: Date;
    };

export type PlanRouteOptions = {
  /** Injectable forward lookup (tests). Defaults to findTripDetailed. */
  tripLookup?: (args: TripLookupArgs) => TripLookupResult;
  /** Injectable reverse lookup (tests). Defaults to findTripArrivingByDetailed. */
  reverseTripLookup?: (args: ReverseTripLookupArgs) => TripLookupResult;
  /**
   * Sync holiday resolver over already-loaded cache entries.
   * Same contract as findRoute: no storage/network calls inside planning.
   */
  isHolidayDate?: IsHolidayDate;
  /**
   * Arrive-by floor: origin departures before this instant are infeasible
   * (a journey cannot start in the past). Defaults to evaluation time;
   * injectable for deterministic tests. A 60s grace covers sub-minute
   * evaluation lag — boarding semantics are minute-resolution.
   */
  notBeforeMs?: number;
};

/**
 * Plan a route for a time preference. Returns the forward-engine
 * RouteResult, or null when no route (or no feasible arrive-by timing)
 * exists. Never invents trains: timetable legs use real departures, and
 * missing-data legs use the same geometric fallback as findRoute
 * (legTiming "estimated" — still ok:true when verified).
 */
export function planRoute(
  fromId: string,
  toId: string,
  pref: RouteTimePreference,
  opts?: PlanRouteOptions,
): RouteResult | null {
  if (pref.mode === "now") {
    return findRoute(fromId, toId, {
      tripLookup: opts?.tripLookup,
      isHolidayDate: opts?.isHolidayDate,
    });
  }
  if (pref.mode === "depart-at") {
    return findRoute(fromId, toId, {
      departAt: pref.at,
      tripLookup: opts?.tripLookup,
      isHolidayDate: opts?.isHolidayDate,
    });
  }
  return planArriveBy(fromId, toId, pref.at.getTime(), opts);
}

// Defensive guard only (malformed data must terminate): reverse propagation
// of a same-city metro journey never legitimately spans this far back.
const MAX_BACKWARD_SPAN_MS = 24 * 3_600_000;

function planArriveBy(
  fromId: string,
  toId: string,
  deadlineMs: number,
  opts?: PlanRouteOptions,
): RouteResult | null {
  const primary = computeRouteTopology(fromId, toId);
  if (!primary) return null;
  // Single topology today; structured as a list for future alternatives.
  const topologies: RouteTopology[] = [primary];

  const tripLookup = opts?.tripLookup;
  const reverseLookup =
    opts?.reverseTripLookup ??
    ((args: ReverseTripLookupArgs): TripLookupResult =>
      findTripArrivingByDetailed(
        args.fromId,
        args.toId,
        args.line,
        args.beforeMinutes,
        args.dayType,
      ));

  let best: RouteResult | null = null;
  // Latest feasible overall may already be gone (deadline too close to now):
  // every feasible departure is then in the past, so nothing can start now.
  const notBeforeMs = opts?.notBeforeMs ?? Date.now();
  for (const topology of topologies) {
    const originMs = propagateBackward(
      topology,
      deadlineMs,
      reverseLookup,
      opts?.isHolidayDate,
    );
    if (originMs === null) continue;
    if (originMs < notBeforeMs - 60_000) continue;
    // Forward verification through the unchanged chronological engine: the
    // returned journey always satisfies production boarding semantics.
    const route = findRoute(fromId, toId, {
      departAt: new Date(originMs),
      tripLookup,
      isHolidayDate: opts?.isHolidayDate,
    });
    if (!route || route.status !== "complete") continue;
    if (route.departedAtMs + route.totalSeconds * 1000 > deadlineMs) continue;
    if (!best || route.departedAtMs > best.departedAtMs) best = route;
  }
  return best;
}

/**
 * Reverse timetable propagation: latest feasible origin departure for one
 * topology and deadline. Per leg (last to first) takes the latest-departure
 * train arriving at/before the leg deadline, then the previous leg's
 * deadline becomes that departure minus the connecting walk.
 *
 * Optimality on this topology: maximizing each leg's departure maximally
 * relaxes the previous leg's deadline, which can only raise (never lower)
 * its achievable departure — induction yields the latest feasible moment
 * the passenger can be at the origin station.
 *
 * Missing-data legs mirror the forward engine: subtract the same geometric
 * estimate and continue (verified forward as "estimated"). A leg whose
 * timetable is covered but offers nothing in time is infeasible (null) —
 * no fake train is ever created.
 */
function propagateBackward(
  topology: RouteTopology,
  deadlineMs: number,
  reverseLookup: (args: ReverseTripLookupArgs) => TripLookupResult,
  isHolidayDate: IsHolidayDate | undefined,
): number | null {
  const { segments } = topology;
  let deadline = deadlineMs;

  for (let i = segments.length - 1; i >= 0; i--) {
    if (deadline < deadlineMs - MAX_BACKWARD_SPAN_MS) return null;
    const seg = segments[i];
    const segOrigin = seg.stations[0];
    const segDest = seg.stations[seg.stations.length - 1];

    const leg = latestDepartureBefore(
      segOrigin,
      segDest,
      seg.line,
      seg.routeId,
      deadline,
      reverseLookup,
      isHolidayDate,
    );
    let depMs: number;
    if (leg.status === "found") {
      depMs = leg.depMs;
    } else if (leg.status === "missing_schedule_data") {
      // Mirrors the forward engine's permitted fallback: subtract the same
      // geometric estimate and continue. Verified forward as "estimated".
      depMs = deadline - estimateSegmentSeconds(seg.stations) * 1000;
    } else {
      return null;
    }
    if (i === 0) return depMs;

    // Walk to this leg's departure must finish first: the previous leg's
    // deadline is this departure minus the connecting walk. Equality boards
    // (mirrors forward depart >= ready).
    const change = seg.changeFromPrevious;
    const walkS =
      change.type === "line_transfer"
        ? change.walkSeconds
        : TRAIN_CHANGE_WALK_SECONDS;
    deadline = depMs - walkS * 1000;
  }
  return null;
}

type BackwardLegResult =
  | { status: "found"; depMs: number }
  | { status: "missing_schedule_data" }
  | { status: "no_service" };

/**
 * Latest feasible boarding instant for one ride leg given an arrival
 * deadline. Searches the deadline's Tehran service date plus the previous
 * one (post-midnight 24:xx arrivals belong to the previous service date but
 * land on this calendar date). Missing data on every searched date reports
 * missing (caller falls back to the geometric estimate); covered-but-empty
 * timetables report no_service.
 */
function latestDepartureBefore(
  fromId: string,
  toId: string,
  line: number,
  routeId: string,
  deadlineMs: number,
  reverseLookup: (args: ReverseTripLookupArgs) => TripLookupResult,
  isHolidayDate: IsHolidayDate | undefined,
): BackwardLegResult {
  const dateStr = tehranParts(deadlineMs).dateStr;
  const serviceDates = [dateStr, prevTehranCalendarDate(dateStr)];

  let best: { depMs: number; arrMs: number } | null = null;
  let sawMissing = false;
  for (const serviceDate of serviceDates) {
    const dayType = getDayTypeForServiceDate(serviceDate, isHolidayDate);
    const beforeMinutes = Math.floor(
      (deadlineMs - tehranMidnightEpoch(serviceDate)) / 60_000,
    );
    if (beforeMinutes < 0) continue;
    const lookup = reverseLookup({
      fromId,
      toId,
      line,
      beforeMinutes,
      dayType,
      fromRouteId: routeId,
      toRouteId: routeId,
    });
    if (lookup.status === "missing_schedule_data") {
      sawMissing = true;
      continue;
    }
    if (lookup.status !== "found") continue;
    const depMin = parseServiceTimeToMinutes(lookup.trip.departTime);
    let arrMin = parseServiceTimeToMinutes(lookup.trip.arriveTime);
    if (arrMin < depMin) arrMin += 24 * 60;
    const depMs = tehranMinuteToInstant(serviceDate, depMin);
    const arrMs = tehranMinuteToInstant(serviceDate, arrMin);
    if (arrMs > deadlineMs) continue;
    // The journey must END on the requested calendar date: post-midnight
    // service (24:xx) still lands on the deadline date and qualifies, but
    // last night's trains do not — arrive-by plans a journey ending on the
    // requested day, not an arbitrarily early arrival the evening before.
    // (A deadline just after midnight with no post-midnight service is
    // therefore infeasible rather than answered by last night's train.)
    if (tehranParts(arrMs).dateStr !== dateStr) continue;
    // Latest departure wins; same departure → earlier arrival wins
    // (a faster train for the same boarding instant is strictly better).
    if (
      !best ||
      depMs > best.depMs ||
      (depMs === best.depMs && arrMs < best.arrMs)
    ) {
      best = { depMs, arrMs };
    }
  }
  if (best) return { status: "found", depMs: best.depMs };
  if (sawMissing) return { status: "missing_schedule_data" };
  return { status: "no_service" };
}

/** Timetable day type for one Tehran service (calendar) date. */
export function getDayTypeForServiceDate(
  serviceDate: string,
  isHolidayDate?: IsHolidayDate,
): DayType {
  // Noon is safely inside the date under any DST regime.
  const noonMs = tehranMidnightEpoch(serviceDate) + 12 * 3_600_000;
  return scheduleDayToDayType(
    getMetroScheduleDayType(noonMs, isHolidayDate),
  );
}

/** Previous Asia/Tehran calendar date (mirrors nextTehranCalendarDate). */
export function prevTehranCalendarDate(tehranDateStr: string): string {
  const noonPrevDayMs = tehranMidnightEpoch(tehranDateStr) - 12 * 3_600_000;
  return tehranParts(noonPrevDayMs).dateStr;
}

/**
 * Shift a Tehran calendar date by N days (negative allowed). Used by the
 * time picker so hour/minute steppers form one continuous datetime across
 * midnight instead of wrapping inside a single day.
 */
export function shiftTehranDate(tehranDateStr: string, deltaDays: number): string {
  let date = tehranDateStr;
  const step = deltaDays < 0 ? prevTehranCalendarDate : nextTehranCalendarDate;
  for (let i = 0; i < Math.abs(deltaDays); i++) date = step(date);
  return date;
}

/**
 * Pure continuous-datetime step for the time picker: 23:55 + 5 min becomes
 * tomorrow 00:00, and 00:00 − 5 min becomes yesterday 23:55. Bounds (today →
 * +PLAN_HORIZON_DAYS) are enforced by the caller, not here.
 */
export function shiftTimeOfDay(
  dateStr: string,
  hh: number,
  mm: number,
  deltaMin: number,
): { dateStr: string; hh: number; mm: number } {
  let total = hh * 60 + mm + deltaMin;
  let date = dateStr;
  while (total >= 24 * 60) {
    total -= 24 * 60;
    date = shiftTehranDate(date, 1);
  }
  while (total < 0) {
    total += 24 * 60;
    date = shiftTehranDate(date, -1);
  }
  return { dateStr: date, hh: Math.floor(total / 60), mm: total % 60 };
}

// ---- Arrive-by result classification (pure, unit-tested) ----

export type ArriveByViewState =
  /** A feasible journey exists; render it. */
  | { kind: "planned"; route: RouteResult }
  /**
   * No journey arrives by the deadline, but the forward Now route proves a
   * later arrival is possible: even leaving now cannot make it.
   */
  | { kind: "missed"; earliestArrivalMs: number }
  /** The Now route itself has no service: reuse the no-service state. */
  | { kind: "no_service"; route: RouteResult }
  /** Anything else (no topology, data gaps): generic fallback, no claims. */
  | { kind: "generic" };

/**
 * Classify a null arrive-by plan against the normal forward Now route so
 * the UI never infers "cannot make it" from a bare null. No routing here —
 * both routes are computed by the caller (planned via reverse propagation,
 * now via the forward engine) and only compared as instants.
 */
export function getArriveByViewState(
  plannedRoute: RouteResult | null,
  nowRoute: RouteResult | null,
  deadlineMs: number,
): ArriveByViewState {
  if (plannedRoute) return { kind: "planned", route: plannedRoute };
  if (!nowRoute) return { kind: "generic" };
  if (nowRoute.status === "no_service") return { kind: "no_service", route: nowRoute };
  if (nowRoute.status !== "complete") return { kind: "generic" };
  // A fully estimated Now arrival is a geometric guess, not proof that the
  // metro cannot make the deadline — never claim a miss on that basis.
  if (!nowRoute.legTiming.some((t) => t === "timetable")) {
    return { kind: "generic" };
  }
  const earliestArrivalMs = nowRoute.departedAtMs + nowRoute.totalSeconds * 1000;
  if (earliestArrivalMs > deadlineMs) return { kind: "missed", earliestArrivalMs };
  // Defensive: the Now journey arrives in time, so a plan should have been
  // found — never claim a miss, fall back to the generic state.
  return { kind: "generic" };
}

/**
 * Initial planning instant for entering a custom mode from Now: the next
 * strictly-future 5-minute Tehran boundary (never rounds down into the
 * past). 08:31 → 08:35, 08:35:00 → 08:40, 23:58 → tomorrow 00:00.
 * Uses Tehran wall-clock helpers only — never browser-local arithmetic.
 */
export function seedNextFiveMinutes(nowMs: number): {
  dateStr: string;
  hh: number;
  mm: number;
} {
  const parts = tehranParts(nowMs);
  const rounded = Math.ceil((parts.minuteOfDay + 1) / 5) * 5;
  if (rounded >= 24 * 60) {
    return { dateStr: nextTehranCalendarDate(parts.dateStr), hh: 0, mm: 0 };
  }
  return {
    dateStr: parts.dateStr,
    hh: Math.floor(rounded / 60),
    mm: rounded % 60,
  };
}

/**
 * Shift a planned Tehran instant by N minutes as one continuous datetime,
 * clamped to [minDateStr, maxDateStr]. Returns the new epoch ms, or null
 * when the step would leave the horizon (callers disable at the bounds).
 */
export function shiftPlanTime(
  atMs: number,
  deltaMin: number,
  minDateStr: string,
  maxDateStr: string,
): number | null {
  const parts = tehranParts(atMs);
  const next = shiftTimeOfDay(
    parts.dateStr,
    Math.floor(parts.minuteOfDay / 60),
    parts.minuteOfDay % 60,
    deltaMin,
  );
  if (next.dateStr < minDateStr || next.dateStr > maxDateStr) return null;
  return tehranMinuteToInstant(next.dateStr, next.hh * 60 + next.mm);
}

/**
 * Shift a planned Tehran instant by whole days, keeping the wall-clock time.
 * Returns the new epoch ms, or null outside [minDateStr, maxDateStr].
 */
export function shiftPlanDay(
  atMs: number,
  deltaDays: number,
  minDateStr: string,
  maxDateStr: string,
): number | null {
  const parts = tehranParts(atMs);
  const next = shiftTehranDate(parts.dateStr, deltaDays);
  if (next < minDateStr || next > maxDateStr) return null;
  return tehranMinuteToInstant(next, parts.minuteOfDay);
}

/** Compact summary of a planned instant: "Today · 08:30" parts. */
export function formatPlanSummary(
  lang: Lang,
  atMs: number,
  nowMs: number,
): { dateLabel: string; timeLabel: string } {
  const t = STRINGS[lang];
  const today = tehranParts(nowMs).dateStr;
  const tomorrow = nextTehranCalendarDate(today);
  const dateStr = tehranParts(atMs).dateStr;
  let dateLabel: string;
  if (dateStr === today) dateLabel = t.today;
  else if (dateStr === tomorrow) dateLabel = t.tomorrow;
  else {
    try {
      dateLabel = new Intl.DateTimeFormat(lang === "fa" ? "fa-IR" : "en-GB", {
        timeZone: TEHRAN_TZ,
        day: "numeric",
        month: "short",
      }).format(new Date(atMs));
    } catch {
      dateLabel = dateStr;
    }
  }
  return { dateLabel, timeLabel: persianDigits(formatTehranClock(atMs), lang) };
}

/** Jalali-aware display label for a Tehran calendar date. */
export function formatDateLabel(
  lang: Lang,
  dateStr: string,
  nowMs: number,
): string {
  const t = STRINGS[lang];
  const today = tehranParts(nowMs).dateStr;
  const relative =
    dateStr === today
      ? t.today
      : dateStr === nextTehranCalendarDate(today)
        ? t.tomorrow
        : null;
  let absolute: string;
  try {
    absolute = new Intl.DateTimeFormat(lang === "fa" ? "fa-IR" : "en-GB", {
      timeZone: TEHRAN_TZ,
      day: "numeric",
      month: "short",
    }).format(new Date(tehranMidnightEpoch(dateStr) + 12 * 3_600_000));
  } catch {
    absolute = dateStr;
  }
  return relative ? `${relative} · ${absolute}` : absolute;
}

/** How far ahead the time picker lets the user plan (today → +7 days). */
export const PLAN_HORIZON_DAYS = 7;

/**
 * Short badge for a planned Tehran calendar date whose timetable is not the
 * normal weekday one: Thursday service, Friday service, or official-holiday
 * service (with the holiday name when known). Returns null for normal days
 * so the day row stays quiet most of the week.
 */
export function describePlanDay(
  lang: Lang,
  dateStr: string,
  isHolidayDate: IsHolidayDate,
  holidayName?: { fa: string; en: string } | null,
): string | null {
  const t = STRINGS[lang];
  const scheduleDay = getMetroScheduleDayType(
    tehranMidnightEpoch(dateStr),
    isHolidayDate,
  );
  if (scheduleDay === "thursday") return t.scheduleThursday;
  if (scheduleDay === "holiday") {
    // Friday runs the holiday timetable by rule; only listed dates are
    // official holidays (with a name to show).
    if (isHolidayDate(dateStr) !== true) return t.scheduleFriday;
    const name = holidayName?.[lang];
    return name ? `${t.scheduleHoliday} · ${name}` : t.scheduleHoliday;
  }
  return null;
}

// ---- Shareable URL state (web planner) ----

export type TimeMode = "now" | "depart" | "arrive";

/**
 * Read the time plan from URL params. Unknown/invalid values fall back to
 * "now" (old links without time params keep working).
 */
export function parseTimeModeParams(params: URLSearchParams): {
  mode: TimeMode;
  at: Date | null;
} {
  const timeMode = params.get("timeMode");
  const rawAt = params.get("at");
  if ((timeMode === "depart" || timeMode === "arrive") && rawAt) {
    const parsed = parseDepartAtParam(rawAt);
    if (parsed) return { mode: timeMode, at: parsed };
  }
  return { mode: "now", at: null };
}

/** Write the time plan into URL params (mutates in place). */
export function applyTimeParams(
  params: URLSearchParams,
  mode: TimeMode,
  at: Date | null,
): void {
  params.delete("timeMode");
  params.delete("at");
  if (mode === "now" || !at) return;
  params.set("timeMode", mode);
  // Z-form ISO: explicit timezone, stable and machine-readable.
  params.set("at", at.toISOString());
}
