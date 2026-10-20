import { haversineKm } from "../geo";

export type WalkPoint = { lat: number; lng: number };
export type WalkingRoute = {
  requestKey: string;
  /** GeoJSON order: longitude, latitude. Only the pedestrian street path. */
  coordinates: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
  savedAt: number;
};

export const MAX_WALK_KM = 15;
export const WALK_CACHE_DAYS = 7;
export const WALK_OFFLINE_DAYS = 30;
export const MAX_SAVED_WALKS = 20;
const DAY_MS = 86_400_000;

export function validWalkPoint(value: unknown): value is WalkPoint {
  if (!value || typeof value !== "object") return false;
  const p = value as WalkPoint;
  return Number.isFinite(p.lat) && Math.abs(p.lat) <= 90 &&
    Number.isFinite(p.lng) && Math.abs(p.lng) <= 180;
}

/** Direction matters: pedestrian gates/restrictions can be directional too. */
export function walkingKey(from: WalkPoint | null | undefined, to: WalkPoint | null | undefined): string | null {
  if (!validWalkPoint(from) || !validWalkPoint(to)) return null;
  const distance = haversineKm(from.lat, from.lng, to.lat, to.lng);
  if (!Number.isFinite(distance) || distance < 0.005 || distance > MAX_WALK_KM) return null;
  return `${from.lat.toFixed(5)},${from.lng.toFixed(5)}>${to.lat.toFixed(5)},${to.lng.toFixed(5)}`;
}

export function validWalkingRoute(value: unknown): value is WalkingRoute {
  if (!value || typeof value !== "object") return false;
  const r = value as WalkingRoute;
  const valid = typeof r.requestKey === "string" && r.requestKey.length < 150 &&
    Number.isFinite(r.distanceMeters) && r.distanceMeters > 0 && r.distanceMeters <= 100_000 &&
    Number.isFinite(r.durationSeconds) && r.durationSeconds > 0 && r.durationSeconds <= 86_400 &&
    Number.isFinite(r.savedAt) && Array.isArray(r.coordinates) &&
    r.coordinates.length >= 2 && r.coordinates.length <= 10_000 &&
    r.coordinates.every((p) => Array.isArray(p) && p.length === 2 && validWalkPoint({ lng: p[0], lat: p[1] }));
  if (!valid) return false;
  const first = r.coordinates[0];
  const last = r.coordinates[r.coordinates.length - 1];
  // A street path cannot be shorter than its endpoints' straight-line distance.
  return r.distanceMeters + 5 >= haversineKm(first[1], first[0], last[1], last[0]) * 1000;
}

export function usableSavedWalk(value: unknown, now: number, online: boolean): value is WalkingRoute {
  if (!validWalkingRoute(value)) return false;
  const age = now - value.savedAt;
  return age >= -60_000 && age <= (online ? WALK_CACHE_DAYS : WALK_OFFLINE_DAYS) * DAY_MS;
}

export function walkingRouteMatches(route: WalkingRoute, from: WalkPoint, to: WalkPoint): boolean {
  if (route.requestKey !== walkingKey(from, to)) return false;
  const first = route.coordinates[0];
  const last = route.coordinates[route.coordinates.length - 1];
  return haversineKm(from.lat, from.lng, first[1], first[0]) <= 0.15 &&
    haversineKm(to.lat, to.lng, last[1], last[0]) <= 0.15;
}

type PedestrianRouteResult =
  | { route: WalkingRoute; reason?: never }
  | { route: null; reason: "invalid_response" | "snap_too_far" };

/** Separate unsupported endpoints from a malformed provider response. */
export function parsePedestrianRouteResult(value: unknown, from: WalkPoint, to: WalkPoint, now = Date.now()): PedestrianRouteResult {
  const invalid = { route: null, reason: "invalid_response" } as const;
  if (!value || typeof value !== "object") return invalid;
  const data = value as {
    metadata?: { query?: { profile?: string } };
    features?: { geometry?: { type?: string; coordinates?: unknown }; properties?: { summary?: { distance?: number; duration?: number } } }[];
  };
  const profile = data.metadata?.query?.profile;
  if (profile && profile !== "foot-walking") return invalid;
  const feature = data.features?.[0];
  if (feature?.geometry?.type !== "LineString") return invalid;
  const route = {
    requestKey: walkingKey(from, to),
    coordinates: feature.geometry.coordinates,
    distanceMeters: feature.properties?.summary?.distance,
    durationSeconds: feature.properties?.summary?.duration,
    savedAt: now,
  };
  if (!validWalkingRoute(route)) return invalid;
  const first = route.coordinates[0];
  const last = route.coordinates[route.coordinates.length - 1];
  const startGap = haversineKm(from.lat, from.lng, first[1], first[0]);
  const endGap = haversineKm(to.lat, to.lng, last[1], last[0]);
  // Station entrance data is not yet available. Keep small last-metre
  // approaches explicit; never snap across a neighbourhood to claim success.
  if (startGap > 0.15 || endGap > 0.15) return { route: null, reason: "snap_too_far" };
  const approachMeters = (startGap + endGap) * 1000;
  return {
    route: {
      ...route,
      distanceMeters: route.distanceMeters + approachMeters,
      durationSeconds: route.durationSeconds + approachMeters / (5000 / 3600),
    },
  };
}

/** Reject wrong profiles, malformed paths and distant snaps rather than inventing a street route. */
export function parsePedestrianRoute(value: unknown, from: WalkPoint, to: WalkPoint, now = Date.now()): WalkingRoute | null {
  return parsePedestrianRouteResult(value, from, to, now).route;
}
