/**
 * Screen-space station label placement engine (pure geometry, no DOM).
 *
 * Goal: every visible label sits CLOSE to its station dot (gap ~8-12px,
 * never more than ~26px). If no nearby anchor fits, a normal label is
 * hidden; a forced-visible label takes the least-bad nearby anchor.
 * Labels are never pushed far away to resolve collisions.
 *
 * DOM measurement happens outside this module (see RealMap): callers pass
 * already-measured label sizes in. Rectangles are direction-agnostic, so
 * Persian RTL needs no special geometry handling.
 */

export type Anchor = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";

export const ANCHORS: Anchor[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

/** Visual gap (px) between the station point and the label rect edge. */
export const LABEL_GAP = 10;
/** Diagonal gap per axis, so diagonal anchors sit ~11px away. */
export const LABEL_GAP_DIAGONAL = 8;
/** Hard maximum: closest label edge to station point for placed labels. */
export const MAX_LABEL_GAP = 26;
/** Labels must stay this far inside the viewport. */
export const VIEWPORT_PADDING = 8;
/** Minimum clearance between two placed label rects. */
export const LABEL_CLEARANCE = 2;
/** Extra buffer around station dots that labels must not cover. */
export const DOT_BUFFER = 2;
/** Points within this margin outside the viewport still get labels. */
const OFFSCREEN_MARGIN = 4;
/** Distance from a viewport edge that counts as "near the edge". */
const EDGE_ZONE = 90;

export interface LabelCandidate {
  id: string;
  /** Station position in screen px. */
  point: { x: number; y: number };
  /** Measured label size in px (includes padding/border). */
  width: number;
  height: number;
  /** Higher wins collisions. Ties break by id for determinism. */
  priority: number;
  /** Forced labels are always placed at a nearby anchor, never hidden. */
  forced: boolean;
  /** Previous successful anchor; tried first for visual stability. */
  prevAnchor?: Anchor | null;
}

export interface DotObstacle {
  id: string;
  point: { x: number; y: number };
  /** Dot radius in screen px. */
  radius: number;
}

export interface Placement {
  id: string;
  anchor: Anchor | null;
  /** Top-left corner of the label rect in screen px. */
  x: number;
  y: number;
  hidden: boolean;
}

export interface Viewport {
  width: number;
  height: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const ANCHOR_VECTORS: Record<Anchor, { dx: number; dy: number }> = {
  N: { dx: 0, dy: -1 },
  NE: { dx: 1, dy: -1 },
  E: { dx: 1, dy: 0 },
  SE: { dx: 1, dy: 1 },
  S: { dx: 0, dy: 1 },
  SW: { dx: -1, dy: 1 },
  W: { dx: -1, dy: 0 },
  NW: { dx: -1, dy: -1 },
};

/** Base preference away from edges: keep the familiar "above the dot" feel. */
const BASE_ORDER: Anchor[] = ["N", "NE", "NW", "E", "W", "SE", "SW", "S"];

/** Top-left rect for an anchor around point p with label size w x h. */
export function rectForAnchor(
  p: { x: number; y: number },
  w: number,
  h: number,
  anchor: Anchor,
): Rect {
  switch (anchor) {
    case "N":
      return { x: p.x - w / 2, y: p.y - LABEL_GAP - h, w, h };
    case "S":
      return { x: p.x - w / 2, y: p.y + LABEL_GAP, w, h };
    case "E":
      return { x: p.x + LABEL_GAP, y: p.y - h / 2, w, h };
    case "W":
      return { x: p.x - w - LABEL_GAP, y: p.y - h / 2, w, h };
    case "NE":
      return { x: p.x + LABEL_GAP_DIAGONAL, y: p.y - LABEL_GAP_DIAGONAL - h, w, h };
    case "NW":
      return { x: p.x - w - LABEL_GAP_DIAGONAL, y: p.y - LABEL_GAP_DIAGONAL - h, w, h };
    case "SE":
      return { x: p.x + LABEL_GAP_DIAGONAL, y: p.y + LABEL_GAP_DIAGONAL, w, h };
    case "SW":
      return { x: p.x - w - LABEL_GAP_DIAGONAL, y: p.y + LABEL_GAP_DIAGONAL, w, h };
  }
}

/** Shortest distance from a point to a rect (0 when the point is inside). */
export function pointToRectDistance(p: { x: number; y: number }, r: Rect): number {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.w));
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.h));
  return Math.hypot(dx, dy);
}

function rectsOverlap(a: Rect, padA: number, b: Rect, padB: number): boolean {
  return (
    a.x - padA < b.x + b.w + padB &&
    b.x - padB < a.x + a.w + padA &&
    a.y - padA < b.y + b.h + padB &&
    b.y - padB < a.y + a.h + padA
  );
}

