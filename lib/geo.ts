import { getAllStations } from "./metro/selectors";
import type { MetroStation, StationAmenities } from "./metro/types";
import { type Lang, persianDigits } from "./i18n";

export type AmenityKey = keyof StationAmenities;

// Great-circle distance in kilometers.
export function haversineKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const lat1 = (aLat * Math.PI) / 180;
  const lat2 = (bLat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type NearbyResult = { station: MetroStation; km: number };

// Nearest stations to a coordinate, optionally requiring all listed amenities.
export function nearestStations(
  lat: number,
  lng: number,
  opts?: { amenities?: AmenityKey[]; limit?: number },
) {
  const limit = opts?.limit ?? 12;
  const required = opts?.amenities ?? [];
  const all = getAllStations();
  const list =
    required.length > 0
      ? all.filter((s) => required.every((k) => s.amenities[k] === true))
      : all;
  return list
    .map((s) => ({
      station: s,
      km: haversineKm(lat, lng, s.location.lat, s.location.lng),
    }))
    .sort((a, b) => a.km - b.km)
    .slice(0, limit);
}

export function formatDistance(km: number, lang: Lang): string {
  if (km < 1) {
    const m = Math.round(km * 1000);
    return lang === "fa" ? `${persianDigits(m, lang)} متر` : `${m} m`;
  }
  const v = km.toFixed(1);
  return lang === "fa" ? `${persianDigits(v, lang)} کیلومتر` : `${v} km`;
}

// ---- Walking estimates for searched places (e.g. Iran Mall) ----

// Average urban walking speed. 5 km/h ≈ 12 min/km — a common conservative
// default for "guess the walk time" without routing data.
export const WALK_KM_PER_H = 5;

// Beyond this straight-line distance we warn that the place is too far to
// comfortably walk from its nearest station.
export const TOO_FAR_WALK_KM = 1.5;

export function estimateWalkMinutes(distanceKm: number): number {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 0;
  return (distanceKm / WALK_KM_PER_H) * 60;
}

export function isTooFarToWalk(
  distanceKm: number,
  thresholdKm: number = TOO_FAR_WALK_KM,
): boolean {
  return Number.isFinite(distanceKm) && distanceKm > thresholdKm;
}

export function formatWalkTime(minutes: number, lang: Lang): string {
  const rounded = Math.round(minutes);
  if (rounded < 1) return lang === "fa" ? "کمتر از ۱ دقیقه" : "<1 min";
  return lang === "fa"
    ? `${persianDigits(rounded, lang)} دقیقه`
    : `${rounded} min`;
}

export type PlacePinParam = { lat: number; lng: number; label: string } | null;

// Shareable /map URL that preserves the route plus searched-place pins
// (e.g. Iran Mall). Param names must match parsePlaceParam in home-page
// and the parser in app/map/client.tsx.
export function buildMapHref(args: {
  from?: string | null;
  to?: string | null;
  originPlace?: PlacePinParam;
  destPlace?: PlacePinParam;
}): string {
  const params = new URLSearchParams();
  if (args.from) params.set("from", args.from);
  if (args.to) params.set("to", args.to);
  if (args.originPlace) {
    params.set("oPlat", String(args.originPlace.lat));
    params.set("oPlng", String(args.originPlace.lng));
    params.set("oPlabel", args.originPlace.label);
  }
  if (args.destPlace) {
    params.set("dPlat", String(args.destPlace.lat));
    params.set("dPlng", String(args.destPlace.lng));
    params.set("dPlabel", args.destPlace.label);
  }
  const qs = params.toString();
  return qs ? `/map?${qs}` : "/map";
}

// Same preserved state (route + place pins) on any tab path, so switching
// tabs never drops a half-filled selection or a searched landmark.
export function buildTabHref(
  base: string,
  args: {
    from?: string | null;
    to?: string | null;
    originPlace?: PlacePinParam;
    destPlace?: PlacePinParam;
  },
): string {
  const params = new URLSearchParams();
  if (args.from) params.set("from", args.from);
  if (args.to) params.set("to", args.to);
  if (args.originPlace) {
    params.set("oPlat", String(args.originPlace.lat));
    params.set("oPlng", String(args.originPlace.lng));
    params.set("oPlabel", args.originPlace.label);
  }
  if (args.destPlace) {
    params.set("dPlat", String(args.destPlace.lat));
    params.set("dPlng", String(args.destPlace.lng));
    params.set("dPlabel", args.destPlace.label);
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

// geo: URI — on Android this pops up the native app-chooser so the user can
// pick any installed app that handles locations: Google Maps, Waze, Snapp,
// Tapsi, etc. On iOS it opens Apple Maps. On desktop most browsers ignore it.
export function geoUrl(
  dest: { lat: number; lng: number },
  label: string,
): string {
  return `geo:${dest.lat},${dest.lng}?q=${dest.lat},${dest.lng}(${encodeURIComponent(label)})`;
}

// HTTPS Google Maps directions URL — safe desktop/laptop fallback.
// Opens a normal browser directions page in a new tab.
export function googleMapsDirectionsUrl(dest: { lat: number; lng: number }): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    `${dest.lat},${dest.lng}`,
  )}`;
}
