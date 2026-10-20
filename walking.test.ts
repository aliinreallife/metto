import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./app/api/walking/route";
import { getWalkingRoute, resetWalkingMemoryForTests } from "./lib/walking/repository";
import { parsePedestrianRoute, usableSavedWalk, validWalkingRoute, walkingKey, type WalkingRoute } from "./lib/walking/route";
import type { WalkStorage } from "./lib/walking/store";
import { directWalkVerdict } from "./lib/route-planning";
import { googleMapsDirectionsUrl } from "./lib/geo";
import { walkingQuota, createWalkingQuota, WalkingQuotaStoreError } from "./lib/walking/quota";

// Next's persistent cache needs a server request context. Exercise the actual
// provider/API behavior here; browser reuse is checked by the offline E2E tests.
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));

const NOW = new Date("2026-09-07T10:00:00+03:30").getTime();
const A = { lat: 35.7, lng: 51.4 };
const B = { lat: 35.701, lng: 51.401 };
const route = (savedAt = NOW): WalkingRoute => ({
  requestKey: walkingKey(A, B)!,
  coordinates: [[A.lng, A.lat], [51.4, 35.701], [B.lng, B.lat]],
  distanceMeters: 200, durationSeconds: 180, savedAt,
});
const response = () => ({ metadata: { query: { profile: "foot-walking" } }, features: [{
  geometry: { type: "LineString", coordinates: route().coordinates },
  properties: { summary: { distance: 200, duration: 180 } },
}] });
const request = (params = "fromLat=35.7&fromLng=51.4&toLat=35.701&toLng=51.401") =>
  new Request(`http://localhost/api/walking?${params}`);

