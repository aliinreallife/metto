import { describe, expect, it } from "vitest";
import { buildMapEdges } from "@/lib/metro/selectors";
import { computeRouteTopology } from "@/lib/route";
import {
  buildRouteContextIds,
  buildShareMap,
  edgeKey,
  MAP_CONTEXT_HOPS,
  OG_PANEL,
} from "./map";

describe("OG map route-neighborhood context", () => {
  it("expands only the configured number of graph hops", () => {
    const edges = [
      { a: "p", b: "a" },
      { a: "a", b: "b" },
      { a: "b", b: "c" },
      { a: "c", b: "d" },
      { a: "x", b: "y" },
    ];
    const ids = buildRouteContextIds(["p"], edges, MAP_CONTEXT_HOPS);

    expect(MAP_CONTEXT_HOPS).toBe(2);
    expect(ids.has("p")).toBe(true);
    expect(ids.has("a")).toBe(true);
    expect(ids.has("b")).toBe(true);
    expect(ids.has("c")).toBe(false);
    expect(ids.has("x")).toBe(false);
  });

  it("keeps every selected route edge while reducing background geometry", () => {
    const topo = computeRouteTopology("abdol-abad", "iran-khodro");
    expect(topo).not.toBeNull();

    const expectedHot = new Set<string>();
    for (const seg of topo!.segments) {
      for (let i = 0; i + 1 < seg.stations.length; i++) {
        expectedHot.add(edgeKey(seg.stations[i], seg.stations[i + 1], seg.line));
      }
    }

    const m = buildShareMap("abdol-abad", "iran-khodro", {
      viewport: OG_PANEL,
    });
    expect(m).not.toBeNull();
    expect(m!.edges.filter((e) => e.opacity === 1)).toHaveLength(
      expectedHot.size,
    );
    expect(m!.edges.length).toBeLessThan(buildMapEdges().length);
  });

  it("keeps endpoint markers comfortably inside the tighter focus", () => {
    for (const [from, to] of [
      ["tajrish", "shahid-hemmat"],
      ["tajrish", "teatr-e-shahr"],
      ["abdol-abad", "iran-khodro"],
      ["mehrabad-airport-terminal-1-2", "mehrabad-airport-terminal-4-6"],
    ] as const) {
      const m = buildShareMap(from, to, { viewport: OG_PANEL });
      expect(m).not.toBeNull();
      const endpoints = m!.dots.filter((d) => d.fill === "#E0001F");
      expect(endpoints).toHaveLength(2);
      for (const d of endpoints) {
        expect(d.x).toBeGreaterThan(8);
        expect(d.x).toBeLessThan(OG_PANEL.w - 8);
        expect(d.y).toBeGreaterThan(8);
        expect(d.y).toBeLessThan(OG_PANEL.h - 8);
      }
    }
  });

  it("derives dim welds only from retained edges (no orphans after pruning)", () => {
    for (const [from, to] of [
      ["tajrish", "teatr-e-shahr"],
      ["abdol-abad", "iran-khodro"],
      ["ahang", "iran-khodro"],
    ] as const) {
      const m = buildShareMap(from, to, { viewport: OG_PANEL });
      expect(m).not.toBeNull();
      // Every dim weld must sit at the tip region of at least two retained
      // edges. If incident counts were derived from filtered-out network
      // edges, pruned vertices would leave orphan dots with < 2 neighbours.
      for (const w of m!.dimJoints) {
        let neighbours = 0;
        for (const e of m!.edges) {
          const rad = (e.deg * Math.PI) / 180;
          const hw =
            (Math.abs(Math.cos(rad)) * e.len +
              Math.abs(Math.sin(rad)) * e.thick) /
              2 +
            3;
          const hh =
            (Math.abs(Math.sin(rad)) * e.len +
              Math.abs(Math.cos(rad)) * e.thick) /
              2 +
            3;
          if (
            Math.abs(w.x - e.cx) <= hw &&
            Math.abs(w.y - e.cy) <= hh
          ) {
            neighbours++;
            if (neighbours >= 2) break;
          }
        }
        expect(neighbours).toBeGreaterThanOrEqual(2);
      }
    }
  });
});
