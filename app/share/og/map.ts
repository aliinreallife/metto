// Schematic minimap model for the OG card (Level 1.5, approved exception).
//
// What this computes: dim full-network edges + the planned *path geometry*
// highlighted per line color + origin/destination markers — projected from
// station geo-coordinates into 1200x630 card space. Pure static data only:
// no timetable, no schedule data, no holiday/Redis I/O, no ETAs or durations
// (those stay Level-1-forbidden). Topology comes from the time-independent
// Dijkstra path (computeRouteTopology), which never sees a clock.
// Any failure -> null -> text-only card (the image endpoint never 500s).

import { LINE_COLORS, LINES } from "@/lib/metro/lines";
import {
  buildMapEdges,
  getAllStations,
  getStation,
} from "@/lib/metro/selectors";
import { computeRouteTopology } from "@/lib/route";

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

// Dedicated map panel geometry inside the horizontal-split card (text column
// is 520px, gap 48px, outer horizontal padding 60px each side, vertical
// padding 48px: 60+512+48+520+60 = 1200 wide, 48+534+48 = 630 tall).
// Single source of truth — card.tsx sizes its panel from these values and
// passes them back as the projection viewport, so model coords always land
// inside the visible panel.
export const OG_PANEL = { w: 512, h: 534 };

export interface MapEdgeView {
  cx: number;
  cy: number;
  len: number;
  deg: number;
  thick: number;
  color: string;
  opacity: number;
  glow: string | null;
}

export interface MapDotView {
  x: number;
  y: number;
  r: number;
  fill: string;
  glow: string | null;
}

export interface ShareMapModel {
  edges: MapEdgeView[];
  dots: MapDotView[];
  /** Landmark pin markers (cyan), panel-local coords, clamped inside. */
  pins: MapDotView[];
  /** Walk connectors from each pin to its endpoint station. */
  connectors: MapEdgeView[];
  /** Ride legs in travel order (consecutive same-line segments merged). */
  legs: ShareLineLeg[];
  /** Boardable stops / physical line changes (0 when unroutable). */
  numStops: number;
  numTransfers: number;
  /** Segment-boundary stations worth marking on the map. */
  interchangeIds: string[];
}

/** One colored leg of the schematic strip + line chips. */
export interface ShareLineLeg {
  line: number;
  label: string;
  color: string;
  /** Stations ridden on this leg (edges, for proportional strip widths). */
  stops: number;
}

/** Minimal pin coordinate surface (matches SharePin minus the label). */
export interface SharePinCoord {
  lat: number;
  lng: number;
}

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

