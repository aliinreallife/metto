import { type Lang } from "./i18n"

export type PlaceResult = {
  displayName: string
  lat: number
  lng: number
  type: string
}

const cache = new Map<string, PlaceResult[]>()
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
