import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { parsePedestrianRoute, walkingKey } from "@/lib/walking/route";
import { walkingQuota } from "@/lib/walking/quota";
import { nearestStations } from "@/lib/geo";

class WalkingError extends Error {
  constructor(readonly status: number) { super("Walking directions unavailable"); }
}

// Cache before reserving quota: a previously requested pair costs no provider
// request. Both the profile and provider host are fixed, never browser inputs.
const loadWalkingRoute = unstable_cache(async (fromLat: number, fromLng: number, toLat: number, toLng: number) => {
  const apiKey = process.env.OPENROUTESERVICE_API_KEY;
  if (!apiKey || !await walkingQuota.reserve()) throw new WalkingError(503);
  let response: Response;
  try {
    response = await fetch("https://api.heigit.org/openrouteservice/v2/directions/foot-walking/geojson", {
      method: "POST",
      headers: { Authorization: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ coordinates: [[fromLng, fromLat], [toLng, toLat]], instructions: false }),
      signal: AbortSignal.timeout(8000), redirect: "error", cache: "no-store",
    });
  } catch {
    await walkingQuota.cooldown();
    throw new WalkingError(503);
  }
  if (!response.ok) {
    if (response.status === 429 || response.status >= 500) await walkingQuota.cooldown();
    throw new WalkingError(503);
  }
  const route = parsePedestrianRoute(await response.json(), { lat: fromLat, lng: fromLng }, { lat: toLat, lng: toLng });
  if (!route) throw new WalkingError(502);
  return route;
}, ["pedestrian-heigit-v2"], { revalidate: 86_400 });

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const fields = ["fromLat", "fromLng", "toLat", "toLng"] as const;
  if (fields.some((name) => !params.get(name)?.trim())) {
    return NextResponse.json({ error: "Missing walking endpoints" }, { status: 400 });
  }
  const [fromLat, fromLng, toLat, toLng] = fields.map((name) => Number(Number(params.get(name)).toFixed(5)));
  const from = { lat: fromLat, lng: fromLng };
  const to = { lat: toLat, lng: toLng };
  if (!walkingKey(from, to) || [from, to].some((point) => {
    const nearest = nearestStations(point.lat, point.lng, { limit: 1 })[0];
    return !nearest || nearest.km > 15;
  })) {
    return NextResponse.json({ error: "Invalid or unsupported walking endpoints" }, { status: 400 });
  }
  const apiKey = process.env.OPENROUTESERVICE_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Walking directions unavailable" }, { status: 503 });
  try {
    const route = await loadWalkingRoute(fromLat, fromLng, toLat, toLng);
    return NextResponse.json(route, { headers: { "Cache-Control": "private, max-age=86400" } });
  } catch (error) {
    // No credential, provider body, or location-bearing URL in error logs.
    return NextResponse.json({ error: "Walking directions unavailable" }, {
      status: error instanceof WalkingError ? error.status : 503, headers: { "Retry-After": "60" },
    });
  }
}
