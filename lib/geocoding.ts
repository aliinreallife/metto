import { type Lang } from "./i18n"

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
): Promise<PlaceResult[]> {
  const q = query.trim()
  if (q.length < 2) return []

  const cacheKey = `${lang}:${q}:${limit}`
  const cached = cache.get(cacheKey)
  if (cached) return cached

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
    // Restrict to Tehran bounding box (SW corner, NE corner)
    viewbox: "51.15,35.55,51.65,35.85",
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
    }))

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

// Shorten a long Nominatim display_name to its first component for map
// labels and banners ("Iran Mall, Tehran, ..." -> "Iran Mall").
export function shortPlaceLabel(displayName: string): string {
  const first = displayName.split(",")[0]?.trim()
  return first && first.length > 0 ? first : displayName
}
