import { describe, expect, it } from "vitest";
import { firstCityTrainForRoute } from "./first-train";
import { tehranMinuteToInstant, tehranParts } from "./tehran-time";

const elGoli = "tabriz:station:el-goli";
const noor = "tabriz:station:noor";

describe("first-train no-service shortcut", () => {
  const now = tehranMinuteToInstant("2026-11-03", 10 * 60);

  it("finds a real next-day train after an unavailable night departure", () => {
    const late = tehranMinuteToInstant("2026-11-03", 20 * 60 + 11);
    const first = firstCityTrainForRoute("tabriz", elGoli, noor, late, now, null);
    expect(first).not.toBeNull();
    expect(first!).toBeGreaterThan(late);
    expect(tehranParts(first!).dateStr).toBe("2026-11-04");
  });

  it("never escapes the seven-day planner horizon", () => {
    const afterHorizon = tehranMinuteToInstant("2026-11-11", 0);
    expect(firstCityTrainForRoute("tabriz", elGoli, noor, afterHorizon, now, null)).toBeNull();
  });

  it("does not invent service for an invalid station", () => {
    expect(firstCityTrainForRoute("tabriz", "tabriz:unknown", noor, now, now, null)).toBeNull();
  });
});
