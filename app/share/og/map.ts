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

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

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
}

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function buildShareMap(
  fromId: string,
  toId: string,
): ShareMapModel | null {
  try {
    const stations = getAllStations().filter(
      (s) =>
        Number.isFinite(s.location.lat) && Number.isFinite(s.location.lng),
    );
    if (stations.length === 0) return null;

    // Equirectangular fit with latitude correction, cover-fit + padding.
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
    // clipping endpoint markers. Letterbox bands show the dark base.
    const s = Math.min(OG_WIDTH / w, OG_HEIGHT / h);
    const cLng = (minLng + maxLng) / 2;
    const cLat = (minLat + maxLat) / 2;
    const X = (lng: number): number =>
      OG_WIDTH / 2 + (lng - cLng) * kx * s;
    const Y = (lat: number): number =>
      OG_HEIGHT / 2 - (lat - cLat) * s;

    // Planned path geometry from the shared topology (null-safe: an empty
    // highlight set simply renders the dim network alone).
    const pathKeys = new Set<string>();
    const pathStations: string[] = [];
    if (topo) {
      for (const seg of topo.segments) {
        for (let i = 0; i < seg.stations.length; i++) {
          const sid = seg.stations[i];
          if (pathStations[pathStations.length - 1] !== sid) {
            pathStations.push(sid);
          }
          if (i + 1 < seg.stations.length) {
            pathKeys.add(edgeKey(sid, seg.stations[i + 1]));
          }
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

    const dots: MapDotView[] = [];
    const seen = new Set<string>();
    for (const sid of pathStations) {
      if (seen.has(sid)) continue;
      seen.add(sid);
      const st = getStation(sid);
      if (!st) continue;
      dots.push({
        x: X(st.location.lng),
        y: Y(st.location.lat),
        r: 6,
        fill: "#e4e4e7",
        glow: null,
      });
    }
    for (const sid of [fromId, toId]) {
      const st = getStation(sid);
      if (!st) continue;
      const x = X(st.location.lng);
      const y = Y(st.location.lat);
      dots.push({ x, y, r: 11, fill: "#E0001F", glow: "0 0 16px #E0001F" });
      dots.push({ x, y, r: 4.5, fill: "#ffffff", glow: null });
    }
    return { edges, dots };
  } catch {
    return null;
  }
}
