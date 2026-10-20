import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { parsePedestrianRouteResult, walkingKey } from "@/lib/walking/route";
import { walkingQuota, WalkingQuotaStoreError } from "@/lib/walking/quota";
import { nearestStations } from "@/lib/geo";

class WalkingError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly provider?: { providerStatus: number; providerCode?: number },
  ) { super("Walking directions unavailable"); }
}

function failureResponse(error: WalkingError) {
  // Only fixed reason codes and numeric provider codes belong in logs. Provider
  // messages, exceptions and request URLs can contain credentials or locations.
  const diagnostic = { code: error.code, status: error.status, ...error.provider };
  if (error.status >= 500) console.error("[walking]", diagnostic);
  else console.info("[walking]", diagnostic);
  return NextResponse.json({ error: error.message, code: error.code }, {
    status: error.status,
    headers: {
      "Cache-Control": "no-store",
      ...(error.status === 429 || error.status >= 500 ? { "Retry-After": "60" } : {}),
    },
  });
}

async function providerErrorCode(response: Response): Promise<number | undefined> {
  try {
    const body = await response.json() as { error?: { code?: unknown } } | null;
    const code = body?.error?.code;
    return typeof code === "number" && Number.isInteger(code) && code >= 0 && code < 100_000 ? code : undefined;
  } catch { return undefined; }
}

// Cache before reserving quota: a previously requested pair costs no provider
// request. Both the profile and provider host are fixed, never browser inputs.
const loadWalkingRoute = unstable_cache(async (fromLat: number, fromLng: number, toLat: number, toLng: number) => {
  const apiKey = process.env.OPENROUTESERVICE_API_KEY;
  if (!apiKey) throw new WalkingError(503, "configuration_missing");
  try {
    if (!await walkingQuota.reserve()) throw new WalkingError(429, "quota_limited");
  } catch (error) {
    if (error instanceof WalkingQuotaStoreError) throw new WalkingError(503, "quota_store_unavailable");
    throw error;
  }
  let response: Response;
  try {
    response = await fetch("https://api.heigit.org/openrouteservice/v2/directions/foot-walking/geojson", {
      method: "POST",
      headers: { Authorization: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ coordinates: [[fromLng, fromLat], [toLng, toLat]], instructions: false }),
      signal: AbortSignal.timeout(8000), redirect: "error", cache: "no-store",
    });
  } catch (error) {
    await walkingQuota.cooldown();
    const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new WalkingError(503, timeout ? "provider_timeout" : "provider_network_error");
  }
  if (!response.ok) {
    const provider = { providerStatus: response.status, providerCode: await providerErrorCode(response) };
    // ORS 2009 = no connecting route, 2010 = no nearby routable point. These
    // are specific to these endpoints, so other walking legs must still run.
    if ([400, 404, 422].includes(response.status) && [2009, 2010].includes(provider.providerCode ?? -1)) {
      throw new WalkingError(422, "route_unavailable", provider);
    }
    if (response.status === 429 || response.status >= 500) await walkingQuota.cooldown();
    if (response.status === 429) throw new WalkingError(429, "provider_rate_limited", provider);
    if (response.status === 401 || response.status === 403) throw new WalkingError(503, "provider_auth_failed", provider);
    throw new WalkingError(response.status >= 500 ? 503 : 502, "provider_request_failed", provider);
  }
  let body: unknown;
  try { body = await response.json(); } catch { throw new WalkingError(502, "provider_invalid_response"); }
  const result = parsePedestrianRouteResult(body, { lat: fromLat, lng: fromLng }, { lat: toLat, lng: toLng });
  if (!result.route) {
    throw new WalkingError(result.reason === "snap_too_far" ? 422 : 502,
      result.reason === "snap_too_far" ? "endpoints_off_footpath" : "provider_invalid_response");
  }
  return result.route;
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
  if (!apiKey) return failureResponse(new WalkingError(503, "configuration_missing"));
  try {
    const route = await loadWalkingRoute(fromLat, fromLng, toLat, toLng);
    return NextResponse.json(route, { headers: { "Cache-Control": "private, max-age=86400" } });
  } catch (error) {
    return failureResponse(error instanceof WalkingError ? error : new WalkingError(503, "unexpected_error"));
  }
}
