// Share minimap model contract: geometry always lands inside its viewport
// (the card gives the map its own panel — nothing may escape into the text
// section), pins clamp inside, invalid input never throws.
import { describe, expect, it } from "vitest";
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

  it("degrades unknown stations to pin/connector-free output (never throws)", () => {
    const m = buildShareMap("nope", "nada", { viewport: OG_PANEL });
    // Dim-network-only (or null) — either way no crash, no pins.
    if (m) {
      expect(m.pins).toEqual([]);
      expect(m.connectors).toEqual([]);
    }
  });
});
