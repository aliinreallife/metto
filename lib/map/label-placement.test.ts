import { describe, expect, it } from "vitest";
import {
  ANCHORS,
  MAX_LABEL_GAP,
  VIEWPORT_PADDING,
  anchorPreference,
  placeLabels,
  pointToRectDistance,
  rectForAnchor,
  type DotObstacle,
  type LabelCandidate,
} from "./label-placement";

const VP = { width: 720, height: 900 };

function cand(partial: Partial<LabelCandidate> & { id: string }): LabelCandidate {
  return {
    point: { x: 360, y: 450 },
    width: 80,
    height: 20,
    priority: 10,
    forced: false,
    ...partial,
  };
}

function dot(id: string, x: number, y: number, radius = 4): DotObstacle {
  return { id, point: { x, y }, radius };
}

describe("rectForAnchor", () => {
  it("keeps every anchor within a small gap of the station", () => {
    const p = { x: 360, y: 450 };
    for (const a of ANCHORS) {
      const r = rectForAnchor(p, 120, 22, a);
      expect(pointToRectDistance(p, r)).toBeLessThanOrEqual(12);
    }
  });
});

describe("placeLabels", () => {
  it("gives two overlapping labels different anchors", () => {
    const res = placeLabels(
      [
        cand({ id: "a", point: { x: 360, y: 450 } }),
        cand({ id: "b", point: { x: 365, y: 452 } }),
      ],
      [dot("a", 360, 450), dot("b", 365, 452)],
      VP,
    );
    expect(res.filter((r) => !r.hidden)).toHaveLength(2);
    // Different anchors, or at least non-overlapping rects.
    const rects = res.map((r) => ({ ...r, w: 80, h: 20 }));
    const overlap =
      rects[0].x < rects[1].x + 80 &&
      rects[1].x < rects[0].x + 80 &&
      rects[0].y < rects[1].y + 20 &&
      rects[1].y < rects[0].y + 20;
    expect(overlap).toBe(false);
  });

  it("lets the high-priority label win a collision", () => {
    const res = placeLabels(
      [
        cand({ id: "low", point: { x: 360, y: 450 }, priority: 10, prevAnchor: "N" }),
        cand({ id: "high", point: { x: 360, y: 450 }, priority: 90, prevAnchor: "N" }),
      ],
      [],
      VP,
    );
    const byId = new Map(res.map((r) => [r.id, r]));
    // Same point + same size: only one can sit at N.
    expect(byId.get("high")!.hidden).toBe(false);
    expect(byId.get("high")!.anchor).toBe("N");
  });

  it("hides the lower-priority label when no candidate fits", () => {
    // A wall of forced labels occupying every anchor around the victim.
    const victim = cand({ id: "victim", point: { x: 360, y: 450 }, priority: 1 });
    const blockers: LabelCandidate[] = ANCHORS.map((a, i) => {
      const r = rectForAnchor(victim.point, 80, 20, a);
      // Place a blocker dot+label exactly on that rect: a forced label at the
      // rect center with identical size can only sit where the victim wants.
      void r;
      return cand({
        id: `blocker-${i}`,
        point: { x: victim.point.x, y: victim.point.y },
        priority: 50 + i,
        forced: true,
      });
    });
    const res = placeLabels([victim, ...blockers], [], VP);
    const byId = new Map(res.map((r) => [r.id, r]));
    expect(byId.get("victim")!.hidden).toBe(true);
    expect(byId.get("victim")!.anchor).toBeNull();
  });

  it("keeps a forced-visible label near the station even when crowded", () => {
    const forced = cand({ id: "forced", point: { x: 360, y: 450 }, priority: 100, forced: true });
    const crowd: LabelCandidate[] = Array.from({ length: 8 }, (_, i) =>
      cand({ id: `c${i}`, point: { x: 360 + i, y: 450 }, priority: 60 + i, forced: true }),
    );
    const res = placeLabels([forced, ...crowd], [], VP);
    const got = res.find((r) => r.id === "forced")!;
    expect(got.hidden).toBe(false);
    expect(got.anchor).not.toBeNull();
    const gap = pointToRectDistance(forced.point, { x: got.x, y: got.y, w: 80, h: 20 });
    expect(gap).toBeLessThanOrEqual(MAX_LABEL_GAP);
  });

  it("never places a non-forced label farther than the max gap", () => {
    const cs: LabelCandidate[] = Array.from({ length: 30 }, (_, i) => ({
      id: `s${i}`,
      point: { x: 300 + (i % 6) * 18, y: 400 + Math.floor(i / 6) * 16 },
      width: 70 + ((i * 13) % 50),
      height: 20,
      priority: (i * 7) % 60,
      forced: false,
    }));
    const res = placeLabels(cs, [], VP);
    for (const r of res) {
      if (r.hidden) continue;
      const c = cs.find((x) => x.id === r.id)!;
      const gap = pointToRectDistance(c.point, { x: r.x, y: r.y, w: c.width, h: c.height });
      expect(gap).toBeLessThanOrEqual(MAX_LABEL_GAP);
    }
  });

  it("does not cover another station dot", () => {
    const cs = [
      cand({ id: "a", point: { x: 360, y: 450 }, width: 100 }),
      cand({ id: "b", point: { x: 360, y: 430 }, width: 100 }),
    ];
    const res = placeLabels(cs, [dot("a", 360, 450), dot("b", 360, 430)], VP);
    for (const r of res) {
      if (r.hidden) continue;
      const c = cs.find((x) => x.id === r.id)!;
      const rect = { x: r.x, y: r.y, w: c.width, h: c.height };
      for (const d of [dot("a", 360, 450), dot("b", 360, 430)]) {
        if (d.id === c.id) continue;
        const cx = Math.min(Math.max(d.point.x, rect.x), rect.x + rect.w);
        const cy = Math.min(Math.max(d.point.y, rect.y), rect.y + rect.h);
        expect(Math.hypot(d.point.x - cx, d.point.y - cy)).toBeGreaterThanOrEqual(d.radius);
      }
    }
  });

  it("is deterministic for identical inputs", () => {
    const cs: LabelCandidate[] = Array.from({ length: 20 }, (_, i) => ({
      id: `s${i}`,
      point: { x: 200 + ((i * 37) % 300), y: 300 + ((i * 53) % 300) },
      width: 60 + ((i * 29) % 70),
      height: 20,
      priority: (i * 11) % 70,
      forced: i % 7 === 0,
    }));
    const a = placeLabels(cs, [], VP);
    const b = placeLabels(cs, [], VP);
    expect(a).toEqual(b);
  });

  it("retains the previous anchor when it still fits", () => {
    const first = placeLabels([cand({ id: "a", prevAnchor: undefined })], [], VP);
    expect(first[0].hidden).toBe(false);
    const anchor = first[0].anchor!;
    const second = placeLabels([cand({ id: "a", prevAnchor: anchor })], [], VP);
    expect(second[0].anchor).toBe(anchor);
  });
});

