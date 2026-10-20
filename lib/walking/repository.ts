import { MAX_SAVED_WALKS, usableSavedWalk, walkingRouteMatches, walkingKey, type WalkingRoute, type WalkPoint } from "./route";
import { walkStorage, type WalkStorage } from "./store";

export type WalkResult = { route: WalkingRoute; saved: boolean } | null;
const memory = new Map<string, WalkingRoute>();
const pending = new Map<string, Promise<WalkResult>>();
const failedAt = new Map<string, number>();
let providerRetryAfter = 0;
let queue: Promise<unknown> = Promise.resolve();
let nextRequestAt = 0;

function remember(key: string, route: WalkingRoute) {
  memory.delete(key);
  memory.set(key, route);
  while (memory.size > MAX_SAVED_WALKS) memory.delete(memory.keys().next().value!);
}

async function fetchWalkingRoute(from: WalkPoint, to: WalkPoint): Promise<unknown> {
  const params = new URLSearchParams({
    fromLat: from.lat.toFixed(5), fromLng: from.lng.toFixed(5),
    toLat: to.lat.toFixed(5), toLng: to.lng.toFixed(5),
  });
  const response = await fetch(`/api/walking?${params}`, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) {
    const seconds = Number(response.headers.get("Retry-After"));
    // A provider outage affects every pair, not just one key. Avoid a cascade
    // of 503 calls for direct, access and egress segments.
    if (response.status === 429 || response.status >= 500) {
      providerRetryAfter = Math.max(providerRetryAfter, Date.now() + (Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 300) : 60) * 1000);
    }
    throw new Error("Walking directions unavailable");
  }
  return response.json();
}

export async function getWalkingRoute(from: WalkPoint, to: WalkPoint, online: boolean, deps: {
  storage?: WalkStorage;
  fetchRoute?: typeof fetchWalkingRoute;
  now?: () => number;
  /** Scheduler injection for tests; production requests are spaced and serial. */
  wait?: (ms: number) => Promise<void>;
} = {}): Promise<WalkResult> {
  const key = walkingKey(from, to);
  if (!key) return null;
  const storage = deps.storage ?? walkStorage;
  const now = deps.now ?? Date.now;
  let stored: unknown = memory.get(key);
  if (!stored) {
    try { stored = await storage.read(key); } catch { stored = null; }
  }
  if (usableSavedWalk(stored, now(), online) && walkingRouteMatches(stored, from, to)) {
    remember(key, stored);
    return { route: stored, saved: true };
  }
  const fallback: WalkResult = usableSavedWalk(stored, now(), false) && walkingRouteMatches(stored, from, to) ? { route: stored, saved: true } : null;
  if (!online || now() < providerRetryAfter) return fallback;
  if (now() - (failedAt.get(key) ?? -Infinity) < 60_000) return fallback;
  if (pending.has(key)) return pending.get(key)!;
  const task = queue.then(async (): Promise<WalkResult> => {
    const wait = deps.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    await wait(Math.max(0, nextRequestAt - now()));
    // A queued request must not fire after the device has gone offline.
    if ((typeof navigator !== "undefined" && navigator.onLine === false) || now() < providerRetryAfter) return fallback;
    nextRequestAt = now() + 1500;
    try {
      const route = await (deps.fetchRoute ?? fetchWalkingRoute)(from, to);
      if (!usableSavedWalk(route, now(), true) || !walkingRouteMatches(route, from, to)) throw new Error("Invalid walking response");
      remember(key, route);
      try { await storage.write(key, route); } catch { /* Keep the valid in-memory route. */ }
      return { route, saved: false };
    } catch {
      failedAt.delete(key);
      failedAt.set(key, now());
      if (failedAt.size > 100) failedAt.delete(failedAt.keys().next().value!);
      return fallback;
    }
  }).finally(() => { pending.delete(key); });
  pending.set(key, task);
  queue = task.catch(() => null);
  return task;
}

export function resetWalkingMemoryForTests() {
  memory.clear(); pending.clear(); failedAt.clear(); queue = Promise.resolve(); nextRequestAt = 0; providerRetryAfter = 0;
}
