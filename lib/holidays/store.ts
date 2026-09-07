// Holiday cache storage. Production impl is Upstash Redis (Vercel
// Marketplace integration) via `Redis.fromEnv()` — persistent and
// serverless-safe. Tests inject the in-memory impl; no I/O in routing.

import { Redis } from "@upstash/redis";
import type { HolidayCacheEntry } from "./types";

const KEY_PREFIX = "holiday:";
const META_KEY = "holidays:meta:lastSuccessfulFetch";

export interface HolidayStore {
  /** `null` = cache miss / unknown (distinct from confirmed false). */
  get(gregorianDate: string): Promise<HolidayCacheEntry | null>;
  set(entry: HolidayCacheEntry): Promise<void>;
  getLastSuccessfulFetch(): Promise<string | null>;
  setLastSuccessfulFetch(isoTimestamp: string): Promise<void>;
}

function keyFor(gregorianDate: string): string {
  return `${KEY_PREFIX}${gregorianDate}`;
}

function isValidEntry(v: unknown): v is HolidayCacheEntry {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.jalaliDate === "string" &&
    typeof e.gregorianDate === "string" &&
    typeof e.isHoliday === "boolean" &&
    Array.isArray(e.events) &&
    typeof e.fetchedAt === "string" &&
    e.source === "timestamp.ir"
  );
}

export function createRedisHolidayStore(
  redis: Redis = Redis.fromEnv(),
): HolidayStore {
  return {
    async get(gregorianDate: string) {
      const raw = await redis.get<HolidayCacheEntry>(keyFor(gregorianDate));
      return isValidEntry(raw) ? raw : null;
    },
    async set(entry: HolidayCacheEntry) {
      await redis.set(keyFor(entry.gregorianDate), entry);
    },
    async getLastSuccessfulFetch() {
      const raw = await redis.get<string>(META_KEY);
      return typeof raw === "string" ? raw : null;
    },
    async setLastSuccessfulFetch(isoTimestamp: string) {
      await redis.set(META_KEY, isoTimestamp);
    },
  };
}

/** Test/seam impl: same tri-state contract, no network. */
export function createMemoryHolidayStore(
  initial?: Record<string, HolidayCacheEntry>,
): HolidayStore & { entries: Map<string, HolidayCacheEntry> } {
  const entries = new Map<string, HolidayCacheEntry>(
    Object.entries(initial ?? {}),
  );
  let lastSuccessfulFetch: string | null = null;
  return {
    entries,
    async get(gregorianDate: string) {
      return entries.get(gregorianDate) ?? null;
    },
    async set(entry: HolidayCacheEntry) {
      entries.set(entry.gregorianDate, entry);
    },
    async getLastSuccessfulFetch() {
      return lastSuccessfulFetch;
    },
    async setLastSuccessfulFetch(isoTimestamp: string) {
      lastSuccessfulFetch = isoTimestamp;
    },
  };
}