function circleHitsRect(c: { x: number; y: number }, radius: number, r: Rect): boolean {
  const cx = Math.min(Math.max(c.x, r.x), r.x + r.w);
  const cy = Math.min(Math.max(c.y, r.y), r.y + r.h);
  return Math.hypot(c.x - cx, c.y - cy) < radius + DOT_BUFFER;
}

function inViewport(r: Rect, vp: Viewport): boolean {
  return (
    r.x >= VIEWPORT_PADDING &&
    r.y >= VIEWPORT_PADDING &&
    r.x + r.w <= vp.width - VIEWPORT_PADDING &&
    r.y + r.h <= vp.height - VIEWPORT_PADDING
  );
}

/**
 * Stable anchor preference for a station point.
 * Near an edge the anchors pushing the label inward come first;
 * away from edges BASE_ORDER keeps the familiar above-dot look.
 * A still-listed previous anchor goes first for panning stability.
 */
export function anchorPreference(
  p: { x: number; y: number },
  vp: Viewport,
  prevAnchor?: Anchor | null,
): Anchor[] {
  const pushX = p.x < EDGE_ZONE ? 1 : p.x > vp.width - EDGE_ZONE ? -1 : 0;
  const pushY = p.y < EDGE_ZONE ? 1 : p.y > vp.height - EDGE_ZONE ? -1 : 0;
  const scored = BASE_ORDER.map((a, i) => {
    const v = ANCHOR_VECTORS[a];
    return { a, score: v.dx * pushX + v.dy * pushY, i };
  });
  scored.sort((m, n) => n.score - m.score || m.i - n.i);
  const ordered = scored.map((s) => s.a);
  if (prevAnchor && ANCHORS.includes(prevAnchor)) {
    return [prevAnchor, ...ordered.filter((a) => a !== prevAnchor)];
  }
  return ordered;
}

/**
 * Greedy priority placement. Deterministic for identical inputs:
 * candidates sort by (priority desc, id asc); ties in anchor scoring
 * follow fixed orders. No randomness anywhere.
 */
export function placeLabels(
  candidates: LabelCandidate[],
  dots: DotObstacle[],
  viewport: Viewport,
): Placement[] {
  const placed: Rect[] = [];
  const results: Placement[] = [];

  const sorted = [...candidates].sort((a, b) => b.priority - a.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  for (const c of sorted) {
    // Stations outside the viewport get no label.
    if (
      c.point.x < -OFFSCREEN_MARGIN ||
      c.point.y < -OFFSCREEN_MARGIN ||
      c.point.x > viewport.width + OFFSCREEN_MARGIN ||
      c.point.y > viewport.height + OFFSCREEN_MARGIN
    ) {
      results.push({ id: c.id, anchor: null, x: 0, y: 0, hidden: true });
      continue;
    }

    const preference = anchorPreference(c.point, viewport, c.prevAnchor);
    let chosen: { anchor: Anchor; rect: Rect } | null = null;

    for (const anchor of preference) {
      const rect = rectForAnchor(c.point, c.width, c.height, anchor);
      if (!inViewport(rect, viewport)) continue;
      if (pointToRectDistance(c.point, rect) > MAX_LABEL_GAP) continue;
      let hits = false;
      for (const r of placed) {
        if (rectsOverlap(rect, 0, r, LABEL_CLEARANCE)) {
          hits = true;
          break;
        }
      }
      if (hits) continue;
      for (const d of dots) {
        if (d.id === c.id) continue;
        if (circleHitsRect(d.point, d.radius, rect)) {
          hits = true;
          break;
        }
      }
      if (hits) continue;
      chosen = { anchor, rect };
      break;
    }

    if (!chosen && c.forced) {
      // Least-bad NEARBY anchor: minimize label overlap + dot covers +
      // viewport violation, still within the fixed close anchor set.
      let best: { anchor: Anchor; rect: Rect; cost: number } | null = null;
      for (const anchor of preference) {
        const rect = rectForAnchor(c.point, c.width, c.height, anchor);
        let cost = 0;
        if (!inViewport(rect, viewport)) cost += 100;
        for (const r of placed) {
          if (rectsOverlap(rect, 0, r, 0)) cost += 10;
        }
        for (const d of dots) {
          if (d.id === c.id) continue;
          if (circleHitsRect(d.point, d.radius, rect)) cost += 10;
        }
        // Slight preference for smaller visual gap on ties.
        cost += pointToRectDistance(c.point, rect) / 100;
        if (!best || cost < best.cost) best = { anchor, rect, cost };
      }
      if (best) chosen = { anchor: best.anchor, rect: best.rect };
    }

    if (!chosen) {
      results.push({ id: c.id, anchor: null, x: 0, y: 0, hidden: true });
      continue;
    }

    placed.push(chosen.rect);
    results.push({ id: c.id, anchor: chosen.anchor, x: chosen.rect.x, y: chosen.rect.y, hidden: false });
  }

  return results;
}
