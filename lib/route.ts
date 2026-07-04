import { STATIONS, type Station } from "./metro-data";
import { ROUTE_ADJ as ADJ, STATION_BY_ID } from "./graph";
import { getScheduleTravelTime, getCurrentDayType } from "./schedule-utils";

export const STATION_MAP: Map<string, Station> = STATION_BY_ID;

// Cost model for "fewest stops + fewest transfers".
// Each hop between adjacent stations costs RIDE_COST.
// Each line change costs TRANSFER_PENALTY (≈ several stops of inconvenience).
const RIDE_COST = 1;
const TRANSFER_PENALTY = 5;

// Time model: derive travel time from real inter-station distances.
// Tehran Metro cruising speed (incl. acceleration/deceleration): ~35 km/h.
// Dwell time per station: ~25 s. Platform transfer walk: ~4 min.
const AVG_SPEED_KMH = 35;
const DWELL_S = 25;
const TRANSFER_S = 4 * 60;

function hopKm(
  fromId: string,
  toId: string,
  map: Map<string, { lat: number; lng: number }>,
): number {
  const a = map.get(fromId);
  const b = map.get(toId);
  if (!a || !b) return 1;
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinDLng *
      sinDLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

type Hop = { from: string; to: string; line: number };

export type RouteSegment = {
  line: number;
  stations: string[]; // ordered station ids, inclusive of board & alight
  terminal: string; // last station in the direction of travel on this line
};

export type RouteResult = {
  hops: Hop[];
  segments: RouteSegment[];
  path: string[]; // ordered station ids
  numStops: number;
  numTransfers: number;
  estimatedSeconds: number;
};

type StateKey = string; // `${stationId}|${line}`

function key(station: string, line: number): StateKey {
  return `${station}|${line}`;
}

// Find the terminal station of a line in the direction from startId towards nextId.
// Walks the line's adjacency until reaching a station with only one same-line neighbor.
function getTerminalStation(
  startId: string,
  nextId: string,
  line: number,
): string {
  let prev = startId;
  let cur = nextId;
  for (let i = 0; i < 200; i++) {
    const edges = ADJ.get(cur) ?? [];
    const sameLine = edges.filter(
      (e) => e.lines.includes(line) && e.to !== prev,
    );
    if (sameLine.length === 0) return cur;
    prev = cur;
    cur = sameLine[0].to;
  }
  return cur;
}

// Dijkstra over (station, current line) states so we can charge transfer cost.
export function findRoute(
  originId: string,
  destId: string,
): RouteResult | null {
  if (originId === destId) return null;
  if (!STATION_MAP.has(originId) || !STATION_MAP.has(destId)) return null;

  const dist = new Map<StateKey, number>();
  const prev = new Map<StateKey, { state: StateKey; hop: Hop } | null>();

  // Simple binary-heap-free priority via array; graph is small (150 nodes).
  const pq: { cost: number; state: StateKey }[] = [];
  const push = (cost: number, state: StateKey) => {
    pq.push({ cost, state });
    let i = pq.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (pq[p].cost <= pq[i].cost) break;
      [pq[p], pq[i]] = [pq[i], pq[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = pq[0];
    const last = pq.pop()!;
    if (pq.length) {
      pq[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        let m = i;
        if (l < pq.length && pq[l].cost < pq[m].cost) m = l;
        if (r < pq.length && pq[r].cost < pq[m].cost) m = r;
        if (m === i) break;
        [pq[m], pq[i]] = [pq[i], pq[m]];
        i = m;
      }
    }
    return top;
  };

  const origin = STATION_MAP.get(originId)!;
  for (const line of origin.lines) {
    const k = key(originId, line);
    dist.set(k, 0);
    prev.set(k, null);
    push(0, k);
  }

  let best: { cost: number; state: StateKey } | null = null;

  while (pq.length) {
    const { cost, state } = pop();
    if (cost > (dist.get(state) ?? Infinity)) continue;
    const [stationId, lineStr] = state.split("|");
    const curLine = Number(lineStr);

    if (stationId === destId) {
      if (!best || cost < best.cost) best = { cost, state };
      continue;
    }

    for (const edge of ADJ.get(stationId) ?? []) {
      for (const line of edge.lines) {
        const transferred = line !== curLine;
        const nextCost =
          cost + RIDE_COST + (transferred ? TRANSFER_PENALTY : 0);
        const nk = key(edge.to, line);
        if (nextCost < (dist.get(nk) ?? Infinity)) {
          dist.set(nk, nextCost);
          prev.set(nk, { state, hop: { from: stationId, to: edge.to, line } });
          push(nextCost, nk);
        }
      }
    }
  }

  if (!best) return null;

  // Reconstruct hops.
  const hops: Hop[] = [];
  let cur: StateKey | null = best.state;
  while (cur) {
    const entry = prev.get(cur);
    if (!entry) break;
    hops.unshift(entry.hop);
    cur = entry.state;
  }

  if (!hops.length) return null;

  // Build ordered path.
  const path: string[] = [hops[0].from];
  for (const h of hops) path.push(h.to);

  // Group hops into segments by line.
  const segments: RouteSegment[] = [];
  for (const h of hops) {
    const last = segments[segments.length - 1];
    if (last && last.line === h.line) {
      last.stations.push(h.to);
    } else {
      const terminal = getTerminalStation(h.from, h.to, h.line);
      segments.push({ line: h.line, stations: [h.from, h.to], terminal });
    }
  }

  const numStops = hops.length;
  const numTransfers = Math.max(0, segments.length - 1);

  // Sum travel time across each hop, using schedule data when available.
  const dayType = getCurrentDayType();
  let rideSeconds = 0;
  for (const h of hops) {
    const scheduleTime = getScheduleTravelTime(h.from, h.to, h.line, dayType);
    if (scheduleTime !== null) {
      rideSeconds += scheduleTime;
    } else {
      // Fallback to distance-based estimation
      const km = hopKm(
        h.from,
        h.to,
        STATION_MAP as Map<string, { lat: number; lng: number }>,
      );
      rideSeconds += (km / AVG_SPEED_KMH) * 3600 + DWELL_S;
    }
  }
  const estimatedSeconds = Math.round(rideSeconds) + numTransfers * TRANSFER_S;

  return { hops, segments, path, numStops, numTransfers, estimatedSeconds };
}

export function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/\u200c/g, " ")
    .replace(/[ك]/g, "ک")
    .replace(/[ي]/g, "ی")
    .trim();
}

export type LineOrder = {
  chains: string[][]; // one chain per branch (most lines have 1)
  terminals: string[]; // terminal station ID per chain
};

/**
 * Walk a line's adjacency to produce ordered chains of station IDs.
 * Simple lines return one chain from terminal to terminal.
 * Lines with a fork (station with ≥3 same-line neighbors) return multiple
 * chains: the trunk (shared section) + one chain per branch beyond the fork.
 */
export function orderLineStations(line: number): LineOrder {
  const onLine = STATIONS.filter((s) => s.lines.includes(line));
  if (onLine.length === 0) return { chains: [], terminals: [] };

  // Build same-line adjacency (undirected), skipping self-loops.
  const adj = new Map<string, string[]>();
  for (const s of onLine) adj.set(s.id, []);
  for (const s of onLine) {
    for (const n of s.relations) {
      if (n === s.id || !adj.has(n)) continue;
      if (!adj.get(s.id)!.includes(n)) adj.get(s.id)!.push(n);
      if (!adj.get(n)!.includes(s.id)) adj.get(n)!.push(s.id);
    }
  }

  // Find terminals (1 neighbor) and fork points (≥3 neighbors).
  const terminals: string[] = [];
  const forkPoints = new Set<string>();
  for (const [id, neighbors] of adj) {
    if (neighbors.length === 1) terminals.push(id);
    if (neighbors.length >= 3) forkPoints.add(id);
  }

  // Simple line: walk from one terminal to the other.
  if (forkPoints.size === 0 || terminals.length < 3) {
    const start = terminals[0] ?? onLine[0].id;
    const chain: string[] = [];
    const visited = new Set<string>();
    let prev = "";
    let cur = start;
    while (cur && !visited.has(cur)) {
      visited.add(cur);
      chain.push(cur);
      const neighbors = (adj.get(cur) ?? []).filter((n) => n !== prev);
      prev = cur;
      cur = neighbors[0] ?? "";
    }
    return { chains: [chain], terminals: [chain[chain.length - 1]] };
  }

  // Forked line: walk from each terminal. At fork points, pick the first
  // unvisited branch for the trunk; other branches are separate chains.
  const visited = new Set<string>();
  const trunk: string[] = [];
  let trunkTerminal = "";
  {
    let prev = "";
    let cur = terminals[0];
    while (cur) {
      trunk.push(cur);
      visited.add(cur);
      // If this is a fork, check if we've reached another terminal
      if (forkPoints.has(cur) && trunk.length > 1) {
        // Check remaining unvisited neighbors for terminals
        const unvisited = (adj.get(cur) ?? []).filter(
          (n) => n !== prev && !visited.has(n),
        );
        for (const u of unvisited) {
          if (terminals.includes(u)) {
            trunkTerminal = u;
          }
        }
        if (trunkTerminal) break;
      }
      const neighbors = (adj.get(cur) ?? []).filter(
        (n) => n !== prev && !visited.has(n),
      );
      prev = cur;
      if (neighbors.length === 0) break;
      cur = neighbors[0];
    }
  }

  const chains: string[][] = [trunk];
  const termIds: string[] = [trunkTerminal || trunk[trunk.length - 1]];

  // Walk from remaining terminals, stop when hitting visited station.
  for (const start of terminals) {
    if (visited.has(start)) continue;
    const path: string[] = [];
    let prev = "";
    let cur = start;
    while (cur && !visited.has(cur)) {
      path.push(cur);
      visited.add(cur);
      const neighbors = (adj.get(cur) ?? []).filter((n) => n !== prev);
      prev = cur;
      cur = neighbors[0] ?? "";
    }
    if (path.length > 0) chains.push(path);
    termIds.push(path[path.length - 1]);
  }

  return { chains, terminals: termIds };
}

export function searchStations(query: string, limit = 30): Station[] {
  const q = normalize(query);
  if (!q)
    return STATIONS.slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, limit);
  const scored: { s: Station; score: number }[] = [];
  for (const s of STATIONS) {
    const en = normalize(s.name);
    const fa = normalize(s.fa);
    let score = -1;
    if (en.startsWith(q) || fa.startsWith(q)) score = 0;
    else if (en.includes(q) || fa.includes(q)) score = 1;
    if (score >= 0) scored.push({ s, score });
  }
  scored.sort((a, b) => a.score - b.score || a.s.name.localeCompare(b.s.name));
  return scored.slice(0, limit).map((x) => x.s);
}
