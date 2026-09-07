import { STATIONS } from "./stations";
import { ROUTES } from "./routes";
import { SEGMENTS } from "./segments";
import { STATION_ALIASES } from "./aliases";
import type {
  LineId,
  MetroStation,
  NeighborInfo,
  RouteId,
  StationId,
  StopStatus,
} from "./types";

// ---- Indexes (built once at module init) ----

const stationById = new Map<StationId, MetroStation>(
  STATIONS.map((s) => [s.id, s]),
);

const routeById = new Map<RouteId, (typeof ROUTES)[number]>(
  ROUTES.map((r) => [r.id, r]),
);

const routesByStation = new Map<StationId, RouteId[]>();
const stopStatusByRouteStation = new Map<string, StopStatus>();
for (const r of ROUTES) {
  for (const stop of r.stops) {
    const list = routesByStation.get(stop.stationId) ?? [];
    list.push(r.id);
    routesByStation.set(stop.stationId, list);
    stopStatusByRouteStation.set(`${r.id}:${stop.stationId}`, stop.status);
  }
}

const segmentsByStation = new Map<StationId, number[]>();
SEGMENTS.forEach((s, i) => {
  for (const sid of [s.from, s.to]) {
    const list = segmentsByStation.get(sid) ?? [];
    list.push(i);
    segmentsByStation.set(sid, list);
  }
});

// ---- Stations ----

/** Resolve a station by canonical slug or legacy English-name ID. */
export function getStation(id: string): MetroStation | undefined {
  return stationById.get(id) ?? stationById.get(STATION_ALIASES[id]);
}

/** Canonical slug for any known id (legacy or new). Unknown -> undefined. */
export function resolveStationId(id: string): StationId | undefined {
  if (stationById.has(id)) return id;
  return STATION_ALIASES[id];
}

export function getAllStations(): MetroStation[] {
  return STATIONS;
}

// ---- Derived line membership ----

/** All lines serving a station (physical/planned memberships, any status). Sorted. */
export function getStationLines(stationId: StationId): LineId[] {
  const routes = routesByStation.get(stationId) ?? [];
  const lines = new Set<LineId>();
  for (const rid of routes) {
    const r = routeById.get(rid);
    if (r) lines.add(r.lineId);
  }
  return [...lines].sort((a, b) => a - b);
}

/** Boarding status of one station on one route. Explicit per-stop status;
 * falls back to the physical station status for unknown pairs. */
export function getStopStatus(routeId: RouteId, stationId: StationId): StopStatus {
  const explicit = stopStatusByRouteStation.get(`${routeId}:${stationId}`);
  if (explicit) return explicit;
  const station = stationById.get(stationId);
  if (!station || station.status === "operational") return "operational";
  if (station.status === "planned") return "planned";
  return "under_construction";
}

/**
 * Boarding rule: a passenger can board iff the physical station is
 * operational AND the stop on that line is operational. With no lineId,
 * true when boardable on at least one line.
 */
export function canBoardAtStation(stationId: StationId, lineId?: LineId): boolean {
  const station = stationById.get(stationId);
  if (!station || station.status !== "operational") return false;
  const routes = getRoutesForStation(stationId).filter(
    (r) => lineId === undefined || r.lineId === lineId,
  );
  return routes.some((r) => getStopStatus(r.id, stationId) === "operational");
}

/** A transfer between two lines needs a boardable stop on both. */
export function canTransferAtStation(
  stationId: StationId,
  fromLine: LineId,
  toLine: LineId,
): boolean {
  return canBoardAtStation(stationId, fromLine) && canBoardAtStation(stationId, toLine);
}

/** Lines with at least one boardable stop at this station. Sorted. */
export function getOperationalStationLines(stationId: StationId): LineId[] {
  return getStationLines(stationId).filter((l) => canBoardAtStation(stationId, l));
}

/** @deprecated Use getOperationalStationLines (stop-based, not segment-based). */
export function getOperationalLines(stationId: StationId): LineId[] {
  return getOperationalStationLines(stationId);
}

// ---- Neighbors (from segments, never manual) ----

export function getStationNeighbors(stationId: StationId): NeighborInfo[] {
  const idxs = segmentsByStation.get(stationId) ?? [];
  return idxs.map((i) => {
    const s = SEGMENTS[i];
    return {
      stationId: s.from === stationId ? s.to : s.from,
      lineId: s.lineId,
      routeId: s.routeId,
      ...(s.branchId ? { branchId: s.branchId } : {}),
      status: s.status,
    };
  });
}

