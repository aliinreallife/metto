import { describe, expect, it } from "vitest";
import { buildStatefulTabHref } from "./tab-href";

const routeState = {
  from: "tajrish",
  to: "teatr-e-shahr",
};

describe("buildStatefulTabHref", () => {
  it("preserves a valid depart-at plan across tabs", () => {
    const current = new URLSearchParams({
      from: "tajrish",
      to: "teatr-e-shahr",
      timeMode: "depart",
      at: "2026-10-14T05:30:00.000Z",
    });
    expect(buildStatefulTabHref("/stations", routeState, current)).toBe(
      "/stations?from=tajrish&to=teatr-e-shahr&timeMode=depart&at=2026-10-14T05%3A30%3A00.000Z",
    );
  });

  it("preserves arrive-by when returning to the route tab", () => {
    const current = new URLSearchParams({
      timeMode: "arrive",
      at: "2026-10-14T16:00:00Z",
    });
    expect(buildStatefulTabHref("/route", routeState, current)).toBe(
      "/route?from=tajrish&to=teatr-e-shahr&timeMode=arrive&at=2026-10-14T16%3A00%3A00.000Z",
    );
  });

  it("does not propagate invalid or partial time state", () => {
    const current = new URLSearchParams({ timeMode: "depart" });
    expect(buildStatefulTabHref("/map", routeState, current)).toBe(
      "/map?from=tajrish&to=teatr-e-shahr",
    );
  });
});
