import type { CityId } from "./cities"
import { STRINGS, type Lang } from "./i18n"

export type PlaceResult = {
  displayName: string
  lat: number
  lng: number
  type: string
}

const cache = new Map<string, PlaceResult[]>()
const reverseCache = new Map<string, string | null>()
let controller: AbortController | null = null

export async function searchPlaces(
  query: string,
  lang: Lang,
  limit = 5,
  city: CityId = "tehran",
): Promise<PlaceResult[]> {
  const q = query.trim()
  if (q.length < 2) return []

  const cacheKey = `${city}:${lang}:${q}:${limit}`
  const cached = cache.get(cacheKey)
  if (cached) return cached

  // Online-only enhancement: never burn requests while offline.
  if (typeof navigator !== "undefined" && navigator.onLine === false) return []

  // Cancel any in-flight request
  controller?.abort()
  controller = new AbortController()

  const params = new URLSearchParams({
    q,
    format: "json",
    limit: String(limit),
    countrycodes: "ir",
    "accept-language": lang === "fa" ? "fa,en" : "en,fa",
    addressdetails: "1",
    // Keep place results inside the selected city.
    viewbox: city === "mashhad" ? "59.35,36.10,59.85,36.50" : "51.15,35.55,51.65,35.85",
    bounded: "1",
  })

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?${params}`,
      {
        signal: controller.signal,
        headers: { "User-Agent": "TehranMetroApp/1.0" },
      },
    )
    if (!res.ok) return []

    const data: Array<{
      display_name: string
      lat: string
      lon: string
      type: string
    }> = await res.json()

    const results: PlaceResult[] = data.map((item) => ({
      displayName: item.display_name,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      type: item.type,
    })).filter(place => Number.isFinite(place.lat) && Number.isFinite(place.lng) &&
      (city !== "mashhad" || (place.lat >= 36.10 && place.lat <= 36.50 && place.lng >= 59.35 && place.lng <= 59.85)))

    cache.set(cacheKey, results)
    return results
  } catch {
    return []
  }
}

// Reverse-geocode a coordinate to a short neighborhood name (for GPS-based
// origins, shown Iran-Mall-style: "neighborhood → nearest station").
// Returns null on any failure — callers fall back to a generic label.
export async function reverseGeocode(
  lat: number,
  lng: number,
  lang: Lang,
): Promise<string | null> {
  const cacheKey = `${lang}:${lat.toFixed(4)},${lng.toFixed(4)}`
  if (reverseCache.has(cacheKey)) return reverseCache.get(cacheKey) ?? null

  // Reverse geocoding is online-only; callers fall back to a generic label.
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return null
  }

  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    format: "json",
    "accept-language": lang === "fa" ? "fa,en" : "en,fa",
    addressdetails: "1",
    zoom: "14",
  })

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?${params}`,
      {
        headers: { "User-Agent": "TehranMetroApp/1.0" },
      },
    )
    if (!res.ok) {
      reverseCache.set(cacheKey, null)
      return null
    }

    const data: {
      display_name?: string
      address?: Record<string, string>
    } = await res.json()

    const addr = data.address ?? {}
    const name =
      addr.neighbourhood ??
      addr.suburb ??
      addr.quarter ??
      addr.residential ??
      addr.road ??
      null

    reverseCache.set(cacheKey, name)
    return name
  } catch {
    reverseCache.set(cacheKey, null)
    return null
  }
}

/** Recognize coordinate-only names that older map picks saved in links/storage.
 * Keep the actual lat/lng in pin data: only the visible label changes.
 */
export function isUnresolvedMapPointLabel(label: string): boolean {
  const text = label.trim()
  if (!text || text === STRINGS.fa.selectedMapPoint || text === STRINGS.en.selectedMapPoint) return true
  // The old map fallback saved a full coordinate pair. Some map displays
  // truncated it to its first component, which also needs sanitization.
  if (/^[+-]?\d{1,2}\.\d{3,}$/.test(text)) return true
  const pair = text.match(/^([+-]?\d{1,2}(?:\.\d+)?)\s*[,،]\s*([+-]?\d{1,3}(?:\.\d+)?)$/)
  if (!pair) return false
  return Math.abs(Number(pair[1])) <= 90 && Math.abs(Number(pair[2])) <= 180
}

/** A user-facing label for both map pins and planner cards. */
export function displayPlaceLabel(label: string, lang: Lang): string {
  return isUnresolvedMapPointLabel(label)
    ? STRINGS[lang].selectedMapPoint
    : shortPlaceLabel(label)
}

// Shorten a long Nominatim display_name to its first component for map
// labels and banners ("Iran Mall, Tehran, ..." -> "Iran Mall").
export function shortPlaceLabel(displayName: string): string {
  const first = displayName.split(",")[0]?.trim()
  return first && first.length > 0 ? first : displayName
}