describe("anchorPreference", () => {
  it("prefers east anchors near the left edge", () => {
    const pref = anchorPreference({ x: 20, y: 450 }, VP);
    expect(["E", "NE", "SE"]).toContain(pref[0]);
  });

  it("prefers west anchors near the right edge", () => {
    const pref = anchorPreference({ x: 700, y: 450 }, VP);
    expect(["W", "NW", "SW"]).toContain(pref[0]);
  });

  it("prefers south anchors near the top edge", () => {
    const pref = anchorPreference({ x: 360, y: 20 }, VP);
    expect(["S", "SE", "SW"]).toContain(pref[0]);
  });

  it("prefers north anchors near the bottom edge", () => {
    const pref = anchorPreference({ x: 360, y: 880 }, VP);
    expect(["N", "NE", "NW"]).toContain(pref[0]);
  });

  it("keeps northerly anchors away from edges", () => {
    const pref = anchorPreference({ x: 360, y: 450 }, VP);
    expect(pref.slice(0, 3)).toContain("N");
  });

  it("rejects labels that would leave the viewport", () => {
    // Wide label tight in the top-left corner: only inward anchors survive.
    const res = placeLabels([cand({ id: "corner", point: { x: 12, y: 12 }, width: 200, height: 24 })], [], VP);
    const r = res[0];
    expect(r.hidden).toBe(false);
    expect(r.x).toBeGreaterThanOrEqual(VIEWPORT_PADDING);
    expect(r.y).toBeGreaterThanOrEqual(VIEWPORT_PADDING);
  });
});
