// Schematic minimap model for the OG card (Level 1.5, approved exception).
//
// What this computes: dim full-network edges + the planned *path geometry*
// highlighted per line color + origin/destination markers — projected from
// station geo-coordinates into 1200x630 card space. Pure static data only:
// no timetable, no schedule data, no holiday/Redis I/O, no ETAs or durations
// (those stay Level-1-forbidden). Topology comes from the time-independent
// Dijkstra path (computeRouteTopology), which never sees a clock.
// Any failure -> null -> text-only card (the image endpoint never 500s).

import { LINE_COLORS } from "@/lib/metro/lines";
import {
  buildMapEdges,
  getAllStations,
  getStation,
} from "@/lib/metro/selectors";
import { computeRouteTopology } from "@/lib/route";
import { persianDigits } from "@/lib/i18n";

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

// Social-preview split: the map owns 720px of the 1200x630 canvas and runs
// full-height; the remaining 480px belongs to the RTL route summary.
// Single source of truth — card.tsx sizes its sections from these values
// and passes the panel back as the projection viewport, so model coords
// always land inside the visible map.
export const OG_PANEL = { w: 720, h: 630 } as const;

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
  /** Seam dots welding highlight bars at plain vertices (leg-colored,
   *  invisible as dots — they read as rounded joints). */
  joints: MapDotView[];
  /** Seam dots welding dim-network bars at multi-edge vertices (dim-colored,
   *  rendered at dim opacity — they read as continuous track, never dots).
   *  Stations already carrying a marker (endpoints, interchanges, highlight
   *  joints) are excluded here. */
  dimJoints: MapDotView[];
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

/** Line-aware edge identity: station pair + metro line. Shared/parallel
 *  track across lines must never collide. Exported for unit testing. */
export function edgeKey(a: string, b: string, line: number): string {
  const pair = a < b ? `${a}|${b}` : `${b}|${a}`;
  return `${pair}|${line}`;
}

/** Line-aware highlight check: a shared station pair must only light up on
 *  the line actually ridden (parallel/shared track across lines). Pure so
 *  the behavior is unit-testable with synthetic inputs. */
export function isHotEdge(
  a: string,
  b: string,
  line: number,
  pathKeys: Set<string>,
): boolean {
  return pathKeys.has(edgeKey(a, b, line));
}

/** Viewport bleed for geometry culling (panel px). Culled nodes are never
 *  visible — the panel clips — so they only cost Satori render time. */
export const MAP_BLEED = 24;

/** True when a segment lies completely outside the viewport (plus bleed).
 *  A segment CROSSING the viewport is retained even when both endpoints sit
 *  outside on opposite sides: only full containment outside culls. Pure for
 *  unit testing. */
