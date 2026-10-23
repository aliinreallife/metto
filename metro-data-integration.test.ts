import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { STATIONS } from "./lib/metro/stations";
import { LINES } from "./lib/metro/lines";
import { ROUTES } from "./lib/metro/routes";
import { SEGMENTS, SEGMENT_STATUS_OVERRIDES } from "./lib/metro/segments";
import { STATION_ALIASES } from "./lib/metro/aliases";
import { TRANSFER_RULES } from "./lib/metro/transfers";
import {
  importedStations, importedLines, importedRoutes, importedSegments,
  importedSegmentStatusOverrides, importedAliases, importedTransferRules,
} from "./lib/metro/from-metto-data";
import baseline from "./test-fixtures/tehran-before-metto-data.json";
import { fingerprint } from "./test-fixtures/tehran-parity";

// The fixed hashes were captured from the old tables at baseline.sourceRevision
// BEFORE the runtime switch. Comparing only importedStations with STATIONS
// would be circular once STATIONS re-exports the imported dataset.
const legacy = baseline.tableHashes;

describe("pinned metto-data Tehran migration is behavior preserving", () => {
  it("pins exact upstream snapshot and protects 17 Shahrivar policy", () => {
    expect(() => execFileSync(process.execPath,
      ["scripts/check-metto-data.mjs"], { encoding: "utf8" })).not.toThrow();
  });

  it("matches all 151 stations, including identifiers, coordinates and facility unknowns", () => {
    expect(importedStations).toEqual(STATIONS);
    expect(fingerprint(STATIONS)).toBe(legacy.stations);
  });
  it("preserves all 7 branded lines and Persian UI digits", () => {
    expect(importedLines).toEqual(LINES);
    expect(fingerprint(LINES)).toBe(legacy.lines);
  });
  it("preserves 9 routes including exact boarding status per stop", () => {
    expect(importedRoutes).toEqual(ROUTES);
    expect(fingerprint(ROUTES)).toBe(legacy.routes);
  });
  it("preserves 163 track segments and independent track statuses", () => {
    expect(importedSegments).toEqual(SEGMENTS);
    expect(importedSegmentStatusOverrides).toEqual(SEGMENT_STATUS_OVERRIDES);
    expect(fingerprint(SEGMENTS)).toBe(legacy.segments);
    expect(fingerprint(SEGMENT_STATUS_OVERRIDES)).toBe(legacy.segmentStatusOverrides);
  });
  it("preserves every old deep link and alias", () => {
    expect(importedAliases).toEqual(STATION_ALIASES);
    expect(fingerprint(STATION_ALIASES)).toBe(legacy.aliases);
  });
  it("preserves all interchange walk rules", () => {
    expect(importedTransferRules).toEqual(TRANSFER_RULES);
    expect(fingerprint(TRANSFER_RULES)).toBe(legacy.transfers);
  });
});
