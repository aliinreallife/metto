import { STATIONS, type Station } from "./metro-data"
import { type Lang, persianDigits } from "./i18n"

export type AmenityKey = keyof Station["amenities"]

// Great-circle distance in kilometers.
export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371
  const dLat = ((bLat - aLat) * Math.PI) / 180
  const dLng = ((bLng - aLng) * Math.PI) / 180
  const lat1 = (aLat * Math.PI) / 180
  const lat2 = (bLat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export type NearbyResult = { station: Station; km: number }

// Nearest stations to a coordinate, optionally requiring a given amenity.
export function nearestStations(
  lat: number,
  lng: number,
  opts?: { amenity?: AmenityKey | null; limit?: number },
): NearbyResult[] {
  const limit = opts?.limit ?? 12
  let list = STATIONS
  if (opts?.amenity) list = list.filter((s) => s.amenities[opts.amenity as AmenityKey])
  return list
    .map((s) => ({ station: s, km: haversineKm(lat, lng, s.lat, s.lng) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, limit)
}

export function formatDistance(km: number, lang: Lang): string {
  if (km < 1) {
    const m = Math.round(km * 1000)
    return lang === "fa" ? `${persianDigits(m, lang)} متر` : `${m} m`
  }
  const v = km.toFixed(1)
  return lang === "fa" ? `${persianDigits(v, lang)} کیلومتر` : `${v} km`
}

// Google Maps walking/driving directions. Carries origin when known so it
// navigates from the user's current position straight to the station.
export function directionsUrl(
  dest: { lat: number; lng: number },
  origin?: { lat: number; lng: number } | null,
): string {
  const base = `https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}&travelmode=walking`
  return origin ? `${base}&origin=${origin.lat},${origin.lng}` : base
}

// Online-taxi launchers. Snapp/Tapsi don't expose a public deep-link format
// to prefill a destination, so these open the apps where the user confirms.
export function snappUrl(): string {
  return "https://app.snapp.taxi/"
}
export function tapsiUrl(): string {
  return "https://app.tapsi.cab/"
}