export function isOutsideViewport(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  vw: number,
  vh: number,
  bleed: number = MAP_BLEED,
): boolean {
  return (
    Math.max(x1, x2) < -bleed ||
    Math.min(x1, x2) > vw + bleed ||
    Math.max(y1, y2) < -bleed ||
    Math.min(y1, y2) > vh + bleed
  );
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
    // Minimum span (adjacent stations must not zoom absurdly) + focus
    // padding: the journey sits centrally with network context around it,
    // and endpoint markers never collide with the card chrome. Padding is
    // deliberately modest so short journeys still fill the panel (contain
    // fit guarantees nothing ever crops).
    const MIN_SPAN = 0.04;
    const FOCUS_PADDING = 1.55;
    const spanLat = Math.max(maxLat - minLat, MIN_SPAN);
    const spanLng = Math.max(maxLng - minLng, MIN_SPAN);
    const cLat0 = (minLat + maxLat) / 2;
    const cLng0 = (minLng + maxLng) / 2;
    minLat = cLat0 - (spanLat * FOCUS_PADDING) / 2;
    maxLat = cLat0 + (spanLat * FOCUS_PADDING) / 2;
    minLng = cLng0 - (spanLng * FOCUS_PADDING) / 2;
    maxLng = cLng0 + (spanLng * FOCUS_PADDING) / 2;
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
    // Leg color per station (segment's last station excluded: it is the
    // next segment's first — a boundary, never a plain vertex).
    const legColorByStation = new Map<string, string>();
    let numStops = 0;
    let numTransfers = 0;
    if (topo) {
      numStops = topo.numStops;
      numTransfers = topo.numTransfers;
      for (let si = 0; si < topo.segments.length; si++) {
        const seg = topo.segments[si];
        const color = LINE_COLORS[seg.line] ?? "#E0001F";
        for (let i = 0; i < seg.stations.length; i++) {
          const sid = seg.stations[i];
          if (pathStations[pathStations.length - 1] !== sid) {
            pathStations.push(sid);
          }
          if (i + 1 < seg.stations.length) {
            pathKeys.add(edgeKey(sid, seg.stations[i + 1], seg.line));
            legColorByStation.set(sid, color);
          }
        }
        if (si < topo.segments.length - 1) {
          interchangeIds.push(seg.stations[seg.stations.length - 1]);
        }
        // Line legend label in digit-first order ("۱ خط"), built from the
        // line number via Persian digits — never from LINES display names
        // (which use "خط ۱" order).
        const label = `${persianDigits(seg.line, "fa")} خط`;
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
    // Incident drawn-edge counts per station: drives the dim-network welds
    // below (a lone terminus needs no weld — its round cap is the ending).
    const incident = new Map<string, number>();
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
      // Cull fully offscreen geometry before it costs Satori nodes: the
      // panel would clip it anyway. Crossing segments stay (both endpoints
      // outside on opposite sides still paints across the panel).
      if (isOutsideViewport(x1, y1, x2, y2, vw, vh)) continue;
      const len = Math.hypot(dx, dy);
      if (!(len > 1)) continue;
      const hot = isHotEdge(e.a, e.b, e.line, pathKeys);
      const color = hot ? (LINE_COLORS[e.line] ?? "#E0001F") : "#3b3d46";
      // Flat transit-schematic styling: the journey dominates by width and
      // color alone (no glow — box-shadow blur is the dominant render cost).
      // Dim track stays quiet context at low opacity.
      const thick = hot ? 6 : 2;
      incident.set(e.a, (incident.get(e.a) ?? 0) + 1);
      incident.set(e.b, (incident.get(e.b) ?? 0) + 1);
      edges.push({
        cx: (x1 + x2) / 2,
        cy: (y1 + y2) / 2,
        // Overlap extension: each bar runs thick/2 past its vertices, so
        // independently-rotated neighbours overlap instead of meeting
        // tip-to-tip (the weld dots below then round off the outer wedge).
        len: len + thick,
        deg: (Math.atan2(dy, dx) * 180) / Math.PI,
        thick,
        color,
        opacity: hot ? 1 : 0.35,
        glow: null,
      });
    }
    if (edges.length === 0) return null;

    // Stop dots, decluttered: a pearl on EVERY stop looks noisy on long
    // journeys, so intermediate dots appear only at interchanges — except
    // on short rides (<= 8 path stations) where the full necklace reads
    // well. Endpoints get flat minimal markers (no glow): a red dot with a
    // small white core, drawn after so they cover any dot beneath on
    // looping routes.
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
        dots.push({ x, y, r: 8, fill: "#e4e4e7", glow: null });
        dots.push({ x, y, r: 3, fill: "#ffffff", glow: null });
      } else if (showAllStops) {
        dots.push({ x, y, r: 3, fill: "#f4f4f5", glow: null });
      }
    }
    for (const sid of [fromId, toId]) {
      const st = getStation(sid);
      if (!st) continue;
      const x = X(st.location.lng);
      const y = Y(st.location.lat);
      dots.push({ x, y, r: 8, fill: "#E0001F", glow: null });
      dots.push({ x, y, r: 3, fill: "#ffffff", glow: null });
    }

    // Seam welds: one leg-colored dot on every plain path vertex, so
    // independently-rotated highlight bars read as one continuous line.
    // Same color as the surrounding bars (no core, no glow) — invisible
    // as dots, visible only as rounded joints. Interchanges and endpoints
    // already carry their own markers and are skipped here. Radius 3.5
    // against half-thick 3: just rounds the joint (±0.5px, no beading) —
    // the edge overlap above closes the wedge, so welds stay glowless.
    const joints: MapDotView[] = [];
    const jointIds = new Set<string>();
    {
      const seenJoint = new Set<string>();
      for (const sid of pathStations) {
        if (
          seenJoint.has(sid) ||
          sid === first ||
          sid === last ||
          interchangeSet.has(sid)
        ) {
          continue;
        }
        seenJoint.add(sid);
        const color = legColorByStation.get(sid);
        const st = getStation(sid);
        if (!color || !st) continue;
        joints.push({
          x: X(st.location.lng),
          y: Y(st.location.lat),
          r: 3.5,
          fill: color,
          glow: null,
        });
        jointIds.add(sid);
      }
    }

    // Dim-network welds: the background track has the same wedge-gap
    // problem at every multi-edge vertex, and no markers there by design —
    // unwelded it reads as disconnected dashes. One dim-colored dot per
    // multi-edge vertex, sized to just fill the wedge (r 1.5 vs half-thick
    // 1: ±0.5px, invisible as dots) — the overlap extension closes the
    // rest. Rendered at dim opacity in the card, so welds never read
    // brighter than the track. Marker stations (endpoints, interchanges,
    // highlight joints) already cover their vertices.
    const dimJoints: MapDotView[] = [];
    {
      const covered = new Set<string>();
      if (first !== undefined) covered.add(first);
      if (last !== undefined) covered.add(last);
      for (const id of interchangeSet) covered.add(id);
      for (const id of jointIds) covered.add(id);
      for (const [sid, n] of incident) {
        if (n < 2 || covered.has(sid)) continue;
        const st = getStation(sid);
        if (!st) continue;
        const x = X(st.location.lng);
        const y = Y(st.location.lat);
        // Cull fully off-panel welds (the panel clips them, like dim
        // edges): keeps Satori node count to what is actually visible.
        if (x < -2 || x > vw + 2 || y < -2 || y > vh + 2) continue;
        dimJoints.push({ x, y, r: 1.5, fill: "#3b3d46", glow: null });
      }
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
        r: 8,
        fill: PIN_COLOR,
        // Flat: no glow (render cost + the map is no longer neon).
        glow: null,
      });
      pins.push({ x: px, y: py, r: 3, fill: "#ffffff", glow: null });
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
      joints,
      dimJoints,
    };
  } catch {
    return null;
  }
}
