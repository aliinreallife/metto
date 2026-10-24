import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import baseline from "./test-fixtures/tehran-before-metto-data.json";
import { topologyRow, scheduledCases } from "./test-fixtures/tehran-parity";
import { computeRouteTopology } from "./lib/route";
import { planRoute } from "./lib/route-planning";
import { __setScheduleDataForTests } from "./lib/schedule-utils";
import { STATIONS } from "./lib/metro/stations";
import type { LineScheduleData } from "./lib/schedule-data";

describe("Tehran runtime cutover against pre-migration results", () => {
  it("keeps the complete public station inventory and timetable bytes", () => {
    expect(STATIONS.map((s) => s.id)).toEqual(baseline.stationIds);
    const bytes = readFileSync("public/schedule-data.json");
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(baseline.scheduleSha256);
    expect(baseline.pairs).toBe(22_650);
    expect(baseline.reachable).toBe(20_875);
  });

  // Every directed pair, including blocked endpoints. Hash the entire topology:
  // paths, lines, branch/train changes, terminals, transfers and stop counts.
  for (const expected of baseline.rows) {
    it(`preserves every destination from ${expected.from}`, () => {
      expect(topologyRow(computeRouteTopology, expected.from, baseline.stationIds)).toEqual(expected);
    });
  }

  describe("existing timetable behavior", () => {
    beforeAll(() => {
      const data = JSON.parse(readFileSync("public/schedule-data.json", "utf8")) as LineScheduleData[];
      __setScheduleDataForTests(data);
    });
    afterAll(() => __setScheduleDataForTests(null));

    it("preserves 108 depart-at/arrive-by results across weekdays, holidays and service boundaries", () => {
      expect(scheduledCases(planRoute)).toEqual(baseline.scheduledCases);
    });
  });

  it("prevents the legacy generator from replacing the pinned runtime export", () => {
    const before = readFileSync("lib/metro/stations.ts", "utf8");
    expect(() => execFileSync(process.execPath, ["scripts/generate-stations.ts"], { stdio: "pipe" })).toThrow();
    expect(readFileSync("lib/metro/stations.ts", "utf8")).toBe(before);
  });
});
