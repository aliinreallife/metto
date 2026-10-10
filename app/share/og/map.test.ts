// Share minimap model contract: geometry always lands inside its viewport
// (the card gives the map its own panel — nothing may escape into the text
// section), pins clamp inside, invalid input never throws.
import { describe, expect, it } from "vitest";
import { computeRouteTopology } from "@/lib/route";
import { buildMapEdges } from "@/lib/metro/selectors";
import {
  buildShareMap,
  edgeKey,
  isHotEdge,
  isOutsideViewport,
  MAP_BLEED,
  OG_HEIGHT,
  OG_PANEL,
  OG_WIDTH,
} from "./map";

describe("buildShareMap viewports", () => {
  it("keeps default full-canvas geometry in bounds", () => {
    const m = buildShareMap("tajrish", "teatr-e-shahr");
    expect(m).not.toBeNull();
    for (const d of m!.dots) {
      expect(d.x).toBeGreaterThanOrEqual(0);
      expect(d.x).toBeLessThanOrEqual(OG_WIDTH);
      expect(d.y).toBeGreaterThanOrEqual(0);
      expect(d.y).toBeLessThanOrEqual(OG_HEIGHT);
    }
    for (const e of m!.edges) {
      // Retained edges must be finite (never NaN); offscreen network is
      // culled outright while crossing segments stay (panel clips them).
      for (const v of [e.cx, e.cy, e.len, e.deg]) {
        expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it("keeps panel-viewport geometry inside the panel", () => {
    const m = buildShareMap("tajrish", "teatr-e-shahr", {
      viewport: OG_PANEL,
    });
    expect(m).not.toBeNull();
    for (const d of [...m!.dots, ...m!.pins]) {
      expect(d.x).toBeGreaterThanOrEqual(0);
      expect(d.x).toBeLessThanOrEqual(OG_PANEL.w);
      expect(d.y).toBeGreaterThanOrEqual(0);
      expect(d.y).toBeLessThanOrEqual(OG_PANEL.h);
    }
    for (const e of m!.edges) {
      for (const v of [e.cx, e.cy, e.len, e.deg]) {
        expect(Number.isFinite(v)).toBe(true);
      }
    }
    // Connectors join two in-bounds points, so their centers stay inside.
    for (const e of m!.connectors) {
      expect(e.cx).toBeGreaterThanOrEqual(0);
      expect(e.cx).toBeLessThanOrEqual(OG_PANEL.w);
      expect(e.cy).toBeGreaterThanOrEqual(0);
      expect(e.cy).toBeLessThanOrEqual(OG_PANEL.h);
    }
  });

  it("draws landmark pins with walk connectors to their stations", () => {
    const m = buildShareMap("abdol-abad", "iran-khodro", {
      viewport: OG_PANEL,
      destPin: { lat: 35.7538, lng: 51.1926 },
    });
    expect(m).not.toBeNull();
    // Pin marker + white core.
    expect(m!.pins.length).toBe(2);
    // Exactly one walk connector (origin has no pin).
    expect(m!.connectors.length).toBe(1);
    for (const p of m!.pins) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(OG_PANEL.w);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(OG_PANEL.h);
    }
  });

  it("declutters dots on long journeys to interchanges + endpoints", () => {
    const topo = computeRouteTopology("abdol-abad", "iran-khodro");
    expect(topo).not.toBeNull();
    // Multi-line, many stops: proves the policy branch is exercised.
    expect(topo!.path.length).toBeGreaterThan(8);
    const m = buildShareMap("abdol-abad", "iran-khodro", {
      viewport: OG_PANEL,
    });
    expect(m).not.toBeNull();
    const interchanges = m!.interchangeIds.length;
    expect(interchanges).toBeGreaterThan(0);
    // Dots = interchange markers (2 each) + endpoints (2 each) — far
    // fewer than one pearl per path station (no necklace).
    expect(m!.dots.length).toBe(2 * interchanges + 2 * 2);
    expect(m!.dots.length).toBeLessThan(2 * topo!.path.length);
  });

  it("keeps every stop dot on short journeys", () => {
    const topo = computeRouteTopology("tajrish", "shahid-hemmat");
    expect(topo).not.toBeNull();
    // Exactly 8 path stations: really exercises the production
    // `pathStations.length <= 8` short-route branch (not just near it).
    expect(topo!.path.length).toBe(8);
    const m = buildShareMap("tajrish", "shahid-hemmat", {
      viewport: OG_PANEL,
    });
    expect(m).not.toBeNull();
    // Full necklace: one dot per non-endpoint path station (two at
    // interchanges) plus the two endpoint markers.
    const midIds = [...new Set(topo!.path.slice(1, -1))];
    const expected =
      midIds.reduce(
        (a, id) => a + (m!.interchangeIds.includes(id) ? 2 : 1),
        0,
      ) + 2 * 2;
    expect(m!.dots.length).toBe(expected);
    expect(expected).toBeGreaterThan(2 * 2);
  });

  it("exposes legs, counts and interchange ids for the card", () => {    const m = buildShareMap("abdol-abad", "iran-khodro", {
      viewport: OG_PANEL,
    });
    expect(m).not.toBeNull();
    expect(m!.legs.length).toBeGreaterThan(0);
    for (const leg of m!.legs) {
      expect(leg.color).toMatch(/^#/);
      expect(leg.label.length).toBeGreaterThan(0);
      // Legend labels use digit-first order ("۱ خط", never "خط ۱").
      expect(leg.label).toMatch(/^[۰-۹]+ خط$/);
      expect(leg.stops).toBeGreaterThan(0);
    }
    expect(m!.numStops).toBeGreaterThan(0);
    expect(m!.numTransfers).toBeGreaterThanOrEqual(0);
    // One interchange per segment boundary; legs merge same-line
    // neighbours, so boundaries >= legs - 1.
    expect(m!.interchangeIds.length).toBeGreaterThanOrEqual(
      m!.legs.length - 1,
    );
  });

  it("clamps far-away pins inside the panel instead of cropping", () => {
    const m = buildShareMap("tajrish", "teatr-e-shahr", {
      viewport: OG_PANEL,
      originPin: { lat: 0, lng: 0 },
    });
    expect(m).not.toBeNull();
    expect(m!.pins.length).toBe(2);
    for (const p of m!.pins) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(OG_PANEL.w);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(OG_PANEL.h);
    }
  });

  it("welds highlight joints with leg-colored dots", () => {
    const topo = computeRouteTopology("abdol-abad", "iran-khodro");
    expect(topo).not.toBeNull();
    const m = buildShareMap("abdol-abad", "iran-khodro", {
      viewport: OG_PANEL,
    });
    expect(m).not.toBeNull();
    // One joint per plain vertex: path stations minus endpoints minus
    // interchanges (those carry their own markers).
    const pathIds = new Set(topo!.path);
    pathIds.delete(topo!.path[0]);
    pathIds.delete(topo!.path[topo!.path.length - 1]);
    for (const id of m!.interchangeIds) pathIds.delete(id);
    expect(m!.joints.length).toBe(pathIds.size);
    const legColors = new Set(m!.legs.map((l) => l.color));
    for (const j of m!.joints) {
      expect(legColors.has(j.fill)).toBe(true);
      // Just rounds the joint (±0.5px over half-thick 3): the overlap
      // extension closes the wedge, so no beading and no shadow cost.
      expect(j.r).toBe(3.5);
      expect(j.x).toBeGreaterThanOrEqual(0);
      expect(j.x).toBeLessThanOrEqual(OG_PANEL.w);
      expect(j.y).toBeGreaterThanOrEqual(0);
      expect(j.y).toBeLessThanOrEqual(OG_PANEL.h);
    }
  });

  it("welds dim-network vertices so background track reads connected", () => {
    const m = buildShareMap("abdol-abad", "iran-khodro", {
      viewport: OG_PANEL,
    });
    expect(m).not.toBeNull();
    // Multi-line journey: the dim network around it has branching vertices.
    expect(m!.dimJoints.length).toBeGreaterThan(0);
    for (const w of m!.dimJoints) {
      expect(w.fill).toBe("#3b3d46");
      expect(w.r).toBe(1.5);
      // Culled to the visible panel (2px bleed margin for the dot radius).
      expect(w.x).toBeGreaterThanOrEqual(-2);
      expect(w.x).toBeLessThanOrEqual(OG_PANEL.w + 2);
      expect(w.y).toBeGreaterThanOrEqual(-2);
      expect(w.y).toBeLessThanOrEqual(OG_PANEL.h + 2);
    }
    // Welds never sit on a marker station (endpoints, interchanges,
    // highlight joints) — those vertices are already covered.
    const marked = [...m!.dots, ...m!.joints];
    for (const w of m!.dimJoints) {
      for (const d of marked) {
        expect(Math.hypot(w.x - d.x, w.y - d.y)).toBeGreaterThan(0.5);
      }
    }
  });

  it("welds dim vertices on marker-free (unroutable) maps too", () => {
    const m = buildShareMap("nope", "nada", { viewport: OG_PANEL });
    // Dim-network-only (or null) — either way no crash.
    if (m) {
      for (const w of m.dimJoints) {
        expect(w.x).toBeGreaterThanOrEqual(-2);
        expect(w.x).toBeLessThanOrEqual(OG_PANEL.w + 2);
        expect(w.y).toBeGreaterThanOrEqual(-2);
        expect(w.y).toBeLessThanOrEqual(OG_PANEL.h + 2);
      }
    }
  });

  it("marks endpoints with flat minimal dots (no glow)", () => {
    const m = buildShareMap("tajrish", "teatr-e-shahr", {
      viewport: OG_PANEL,
    });
    expect(m).not.toBeNull();
    const marks = m!.dots.filter((d) => d.fill === "#E0001F");
    expect(marks.length).toBe(2);
    for (const d of marks) {
      expect(d.r).toBe(8);
      expect(d.glow).toBeNull();
    }
    const cores = m!.dots.filter((d) => d.fill === "#ffffff" && d.r === 3);
    // White cores: 2 endpoints + 1 per interchange.
    expect(cores.length).toBe(2 + m!.interchangeIds.length);
  });

  it("degrades unknown stations to pin/connector-free output (never throws)", () => {
    const m = buildShareMap("nope", "nada", { viewport: OG_PANEL });
    // Dim-network-only (or null) — either way no crash, no pins.
    if (m) {
      expect(m.pins).toEqual([]);
      expect(m.connectors).toEqual([]);
    }
  });

  it("keys highlight edges by station pair + line", () => {
    // Synthetic shared track: production data has no station pair served
    // by two lines, so line-aware behavior is proven with synthetic keys
    // (production metro fixtures are never mutated for tests).
    const keys = new Set([edgeKey("a", "b", 1)]);
    expect(isHotEdge("a", "b", 1, keys)).toBe(true);
    expect(isHotEdge("b", "a", 1, keys)).toBe(true);
    expect(isHotEdge("a", "b", 2, keys)).toBe(false);
    expect(isHotEdge("a", "c", 1, keys)).toBe(false);
  });

  it("culls offscreen edges but retains crossing ones", () => {
    const vw = OG_PANEL.w;
    const vh = OG_PANEL.h;
    expect(isOutsideViewport(10, 10, 50, 50, vw, vh)).toBe(false);
    expect(isOutsideViewport(-1000, -1000, -500, -500, vw, vh)).toBe(true);
    // Crossing: both endpoints outside on opposite sides — retained.
    expect(isOutsideViewport(-100, vh / 2, vw + 100, vh / 2, vw, vh)).toBe(
      false,
    );
    expect(isOutsideViewport(vw / 2, -100, vw / 2, vh + 100, vw, vh)).toBe(
      false,
    );
    // Bleed margin: just outside retained, far outside culled.
    expect(isOutsideViewport(-MAP_BLEED + 1, 10, -1, 10, vw, vh)).toBe(false);
    expect(
      isOutsideViewport(-MAP_BLEED - 50, 10, -MAP_BLEED - 1, 10, vw, vh),
    ).toBe(true);
  });

  it("renders the journey flat: no glow, hot 6px opaque, dim 2px faint", () => {
    const m = buildShareMap("abdol-abad", "iran-khodro", {
      viewport: OG_PANEL,
    });
    expect(m).not.toBeNull();
    for (const e of m!.edges) {
      expect(e.glow).toBeNull();
      if (e.opacity === 1) {
        expect(e.thick).toBe(6);
      } else {
        expect(e.thick).toBe(2);
        expect(e.opacity).toBeCloseTo(0.35, 5);
      }
    }
    expect(m!.edges.some((e) => e.opacity === 1)).toBe(true);
  });

  it("culls offscreen network but retains every hot edge", () => {
    const topo = computeRouteTopology("abdol-abad", "iran-khodro");
    expect(topo).not.toBeNull();
    const expected = new Set<string>();
    for (const seg of topo!.segments) {
      for (let i = 0; i + 1 < seg.stations.length; i++) {
        expected.add(edgeKey(seg.stations[i], seg.stations[i + 1], seg.line));
      }
    }
    const m = buildShareMap("abdol-abad", "iran-khodro", {
      viewport: OG_PANEL,
    });
    expect(m).not.toBeNull();
    expect(m!.edges.filter((e) => e.opacity === 1).length).toBe(expected.size);
    // A tight journey viewport culls part of the full network.
    expect(m!.edges.length).toBeLessThan(buildMapEdges().length);
  });

  it("handles very long station names without cropping markers", () => {
    const m = buildShareMap(
      "mehrabad-airport-terminal-1-2",
      "mehrabad-airport-terminal-4-6",
      { viewport: OG_PANEL },
    );
    expect(m).not.toBeNull();
    // Adjacent stations: the MIN_SPAN floor must still spread the endpoints
    // so the journey reads instead of collapsing to a dot.
    const reds = m!.dots.filter((d) => d.fill === "#E0001F");
    expect(reds.length).toBe(2);
    expect(
      Math.hypot(reds[0].x - reds[1].x, reds[0].y - reds[1].y),
    ).toBeGreaterThan(60);
    for (const d of [...m!.dots, ...m!.pins]) {
      expect(d.x).toBeGreaterThanOrEqual(0);
      expect(d.x).toBeLessThanOrEqual(OG_PANEL.w);
      expect(d.y).toBeGreaterThanOrEqual(0);
      expect(d.y).toBeLessThanOrEqual(OG_PANEL.h);
    }
  });

  it("keeps landmark pins from moving the route projection", () => {
    const plain = buildShareMap("tajrish", "teatr-e-shahr", {
      viewport: OG_PANEL,
    });
    const pinned = buildShareMap("tajrish", "teatr-e-shahr", {
      viewport: OG_PANEL,
      originPin: { lat: 0, lng: 0 },
      destPin: { lat: 60, lng: 60 },
    });
    expect(plain).not.toBeNull();
    expect(pinned).not.toBeNull();
    // Pins clamp post-projection and never enter the bbox: identical geometry.
    expect(pinned!.dots).toEqual(plain!.dots);
    expect(pinned!.edges).toEqual(plain!.edges);
    expect(pinned!.joints).toEqual(plain!.joints);
  });
});
