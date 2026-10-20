import { Redis } from "@upstash/redis";
import { resolveRedisConfig } from "../holidays/store";

const MINUTE = 60_000;
const DAY = 86_400_000;
// Leave headroom under the shared free key's 40/minute and 2000/day limits.
export const WALK_MINUTE_BUDGET = 35;
export const WALK_DAY_BUDGET = 1900;

/** Atomic rolling windows across deployments sharing the same Redis. */
const RESERVE = `
if redis.call('EXISTS', KEYS[2]) == 1 then return 0 end
local now = tonumber(ARGV[1])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - 86400000)
if redis.call('ZCARD', KEYS[1]) >= ${WALK_DAY_BUDGET} then return 0 end
if redis.call('ZCOUNT', KEYS[1], now - 60000, '+inf') >= ${WALK_MINUTE_BUDGET} then return 0 end
redis.call('ZADD', KEYS[1], now, ARGV[2])
redis.call('PEXPIRE', KEYS[1], 86400000)
return 1
`;
const QUOTA_KEY = "metto:walking:quota:v1";
const COOLDOWN_KEY = "metto:walking:cooldown:v1";

export class WalkingQuotaStoreError extends Error {
  constructor() { super("Walking quota store unavailable"); }
}

export function createWalkingQuota(deps: {
  now?: () => number;
  sharedReserve?: () => Promise<boolean>;
  sharedCooldown?: () => Promise<void>;
} = {}) {
  const now = deps.now ?? Date.now;
  let requests: number[] = [];
  let cooldownUntil = 0;
  return {
    async reserve(): Promise<boolean> {
      const time = now();
      if (time < cooldownUntil) return false;
      if (deps.sharedReserve) {
        // An unavailable configured quota store must not spend provider quota.
        try { return await deps.sharedReserve(); } catch { throw new WalkingQuotaStoreError(); }
      }
      // This fallback protects one process. A shared serverless budget requires
      // the existing optional Upstash/KV binding (see README).
      requests = requests.filter((at) => at > time - DAY);
      if (requests.length >= WALK_DAY_BUDGET ||
        requests.filter((at) => at >= time - MINUTE).length >= WALK_MINUTE_BUDGET) return false;
      requests.push(time);
      return true;
    },
    async cooldown() {
      cooldownUntil = now() + MINUTE;
      try { await deps.sharedCooldown?.(); } catch {
        // Local cooldown still applies; never log a Redis URL, token or error body.
        console.warn("[walking]", { code: "quota_cooldown_store_unavailable" });
      }
    },
  };
}

let redis: Redis | undefined;
const config = resolveRedisConfig();
function client() { return redis ??= new Redis(config!); }
export const walkingQuota = createWalkingQuota(config ? {
  sharedReserve: async () => Number(await client().eval(RESERVE,
    [QUOTA_KEY, COOLDOWN_KEY], [Date.now(), crypto.randomUUID()])) === 1,
  sharedCooldown: async () => { await client().set(COOLDOWN_KEY, "1", { ex: 60 }); },
} : {});
