import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { STATIONS } from "./lib/metro/stations";

type UpstreamStation = {
  name: string;
  latitude: number;
  longitude: number;
  wc?: boolean | null;
  elevator?: boolean | null;
  atm?: boolean | null;
  coffeeShop?: boolean | null;
  fastFood?: boolean | null;
  groceryStore?: boolean | null;
  freeWifi?: boolean | null;
  prayerRoom?: boolean | null;
  bicycleParking?: boolean | null;
  metroPolice?: boolean | null;
  [k: string]: unknown;
};

const AMENITY_MAPPING = [
  ["wc", "wc"],
  ["elevator", "elevator"],
  ["atm", "atm"],
  ["coffeeShop", "coffeeShop"],
  ["fastFood", "fastFood"],
  ["groceryStore", "groceryStore"],
  ["freeWifi", "freeWifi"],
  ["prayerRoom", "prayerRoom"],
  ["parking", "bicycleParking"],
  ["police", "metroPolice"],
] as const;

// Intentional Metto coordinate override (see scripts/metto-overrides.json).
const SOLEIMANI_EN = "Shahid Sepahbod Qasem Soleimani";
const SOLEIMANI_LOCATION = { lat: 35.95882966952798, lng: 50.71920151458703 };
const FAKHRIZADEH_EN = "Shahid Fakhrizadeh";

function loadUpstream(): Record<string, UpstreamStation> {
  const p = join(__dirname, "data", "tehran-metro-stations.json");
  return JSON.parse(readFileSync(p, "utf8")) as Record<string, UpstreamStation>;
}

describe("canonical upstream comparison (data/tehran-metro-stations.json)", () => {
  it("matches 149 canonical coordinates + Soleimani override with zero amenity mismatches", () => {
    const upstream = loadUpstream();
    const upstreamNames = Object.keys(upstream);
    expect(upstreamNames).toHaveLength(150);

    const byEn = new Map(STATIONS.map((s) => [s.name.en, s]));
    expect(STATIONS).toHaveLength(151);
    expect(byEn.has(FAKHRIZADEH_EN)).toBe(true);

    let canonicalFound = 0;
    let upstreamCoordMatches = 0;
    let soleimaniMatches = 0;
    let coordMismatches = 0;
    let amenityMismatches = 0;
    let nullToFalse = 0;

    for (const en of upstreamNames) {
      const src = upstream[en];
      const gen = byEn.get(src.name ?? en);
      expect(gen, `canonical station missing in Metto: ${en}`).toBeDefined();
      canonicalFound++;

      if ((src.name ?? en) === SOLEIMANI_EN) {
        if (
          gen!.location.lat === SOLEIMANI_LOCATION.lat &&
          gen!.location.lng === SOLEIMANI_LOCATION.lng
        ) {
          soleimaniMatches++;
        } else {
          coordMismatches++;
        }
      } else {
        if (
          gen!.location.lat === src.latitude &&
          gen!.location.lng === src.longitude
        ) {
          upstreamCoordMatches++;
        } else {
          coordMismatches++;
        }
      }
      expect(gen!.location.lat).toBe(
        (src.name ?? en) === SOLEIMANI_EN
          ? SOLEIMANI_LOCATION.lat
          : src.latitude,
      );
      expect(gen!.location.lng).toBe(
        (src.name ?? en) === SOLEIMANI_EN
          ? SOLEIMANI_LOCATION.lng
          : src.longitude,
      );

      for (const [mettoKey, srcKey] of AMENITY_MAPPING) {
        const raw = (src as Record<string, unknown>)[srcKey];
        const expected: boolean | null =
          raw === undefined || raw === null ? null : (raw as boolean);
        const actual = (gen!.amenities as unknown as Record<string, boolean | null>)[
          mettoKey
        ];
        if (actual !== expected) amenityMismatches++;
        if (expected === null && actual === false) nullToFalse++;
        expect(actual, `${en}.${mettoKey}`).toBe(expected);
      }
    }

    expect(canonicalFound).toBe(150);
    expect(upstreamCoordMatches).toBe(149);
    expect(soleimaniMatches).toBe(1);
    expect(coordMismatches).toBe(0);
    expect(amenityMismatches).toBe(0);
    expect(nullToFalse).toBe(0);
  });

  it("ignores upstream typo fastFoodn (Ayatollah Taleghani fastFood stays null)", () => {
    const upstream = loadUpstream();
    const src = upstream["Ayatollah Taleghani"] as Record<string, unknown>;
    expect("fastFood" in src).toBe(false);
    expect(src["fastFoodn"]).toBe(false);
    const gen = STATIONS.find((s) => s.name.en === "Ayatollah Taleghani");
    expect(gen).toBeDefined();
    expect(gen!.amenities.fastFood).toBe(null);
  });
});
