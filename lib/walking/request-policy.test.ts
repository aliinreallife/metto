import { describe, expect, it } from "vitest";
import { shouldRequestDirectWalk } from "./request-policy";

const a = { lat: 35.7, lng: 51.4 };
const b = { lat: 35.75, lng: 51.4 };
const plan = (totalSeconds = 20 * 60, initialWaitSeconds = 0) => ({
  status: "complete" as const, totalSeconds, initialWaitSeconds,
});

describe("walking request policy", () => {
  it("does not request a long station walk when even a brisk straight walk loses", () => {
    expect(shouldRequestDirectWalk(a, b, a, b, plan())).toBe(false);
  });
  it("excludes the first-train wait when screening requests", () => {
    expect(shouldRequestDirectWalk(a, b, a, b, plan(320 * 60, 300 * 60))).toBe(false);
  });
  it("waits for a usable metro plan instead of firing during schedule loading", () => {
    expect(shouldRequestDirectWalk(a, b, a, b, null)).toBe(false);
  });
  it("still requests short walking candidates when a metro detour makes walking competitive", () => {
    const nearby = { lat: a.lat + 0.005, lng: a.lng };
    expect(shouldRequestDirectWalk(a, nearby, a, nearby, plan(80 * 60))).toBe(true);
  });
  it("keeps borderline walks: brisk screening is more generous than the normal 5 km/h estimate", () => {
    const nearby = { lat: 35.71, lng: a.lng };
    // ~11.1 minutes at 6 km/h versus ~13.3 at the usual 5 km/h.
    expect(shouldRequestDirectWalk(a, nearby, a, nearby, plan(12 * 60))).toBe(true);
  });
  it("retains real direct routing for nearby pins whose station approaches may involve detours", () => {
    const pin = { lat: a.lat + 0.001, lng: a.lng };
    const nearby = { lat: a.lat + 0.005, lng: a.lng };
    expect(shouldRequestDirectWalk(pin, nearby, a, nearby, plan())).toBe(true);
    expect(shouldRequestDirectWalk(a, pin, a, a, null)).toBe(true);
  });
  it("avoids direct routing for walks too long to recommend", () => {
    expect(shouldRequestDirectWalk(a, b, a, b, plan(100 * 60))).toBe(false);
    expect(shouldRequestDirectWalk(a, b, a, a, null)).toBe(false);
  });
  it("does not request walking for identical, invalid or unsupported endpoints", () => {
    for (const point of [null, a, { lat: NaN, lng: a.lng }, { lat: 36, lng: 52 }]) {
      expect(shouldRequestDirectWalk(a, point, a, point, plan())).toBe(false);
    }
  });
});