beforeEach(() => {
  resetWalkingMemoryForTests();
  vi.spyOn(walkingQuota, "reserve").mockResolvedValue(true);
  vi.spyOn(walkingQuota, "cooldown").mockResolvedValue(undefined);
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("pedestrian route validation", () => {
  it("keeps walking directions directional and bounds invalid/huge requests", () => {
    expect(walkingKey(A, B)).not.toBe(walkingKey(B, A));
    expect(walkingKey(A, A)).toBeNull();
    expect(walkingKey({ lat: 91, lng: 0 }, B)).toBeNull();
    expect(walkingKey(A, { lat: 36, lng: 52 })).toBeNull();
    expect(walkingKey(A, { lat: Number.NaN, lng: 51 })).toBeNull();
  });
  it("retains real street geometry and rejects car profiles, malformed paths and distant snaps", () => {
    expect(parsePedestrianRoute(response(), A, B, NOW)).toEqual(route());
    expect(parsePedestrianRoute({ ...response(), metadata: { query: { profile: "driving-car" } } }, A, B)).toBeNull();
    const far = response();
    far.features[0].geometry.coordinates[0] = [52, 36];
    expect(parsePedestrianRoute(far, A, B)).toBeNull();
    expect(parsePedestrianRoute({ features: [] }, A, B)).toBeNull();
    expect(validWalkingRoute({ ...route(), durationSeconds: -1 })).toBe(false);
    expect(validWalkingRoute({ ...route(), distanceMeters: 1 })).toBe(false);
    expect(validWalkingRoute({ ...route(), coordinates: [[51, 35], [NaN, 35]] })).toBe(false);
  });
  it("counts short approaches between a point and its snapped footpath", () => {
    const shifted = { lat: A.lat + 0.0001, lng: A.lng };
    const result = parsePedestrianRoute(response(), shifted, B, NOW)!;
    expect(result.distanceMeters).toBeGreaterThan(200);
    expect(result.durationSeconds).toBeGreaterThan(180);
    expect(result.coordinates).toEqual(route().coordinates);
  });
  it("uses actual pedestrian duration rather than a straight-line shortcut in comparisons", () => {
    // Straight-line estimate ~2 min would win, but a real 10-min detour loses to 5-min metro.
    const args = { origin: A, dest: B, sameStation: false, metroTotalSeconds: 300, accessMinutes: 0 };
    expect(directWalkVerdict(args)).not.toBeNull();
    expect(directWalkVerdict({ ...args, walkingRoute: { ...route(), durationSeconds: 600 } })).toBeNull();
    expect(directWalkVerdict({ ...args, walkingRoute: route() })?.walkMin).toBe(3);
  });
  it("opens external Google directions in walking mode", () => {
    expect(new URL(googleMapsDirectionsUrl(A)).searchParams.get("travelmode")).toBe("walking");
  });
});

describe("server-only pedestrian API", () => {
  it("requests only the walking profile, keeps the key off the response, and retains geometry", async () => {
    vi.stubEnv("OPENROUTESERVICE_API_KEY", "test-walking-key");
    const fetcher = vi.fn().mockResolvedValue(Response.json(response()));
    vi.stubGlobal("fetch", fetcher);
    const result = await GET(request());
    expect(result.status).toBe(200);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.heigit.org/openrouteservice/v2/directions/foot-walking/geojson");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("test-walking-key");
    expect(JSON.parse(init.body).coordinates).toEqual([[A.lng, A.lat], [B.lng, B.lat]]);
    const json = await result.json();
    expect(json.coordinates).toEqual(route().coordinates);
    expect(JSON.stringify(json)).not.toContain("test-walking-key");
  });
  it("does not call the provider with missing credentials or invalid/out-of-area inputs", async () => {
    vi.stubEnv("OPENROUTESERVICE_API_KEY", "");
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect((await GET(request())).status).toBe(503);
    for (const params of ["", "fromLat=&fromLng=51&toLat=35&toLng=51", "fromLat=NaN&fromLng=51&toLat=35&toLng=51", "fromLat=48&fromLng=8&toLat=48.001&toLng=8.001"]) {
      expect((await GET(request(params))).status).toBe(400);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("handles quota limits, provider outages, and invalid geometry without fabricating a route", async () => {
    vi.stubEnv("OPENROUTESERVICE_API_KEY", "test-walking-key");
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("quota exceeded", { status: 429 }))
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(Response.json({ features: [] }));
    vi.stubGlobal("fetch", fetcher);
    const limited = await GET(request());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("60");
    expect(walkingQuota.cooldown).toHaveBeenCalledOnce();
    expect((await GET(request())).status).toBe(503);
    expect(walkingQuota.cooldown).toHaveBeenCalledTimes(2);
    expect((await GET(request())).status).toBe(502);
  });
  it("spends no provider request when the shared quota is exhausted", async () => {
    vi.stubEnv("OPENROUTESERVICE_API_KEY", "test-walking-key");
    vi.mocked(walkingQuota.reserve).mockResolvedValue(false);
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect((await GET(request())).status).toBe(429);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([{ status: 404, code: 2010 }, { status: 400, code: 2009 }])(
    "treats provider $status/code $code as unavailable endpoints, without a global cooldown",
    async ({ status, code }) => {
      vi.stubEnv("OPENROUTESERVICE_API_KEY", "test-walking-key");
      const privateMessage = "private provider message with coordinates 35.7,51.4";
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: { code, message: privateMessage } }, { status })));
      const result = await GET(request());
      expect(result.status).toBe(422);
      expect(result.headers.get("Retry-After")).toBeNull();
      expect(result.headers.get("Cache-Control")).toBe("no-store");
      const body = await result.json();
      expect(body.code).toBe("route_unavailable");
      expect(walkingQuota.cooldown).not.toHaveBeenCalled();
      expect(console.info).toHaveBeenCalledWith("[walking]", {
        code: "route_unavailable", status: 422, providerStatus: status, providerCode: code,
      });
      const output = JSON.stringify({ body, logs: vi.mocked(console.info).mock.calls });
      expect(output).not.toContain(privateMessage);
      expect(output).not.toContain("test-walking-key");
      expect(output).not.toContain("35.7");
      expect(console.error).not.toHaveBeenCalled();
    },
  );
  it("rejects a distant snapped footpath without claiming the provider is down", async () => {
    vi.stubEnv("OPENROUTESERVICE_API_KEY", "test-walking-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(response())));
    const result = await GET(request("fromLat=35.702&fromLng=51.4&toLat=35.701&toLng=51.401"));
    expect(result.status).toBe(422);
    expect((await result.json()).code).toBe("endpoints_off_footpath");
    expect(result.headers.get("Retry-After")).toBeNull();
    expect(walkingQuota.cooldown).not.toHaveBeenCalled();
  });
  it("retains genuine provider outages even if their body carries a route error code", async () => {
    vi.stubEnv("OPENROUTESERVICE_API_KEY", "test-walking-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: { code: 2010 } }, { status: 503 })));
    const result = await GET(request());
    expect(result.status).toBe(503);
    expect(result.headers.get("Retry-After")).toBe("60");
    expect((await result.json()).code).toBe("provider_request_failed");
    expect(walkingQuota.cooldown).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalledWith("[walking]", {
      code: "provider_request_failed", status: 503, providerStatus: 503, providerCode: 2010,
    });
  });
  it("identifies invalid provider JSON without logging its contents", async () => {
    vi.stubEnv("OPENROUTESERVICE_API_KEY", "test-walking-key");
    const privateBody = "private provider response";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(privateBody)));
    const result = await GET(request());
    expect(result.status).toBe(502);
    expect((await result.json()).code).toBe("provider_invalid_response");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(privateBody);
  });
  it.each([401, 403])("identifies provider authentication failure (%i) without exposing its response", async (status) => {
    vi.stubEnv("OPENROUTESERVICE_API_KEY", "test-walking-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: { message: "test-walking-key" } }, { status })));
    const result = await GET(request());
    expect(result.status).toBe(503);
    expect((await result.json()).code).toBe("provider_auth_failed");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("test-walking-key");
  });
  it("distinguishes provider timeouts from network failures", async () => {
    vi.stubEnv("OPENROUTESERVICE_API_KEY", "test-walking-key");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(Object.assign(new Error("private timeout URL"), { name: "TimeoutError" })));
    const result = await GET(request());
    expect(result.status).toBe(503);
    expect((await result.json()).code).toBe("provider_timeout");
    expect(walkingQuota.cooldown).toHaveBeenCalledOnce();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private timeout URL");
  });
  it("distinguishes an unavailable shared quota store from an exhausted budget", async () => {
    vi.stubEnv("OPENROUTESERVICE_API_KEY", "test-walking-key");
    vi.mocked(walkingQuota.reserve).mockRejectedValue(new WalkingQuotaStoreError());
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const result = await GET(request());
    expect(result.status).toBe(503);
    expect((await result.json()).code).toBe("quota_store_unavailable");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not leak unexpected exception messages", async () => {
    vi.stubEnv("OPENROUTESERVICE_API_KEY", "test-walking-key");
    vi.mocked(walkingQuota.reserve).mockRejectedValue(new Error("private Redis URL and token"));
    const result = await GET(request());
    expect(result.status).toBe(503);
    const body = await result.json();
    expect(body.code).toBe("unexpected_error");
    expect(JSON.stringify({ body, logs: vi.mocked(console.error).mock.calls })).not.toContain("private Redis URL and token");
  });
});

describe("walking quota budgets", () => {
  it("enforces a rolling minute without a burst at the minute boundary", async () => {
    let time = NOW;
    const quota = createWalkingQuota({ now: () => time });
    const accepted = await Promise.all(Array.from({ length: 36 }, () => quota.reserve()));
    expect(accepted.filter(Boolean)).toHaveLength(35);
    time += 59_999; expect(await quota.reserve()).toBe(false);
    time += 2; expect(await quota.reserve()).toBe(true);
    await quota.cooldown(); expect(await quota.reserve()).toBe(false);
    time += 60_001; expect(await quota.reserve()).toBe(true);
  });
  it("caps the rolling day and frees expired requests", async () => {
    let time = NOW;
    const quota = createWalkingQuota({ now: () => time });
    for (let i = 0; i < 1900; i++) {
      time = NOW + Math.floor(i / 35) * 60_001;
      expect(await quota.reserve()).toBe(true);
    }
    time += 60_001; expect(await quota.reserve()).toBe(false);
    time = NOW + 86_400_001; expect(await quota.reserve()).toBe(true);
  });
  it("uses the shared reservation and fails closed if its store fails", async () => {
    const sharedReserve = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false).mockRejectedValueOnce(new Error("unavailable"));
    const sharedCooldown = vi.fn().mockResolvedValue(undefined);
    const quota = createWalkingQuota({ now: () => NOW, sharedReserve, sharedCooldown });
    expect(await quota.reserve()).toBe(true);
    expect(await quota.reserve()).toBe(false);
    await expect(quota.reserve()).rejects.toBeInstanceOf(WalkingQuotaStoreError);
    await quota.cooldown(); expect(sharedCooldown).toHaveBeenCalledOnce();
  });
  it("keeps a local cooldown when the shared store fails, without logging secrets", async () => {
    const quota = createWalkingQuota({ now: () => NOW, sharedCooldown: async () => { throw new Error("private Redis URL and token"); } });
    await quota.cooldown();
    expect(await quota.reserve()).toBe(false);
    expect(console.warn).toHaveBeenCalledWith("[walking]", { code: "quota_cooldown_store_unavailable" });
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain("private Redis URL and token");
  });
});

describe("bounded offline walking reuse", () => {
  function backend(value: unknown = null) {
    return { read: vi.fn().mockResolvedValue(value), write: vi.fn().mockResolvedValue(undefined) } satisfies WalkStorage;
  }
  const defaults = { now: () => NOW, wait: async () => {} };
  it("keeps unrelated walking legs working after an endpoint has no route", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const reverse = { ...route(), requestKey: walkingKey(B, A)!, coordinates: [...route().coordinates].reverse() };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ error: "Walking directions unavailable", code: "route_unavailable" }, { status: 422 }))
      .mockResolvedValueOnce(Response.json(reverse));
    vi.stubGlobal("fetch", fetcher);
    const deps = { ...defaults, storage: backend() };
    expect(await getWalkingRoute(A, B, true, deps)).toBeNull();
    expect((await getWalkingRoute(B, A, true, deps))?.route).toEqual(reverse);
    expect(await getWalkingRoute(A, B, true, deps)).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([429, 503])("still pauses queued walking legs after a shared %i failure and resumes later", async (status) => {
    let time = NOW;
    vi.spyOn(Date, "now").mockImplementation(() => time);
    const reverse = { ...route(), requestKey: walkingKey(B, A)!, coordinates: [...route().coordinates].reverse() };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ error: "Unavailable" }, { status, headers: { "Retry-After": "60" } }))
      .mockResolvedValueOnce(Response.json(reverse));
    vi.stubGlobal("fetch", fetcher);
    const deps = { ...defaults, now: () => time, storage: backend() };
    expect(await Promise.all([getWalkingRoute(A, B, true, deps), getWalkingRoute(B, A, true, deps)])).toEqual([null, null]);
    expect(fetcher).toHaveBeenCalledOnce();
    time += 60_001;
    expect((await getWalkingRoute(B, A, true, deps))?.route).toEqual(reverse);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("pauses other legs after a transport timeout, preserves cached paths, and resumes after cooldown", async () => {
    let time = NOW;
    vi.spyOn(Date, "now").mockImplementation(() => time);
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new DOMException("Timed out", "TimeoutError"))
      .mockImplementationOnce(async () => Response.json(route(time)));
    vi.stubGlobal("fetch", fetcher);
    const deps = { ...defaults, now: () => time, storage: backend() };
    expect(await Promise.all([
      getWalkingRoute(A, B, true, deps), getWalkingRoute(B, A, true, deps),
    ])).toEqual([null, null]);
    expect(fetcher).toHaveBeenCalledOnce();
    const reverse = { ...route(), requestKey: walkingKey(B, A)!, coordinates: [...route().coordinates].reverse() };
    expect(await getWalkingRoute(B, A, true, { ...deps, storage: backend(reverse) }))
      .toEqual({ route: reverse, saved: true });
    expect(fetcher).toHaveBeenCalledOnce();
    time += 60_001;
    expect((await getWalkingRoute(A, B, true, deps))?.route).toEqual(route(time));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("reuses a saved path offline and never sends a request", async () => {
    const fetchRoute = vi.fn();
    const result = await getWalkingRoute(A, B, false, { ...defaults, storage: backend(route()), fetchRoute });
    expect(result?.route).toEqual(route());
    expect(result?.saved).toBe(true);
    expect(fetchRoute).not.toHaveBeenCalled();
  });
  it("refreshes older paths online, but permits bounded older paths offline", async () => {
    const old = route(NOW - 10 * 86_400_000);
    expect(usableSavedWalk(old, NOW, true)).toBe(false);
    expect(usableSavedWalk(old, NOW, false)).toBe(true);
    expect(usableSavedWalk(route(NOW - 31 * 86_400_000), NOW, false)).toBe(false);
    const fetchRoute = vi.fn().mockResolvedValue(route());
    const storage = backend(old);
    expect((await getWalkingRoute(A, B, true, { ...defaults, storage, fetchRoute }))?.saved).toBe(false);
    expect(storage.write).toHaveBeenCalledWith(walkingKey(A, B), route());
  });
  it("deduplicates simultaneous requests and later reuses the result", async () => {
    const fetchRoute = vi.fn().mockResolvedValue(route());
    const deps = { ...defaults, storage: backend(), fetchRoute };
    const [a, b] = await Promise.all([getWalkingRoute(A, B, true, deps), getWalkingRoute(A, B, true, deps)]);
    expect(a?.route).toEqual(b?.route);
    await getWalkingRoute(A, B, true, deps);
    expect(fetchRoute).toHaveBeenCalledTimes(1);
  });
  it("does not use a route stored for different endpoints or reuse the reverse trip", async () => {
    const fetchRoute = vi.fn();
    const reverse = { ...route(), requestKey: walkingKey(B, A)!, coordinates: [...route().coordinates].reverse() };
    expect(await getWalkingRoute(A, B, false, { ...defaults, storage: backend(reverse), fetchRoute })).toBeNull();
    expect(fetchRoute).not.toHaveBeenCalled();
  });
  it("backs off failures, returns safe fallback, and survives blocked storage", async () => {
    const fetchRoute = vi.fn().mockRejectedValue(new Error("offline"));
    const storage = backend(); storage.read.mockRejectedValue(new Error("blocked"));
    const deps = { ...defaults, storage, fetchRoute };
    expect(await getWalkingRoute(A, B, true, deps)).toBeNull();
    expect(await getWalkingRoute(A, B, true, deps)).toBeNull();
    expect(fetchRoute).toHaveBeenCalledTimes(1);
    resetWalkingMemoryForTests();
    storage.write.mockRejectedValue(new Error("quota"));
    fetchRoute.mockResolvedValue(route());
    expect((await getWalkingRoute(A, B, true, deps))?.route).toEqual(route());
  });
  it("spaces distinct requests instead of sending all walking legs together", async () => {
    let time = NOW; const starts: number[] = [];
    const fetchRoute = vi.fn(async (from: typeof A, to: typeof B) => {
      starts.push(time);
      return { ...route(time), requestKey: walkingKey(from, to)!, coordinates: [[from.lng, from.lat], [to.lng, to.lat]] };
    });
    const deps = { storage: backend(), now: () => time, wait: async (ms: number) => { time += ms; }, fetchRoute };
    await Promise.all([getWalkingRoute(A, B, true, deps), getWalkingRoute(B, A, true, deps)]);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(1500);
  });
});
