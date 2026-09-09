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
