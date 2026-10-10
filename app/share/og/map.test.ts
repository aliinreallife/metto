// Share minimap model contract: geometry always lands inside its viewport
// (the card gives the map its own panel — nothing may escape into the text
// section), pins clamp inside, invalid input never throws.
import { describe, expect, it } from "vitest";
import { computeRouteTopology } from "@/lib/route";
import {
  buildShareMap,
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
      // Dim full-network edges intentionally overflow the viewport (the
      // panel clips them) — they must only be finite, never NaN.
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
    expect(topo!.path.length).toBeLessThanOrEqual(8 + 2);
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
      expect(j.x).toBeGreaterThanOrEqual(0);
      expect(j.x).toBeLessThanOrEqual(OG_PANEL.w);
      expect(j.y).toBeGreaterThanOrEqual(0);
      expect(j.y).toBeLessThanOrEqual(OG_PANEL.h);
    }
  });

  it("degrades unknown stations to pin/connector-free output (never throws)", () => {
    const m = buildShareMap("nope", "nada", { viewport: OG_PANEL });
    // Dim-network-only (or null) — either way no crash, no pins.
    if (m) {
      expect(m.pins).toEqual([]);
      expect(m.connectors).toEqual([]);
    }
  });
});
