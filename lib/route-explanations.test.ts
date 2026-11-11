import { describe, expect, it } from "vitest";
import { compareEramAvoidance, getEramAvoidanceReason } from "./route-explanations";
import type { RouteSegment, RouteResult } from "./route";

function leg(line: number, change: RouteSegment["changeFromPrevious"]): RouteSegment {
  return {
    line, routeId: `line-${line}`, terminal: "end",
    stations: ["a", "b"], changeFromPrevious: change,
  };
}
const fromEram = {
  type: "line_transfer" as const,
  stationId: "eram-e-sabz",
  fromLineId: 4, toLineId: 5, walkSeconds: 480,
};
const elsewhere = {
  type: "line_transfer" as const,
  stationId: "shademan",
  fromLineId: 2, toLineId: 4, walkSeconds: 240,
};
const selected = {
  status: "complete" as const,
  path: ["a", "b", "c"],
  numTransfers: 2,
  segments: [leg(2, { type: "none" }), leg(4, elsewhere), leg(5, {
    ...elsewhere, stationId: "tehran-sadeghiyeh", fromLineId: 4, toLineId: 5,
  })],
};
const normalEram = {
  numTransfers: 1,
  segments: [leg(4, { type: "none" }), leg(5, fromEram)],
};

describe("Eram route explanation", () => {
  it("explains only when normalization yields an Eram transfer with fewer changes", () => {
    expect(compareEramAvoidance(selected, normalEram)).toEqual({
      extraTransfers: 1, eramWalkMinutes: 8,
    });
  });

  it("does not claim avoidance when the current journey itself transfers at Eram", () => {
    expect(compareEramAvoidance({
      ...selected, segments: [leg(4, { type: "none" }), leg(5, fromEram)],
    }, normalEram)).toBeNull();
  });

  it("does not claim avoidance for ties, unsuccessful journeys or no Eram counterfactual", () => {
    expect(compareEramAvoidance(selected, { ...normalEram, numTransfers: 2 })).toBeNull();
    expect(compareEramAvoidance({ ...selected, status: "no_service" }, normalEram)).toBeNull();
    expect(compareEramAvoidance(selected, {
      numTransfers: 1, segments: [leg(2, { type: "none" }), leg(4, elsewhere)],
    })).toBeNull();
    expect(compareEramAvoidance(selected, null)).toBeNull();
  });

  it("keeps an ordinary route free of explanations", () => {
    const simple = {
      ...selected, path: ["tajrish", "shahid-beheshti"], numTransfers: 0,
      segments: [leg(1, { type: "none" })],
    };
    expect(getEramAvoidanceReason(simple as Pick<RouteResult, "status" | "path" | "segments" | "numTransfers">)).toBeNull();
  });
});
