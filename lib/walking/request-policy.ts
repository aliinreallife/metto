import { haversineKm } from "../geo";
import { shouldSuggestWalk } from "../route-planning";
import type { RouteResult } from "../route";
import { walkingKey, type WalkPoint } from "./route";

type Point = WalkPoint | null | undefined;
export type WalkingMetroPlan = Pick<RouteResult, "status" | "totalSeconds" | "initialWaitSeconds"> | null;

function samePoint(a: Point, b: Point): boolean {
  return !!a && !!b && a.lat === b.lat && a.lng === b.lng;
}

/** Request street geometry when it can affect the journey we present. */
export function shouldRequestDirectWalk(
  origin: Point,
  dest: Point,
  originStation: Point,
  destStation: Point,
  metro: WalkingMetroPlan,
): boolean {
  if (!origin || !dest || !walkingKey(origin, dest)) return false;
  // Exact place pins still need real direct/access/exit comparisons. A long
  // station approach can change the winner after street routing completes.
  if (!samePoint(origin, originStation) || !samePoint(dest, destStation)) return true;
  // Do not start a station-to-station request before the planner is ready.
  if (!metro || metro.status !== "complete") return false;
  // Use a brisk 6 km/h straight-line walk as a conservative screening floor,
  // faster than our normal 5 km/h estimate. Fetch borderline/short journeys;
  // skip obvious metro wins. This is not a pedestrian route or ETA.
  const briskWalkMinutes = haversineKm(origin.lat, origin.lng, dest.lat, dest.lng) / 6 * 60;
  return shouldSuggestWalk(briskWalkMinutes, metro.totalSeconds, 0, metro.initialWaitSeconds);
}