/**
 * Traversable neighbors: operational segments only. The endpoint's boarding
 * status is deliberately NOT checked — trains pass through non-boardable
 * stations (e.g. Vavan) when the track is operational. Boarding / alighting /
 * transferring is gated separately by canBoardAtStation/canTransferAtStation.
 */
export function getOperationalNeighbors(stationId: StationId): NeighborInfo[] {
  return getStationNeighbors(stationId).filter((n) => n.status === "operational");
}

export function getSegmentsForStation(stationId: StationId) {
  const idxs = segmentsByStation.get(stationId) ?? [];
  return idxs.map((i) => SEGMENTS[i]);
}

// ---- Routes ----

export function getRoutesForStation(stationId: StationId) {
  return (routesByStation.get(stationId) ?? []).map((rid) => routeById.get(rid)!);
}

export function getRouteStations(routeId: RouteId): StationId[] {
  return routeById.get(routeId)?.stops.map((s) => s.stationId) ?? [];
}

/** Terminals of a route = first/last stations of its ordered list. */
export function getRouteTerminals(routeId: RouteId): StationId[] {
  const ids = getRouteStations(routeId);
  if (ids.length === 0) return [];
  if (ids.length === 1) return [ids[0]];
  return [ids[0], ids[ids.length - 1]];
}

/** Route ids for which the station is an endpoint (branch-aware). */
export function getStationTerminalRoutes(stationId: StationId): RouteId[] {
  return getRoutesForStation(stationId)
    .filter((r) => {
      const t = getRouteTerminals(r.id);
      return t.includes(stationId);
    })
    .map((r) => r.id);
}

// ---- Interchange / junction (derived, never stored) ----

/** True interchange: serves >1 physical line (any status). Same-line branches don't count. */
export function isInterchange(stationId: StationId): boolean {
  return getStationLines(stationId).length > 1;
}

/** Interchange where a passenger can actually change lines today. */
export function isOperationalInterchange(stationId: StationId): boolean {
  return getOperationalStationLines(stationId).length > 1;
}

/** Junction between routes of the same physical line (e.g. Parand fork). */
export function isBranchJunction(stationId: StationId): boolean {
  const routes = getRoutesForStation(stationId);
  const byLine = new Map<LineId, Set<string | undefined>>();
  for (const r of routes) {
    const set = byLine.get(r.lineId) ?? new Set();
    set.add(r.branchId);
    byLine.set(r.lineId, set);
  }
  return [...byLine.values()].some((branches) => branches.size > 1);
}

// ---- Map rendering ----

export type MapEdge = {
  a: StationId;
  b: StationId;
  line: LineId;
  status: "operational" | "under_construction" | "planned" | "temporarily_closed";
};

/** Unique undirected edges for drawing the map, with construction state. */
export function buildMapEdges(): MapEdge[] {
  const seen = new Set<string>();
  const edges: MapEdge[] = [];
  for (const s of SEGMENTS) {
    const k = [s.from, s.to].sort().join("|") + "|" + s.lineId;
    if (seen.has(k)) continue;
    seen.add(k);
    edges.push({ a: s.from, b: s.to, line: s.lineId, status: s.status });
  }
  return edges;
}

// ---- Search ----

export function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/\u200c/g, " ")
    .replace(/[ك]/g, "ک")
    .replace(/[ي]/g, "ی")
    .trim();
}

export function searchStations(query: string, limit = 30): MetroStation[] {
  const q = normalize(query);
  // Only boardable stations are valid trip endpoints.
  const available = STATIONS.filter((s) => canBoardAtStation(s.id));
  if (!q)
    return available
      .slice()
      .sort((a, b) => a.name.en.localeCompare(b.name.en))
      .slice(0, limit);
  const scored: { s: MetroStation; score: number }[] = [];
  for (const s of available) {
    const en = normalize(s.name.en);
    const fa = normalize(s.name.fa);
    let score = -1;
    if (en.startsWith(q) || fa.startsWith(q)) score = 0;
    else if (en.includes(q) || fa.includes(q)) score = 1;
    if (score >= 0) scored.push({ s, score });
  }
  scored.sort(
    (a, b) => a.score - b.score || a.s.name.en.localeCompare(b.s.name.en),
  );
  return scored.slice(0, limit).map((x) => x.s);
}
