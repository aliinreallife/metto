import { describe, expect, it } from "vitest";
import { isNowRouteStale, ROUTE_STALE_AFTER_MS } from "./lib/route-freshness";

describe("Now route freshness", () => {
  it("marks the result stale after one minute without changing the journey", () => {
    expect(isNowRouteStale(1000, 1000)).toBe(false);
    expect(isNowRouteStale(1000, 1000 + ROUTE_STALE_AFTER_MS - 1)).toBe(false);
    expect(isNowRouteStale(1000, 1000 + ROUTE_STALE_AFTER_MS)).toBe(true);
  });
  it("handles returning from the background, midnight, and clock corrections", () => {
    const beforeMidnight = Date.parse("2026-09-07T23:59:30+03:30");
    expect(isNowRouteStale(beforeMidnight, beforeMidnight + 90_000)).toBe(true);
    expect(isNowRouteStale(beforeMidnight, beforeMidnight + 3600_000)).toBe(true);
    expect(isNowRouteStale(beforeMidnight, beforeMidnight - 60_000)).toBe(false);
    expect(isNowRouteStale(NaN, beforeMidnight)).toBe(false);
  });
});
