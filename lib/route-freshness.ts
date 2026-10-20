/** Timetable resolution is one minute. Recheck on request; never move a journey silently. */
export const ROUTE_STALE_AFTER_MS = 60_000;

export function isNowRouteStale(computedAtMs: number, nowMs: number): boolean {
  return Number.isFinite(computedAtMs) && Number.isFinite(nowMs) && nowMs - computedAtMs >= ROUTE_STALE_AFTER_MS;
}