const PIN_COLOR = "#22d3ee";
const PIN_MARGIN = 16;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function buildShareMap(
  fromId: string,
  toId: string,
  opts?: {
    /** Projection viewport (panel-local coords). Defaults to full canvas. */
    viewport?: { w: number; h: number };
    /** Landmark pins: drawn as markers + connectors, never routed. */
    originPin?: SharePinCoord | null;
    destPin?: SharePinCoord | null;
  },
): ShareMapModel | null {
  try {
    const vw = opts?.viewport?.w ?? OG_WIDTH;
    const vh = opts?.viewport?.h ?? OG_HEIGHT;
    const stations = getAllStations().filter(
      (s) =>
        Number.isFinite(s.location.lat) && Number.isFinite(s.location.lng),
    );
    if (stations.length === 0) return null;

    // Equirectangular fit with latitude correction, contain-fit + margin.
    // Topology once: drives both the viewport focus (below) and the path
    // highlight (further below). Null when unroutable — the card then shows
    // the dim network alone, never an error.
    let topo: ReturnType<typeof computeRouteTopology> = null;
    try {
      topo = computeRouteTopology(fromId, toId);
    } catch {
      topo = null;
    }
    // Journey-focus bbox: the planned path defines the viewport (plus the
    // endpoints, which always lie on the path when routable), so markers
    // are never cropped and the urban core fills the frame. Without a
    // topology (unroutable endpoints) fall back to the full network bbox —
    // endpoints are stations, hence inside by construction.
    const focusIds =
      topo && topo.path.length > 0
        ? topo.path
        : stations.map((s) => s.id);
    const focusStations = focusIds
      .map((id) => getStation(id))
      .filter(
        (s): s is NonNullable<typeof s> =>
          !!s && Number.isFinite(s.location.lat) && Number.isFinite(s.location.lng),
      );
    if (focusStations.length === 0) return null;
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;
    for (const s of focusStations) {
      minLat = Math.min(minLat, s.location.lat);
      maxLat = Math.max(maxLat, s.location.lat);
      minLng = Math.min(minLng, s.location.lng);
      maxLng = Math.max(maxLng, s.location.lng);
    }
    // Minimum span (adjacent stations must not zoom absurdly) + full-span
    // margin: the journey sits centrally with network context around it,
    // and endpoint markers never collide with the card chrome.
    const MIN_SPAN = 0.09;
    const spanLat = Math.max(maxLat - minLat, MIN_SPAN);
    const spanLng = Math.max(maxLng - minLng, MIN_SPAN);
    const cLat0 = (minLat + maxLat) / 2;
    const cLng0 = (minLng + maxLng) / 2;
    minLat = cLat0 - (spanLat * 2.0) / 2;
    maxLat = cLat0 + (spanLat * 2.0) / 2;
    minLng = cLng0 - (spanLng * 2.0) / 2;
    maxLng = cLng0 + (spanLng * 2.0) / 2;
    const kx = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
    const w = (maxLng - minLng) * kx;
    const h = maxLat - minLat;
    if (w <= 0 || h <= 0) return null;
    // Contain (not cover): the journey viewport must NEVER crop — cover-fit
    // would eat the margin whenever viewport and canvas aspects differ,
    // clipping endpoint markers. Letterbox bands show the panel base.
    const s = Math.min(vw / w, vh / h);
    const cLng = (minLng + maxLng) / 2;
    const cLat = (minLat + maxLat) / 2;
    const X = (lng: number): number => vw / 2 + (lng - cLng) * kx * s;
    const Y = (lat: number): number => vh / 2 - (lat - cLat) * s;

    // Planned path geometry from the shared topology (null-safe: an empty
    // highlight set simply renders the dim network alone).
    const pathKeys = new Set<string>();
    const pathStations: string[] = [];
    // Segment boundaries (interchanges) in travel order, excluding the
    // destination. Consecutive same-line legs merge for the strip.
    const interchangeIds: string[] = [];
    const legs: ShareLineLeg[] = [];
    let numStops = 0;
    let numTransfers = 0;
    if (topo) {
      numStops = topo.numStops;
      numTransfers = topo.numTransfers;
      for (let si = 0; si < topo.segments.length; si++) {
        const seg = topo.segments[si];
        for (let i = 0; i < seg.stations.length; i++) {
          const sid = seg.stations[i];
          if (pathStations[pathStations.length - 1] !== sid) {
            pathStations.push(sid);
          }
          if (i + 1 < seg.stations.length) {
            pathKeys.add(edgeKey(sid, seg.stations[i + 1]));
          }
        }
        if (si < topo.segments.length - 1) {
          interchangeIds.push(seg.stations[seg.stations.length - 1]);
        }
        const color = LINE_COLORS[seg.line] ?? "#E0001F";
        const label =
          LINES.find((l) => l.id === seg.line)?.name.fa ?? `خط ${seg.line}`;
        const stops = Math.max(seg.stations.length - 1, 1);
        const last = legs[legs.length - 1];
        if (last && last.line === seg.line) {
          last.stops += stops;
        } else {
          legs.push({ line: seg.line, label, color, stops });
        }
      }
    }

    const edges: MapEdgeView[] = [];
    for (const e of buildMapEdges()) {
      const a = getStation(e.a);
      const b = getStation(e.b);
      if (!a || !b) continue;
      const x1 = X(a.location.lng);
      const y1 = Y(a.location.lat);
      const x2 = X(b.location.lng);
      const y2 = Y(b.location.lat);
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy);
      if (!(len > 1)) continue;
      const hot = pathKeys.has(edgeKey(e.a, e.b));
      const color = hot ? (LINE_COLORS[e.line] ?? "#E0001F") : "#46464e";
      edges.push({
        cx: (x1 + x2) / 2,
        cy: (y1 + y2) / 2,
        len,
        deg: (Math.atan2(dy, dx) * 180) / Math.PI,
        thick: hot ? 5 : 2.5,
        color,
        opacity: hot ? 0.95 : 0.65,
        glow: hot ? `0 0 10px ${color}` : null,
      });
    }
    if (edges.length === 0) return null;

    // Stop dots, decluttered: a pearl on EVERY stop looks noisy on long
    // journeys, so intermediate dots appear only at interchanges — except
    // on short rides (<= 8 path stations) where the full necklace reads
    // well. Endpoints always get their red markers (drawn after, covering
    // any grey dot beneath on looping routes).
    const dots: MapDotView[] = [];
    const seen = new Set<string>();
    const interchangeSet = new Set<string>(interchangeIds);
    const showAllStops = pathStations.length <= 8;
    // Endpoints get red markers below (drawn after, so they would cover
    // grey dots anyway) — skip them here to keep counts exact.
    const first = pathStations[0];
    const last = pathStations[pathStations.length - 1];
    for (const sid of pathStations) {
      if (seen.has(sid)) continue;
      seen.add(sid);
      if (sid === first || sid === last) continue;
      const st = getStation(sid);
      if (!st) continue;
      const x = X(st.location.lng);
      const y = Y(st.location.lat);
      if (interchangeSet.has(sid)) {
        dots.push({ x, y, r: 7, fill: "#e4e4e7", glow: null });
        dots.push({ x, y, r: 2.5, fill: "#ffffff", glow: null });
      } else if (showAllStops) {
        dots.push({ x, y, r: 5, fill: "#e4e4e7", glow: null });
      }
    }
    for (const sid of [fromId, toId]) {
      const st = getStation(sid);
      if (!st) continue;
      const x = X(st.location.lng);
      const y = Y(st.location.lat);
      dots.push({ x, y, r: 11, fill: "#E0001F", glow: "0 0 16px #E0001F" });
      dots.push({ x, y, r: 4.5, fill: "#ffffff", glow: null });
    }

    // Landmark pins: presentation-only markers. Projected with the same
    // transform, clamped inside the panel (a far landmark must never push
    // the journey viewport or escape its section), each with a walk
    // connector to its endpoint station. Cyan = place, red = station.
    const pins: MapDotView[] = [];
    const connectors: MapEdgeView[] = [];
    const pinJobs = [
      { pin: opts?.originPin ?? null, stationId: fromId },
      { pin: opts?.destPin ?? null, stationId: toId },
    ];
    for (const { pin, stationId } of pinJobs) {
      if (
        !pin ||
        !Number.isFinite(pin.lat) ||
        !Number.isFinite(pin.lng)
      ) {
        continue;
      }
      const st = getStation(stationId);
      if (!st) continue;
      const sx = X(st.location.lng);
      const sy = Y(st.location.lat);
      const px = clamp(X(pin.lng), PIN_MARGIN, vw - PIN_MARGIN);
      const py = clamp(Y(pin.lat), PIN_MARGIN, vh - PIN_MARGIN);
      const dx = sx - px;
      const dy = sy - py;
      const len = Math.hypot(dx, dy);
      if (len > 4) {
        connectors.push({
          cx: (px + sx) / 2,
          cy: (py + sy) / 2,
          len,
          deg: (Math.atan2(dy, dx) * 180) / Math.PI,
          thick: 3,
          color: PIN_COLOR,
          opacity: 0.75,
          glow: null,
        });
      }
      pins.push({
        x: px,
        y: py,
        r: 9,
        fill: PIN_COLOR,
        glow: `0 0 14px ${PIN_COLOR}`,
      });
      pins.push({ x: px, y: py, r: 3.5, fill: "#ffffff", glow: null });
    }
    return {
      edges,
      dots,
      pins,
      connectors,
      legs,
      numStops,
      numTransfers,
      interchangeIds,
    };
  } catch {
    return null;
  }
}
