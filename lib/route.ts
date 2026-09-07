import {
  canBoardAtStation,
  canTransferAtStation,
  getAllStations,
  getRouteStations,
  getRouteTerminals,
  getStation,
  getRoutesForStation,
  resolveStationId,
  searchStations as searchMetroStations,
} from "./metro/selectors";
import { SEGMENTS } from "./metro/segments";
import type { JourneyChange, MetroStation } from "./metro/types";
import { ROUTES } from "./metro/routes";
import { findBestTrip, getCurrentDayType, type TripResult } from "./schedule-utils";

// Canonical station lookup that also resolves legacy English-name IDs, so old
// ?from=/?to= URLs, API params and schedule data keep working.
class StationMap extends Map<string, MetroStation> {
  override get(key: string): MetroStation | undefined {
    return super.get(key) ?? super.get(resolveStationId(key) ?? "");
  }
  override has(key: string): boolean {
    if (super.has(key)) return true;
    const resolved = resolveStationId(key);
    return resolved !== undefined && super.has(resolved);
  }
}

export const STATION_MAP: Map<string, MetroStation> = new StationMap(
  getAllStations().map((s) => [s.id, s]),
);

// Cost model for "fewest stops + fewest transfers".
// Each hop between adjacent stations costs RIDE_COST.
// Each line change costs TRANSFER_PENALTY (≈ several stops of inconvenience).
const RIDE_COST = 1;
const TRANSFER_PENALTY = 5;
// Changing trains on the same line (branch/service change): no platform walk,
// but waiting for the connecting service. Conservative default — applied
// unless timetable data proves through-running.
const TRAIN_CHANGE_PENALTY = 3;

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

// Time model: derive travel time from real inter-station distances.
// Tehran Metro cruising speed (incl. acceleration/deceleration): ~35 km/h.
// Dwell time per station: ~25 s. Platform transfer walk: ~4 min.
const AVG_SPEED_KMH = 35;
const DWELL_S = 25;
const TRANSFER_S = 4 * 60;

function hopKm(fromId: string, toId: string): number {
  const a = getStation(fromId);
  const b = getStation(toId);
  if (!a || !b) return 1;
  const R = 6371;
  const dLat = ((b.location.lat - a.location.lat) * Math.PI) / 180;
  const dLng = ((b.location.lng - a.location.lng) * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos((a.location.lat * Math.PI) / 180) *
      Math.cos((b.location.lat * Math.PI) / 180) *
      sinDLng *
      sinDLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

type Hop = {
  from: string;
  to: string;
  line: number;
  route: string;
  branch?: string;
};

export type RouteSegment = {
  line: number;
  routeId: string;
  branchId?: string;
  stations: string[]; // ordered station ids, inclusive of board & alight
  terminal: string; // route terminal in the direction of travel
  changeFromPrevious: JourneyChange;
};

export type RouteResult = {
  hops: Hop[];
  segments: RouteSegment[];
  path: string[];
  numStops: number; // boardable passenger stops (pass-through UC stations excluded)
  numTransfers: number; // physical line changes only
  numTrainChanges: number; // same-line service/branch changes
  estimatedSeconds: number;
  travelTimeOnly: number; // travel + walk time, no wait
  estimatedArrival: string;
  trips: (TripResult | null)[]; // parallel to segments; null = distance fallback
};

type StateKey = string; // `${stationId}|${line}|${route}`

function key(station: string, line: number, route: string): StateKey {
  return `${station}|${line}|${route}`;
}

// Route-aware adjacency: for route r, the stations adjacent to s in r's
// ordered stops where the connecting segment is operational. Boarding status
// is NOT checked here — pass-through of non-boardable stations is allowed.
const SEGMENT_BY_ROUTE_PAIR = new Map<string, (typeof SEGMENTS)[number]>();
for (const s of SEGMENTS) {
  SEGMENT_BY_ROUTE_PAIR.set(`${s.routeId}|${s.from}|${s.to}`, s);
  SEGMENT_BY_ROUTE_PAIR.set(`${s.routeId}|${s.to}|${s.from}`, s);
}

function routeNeighbors(stationId: string, routeId: string): string[] {
  const stops = getRouteStations(routeId);
  const i = stops.indexOf(stationId);
  if (i === -1) return [];
  const out: string[] = [];
  for (const j of [i - 1, i + 1]) {
    if (j < 0 || j >= stops.length) continue;
    const seg = SEGMENT_BY_ROUTE_PAIR.get(`${routeId}|${stationId}|${stops[j]}`);
    if (seg && seg.status === "operational") out.push(stops[j]);
  }
  return out;
}

// Terminal from the ordered route being ridden: given the first two stations
// of a ride group, the terminal is the route end in the direction of travel.
// Deterministic — no adjacency walking.
function getRouteTerminalForDirection(
  routeId: string,
  firstId: string,
  secondId: string,
): string {
  const stops = getRouteStations(routeId);
  const a = stops.indexOf(firstId);
  const b = stops.indexOf(secondId);
  if (a === -1 || b === -1) return secondId;
  return b > a ? stops[stops.length - 1] : stops[0];
}

function minutesToClock(totalMinutes: number): string {
  const m = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

// Dijkstra over (station, line, route) states.
// - Riding along a route: no transfer, no train change.
// - Same line, different route: train_change (split segment, penalty, no walk).
// - Different line: line_transfer (penalty + walk), requires boardable stops.
// Pass-through of non-boardable stations is free; boarding / alighting /
// transferring requires canBoard/canTransfer.
export function findRoute(
  originInput: string,
  destInput: string,
): RouteResult | null {
  const originId = resolveStationId(originInput) ?? originInput;
  const destId = resolveStationId(destInput) ?? destInput;
  if (originId === destId) return null;
  if (!STATION_MAP.has(originId) || !STATION_MAP.has(destId)) return null;
  // Trips can only start/end where passengers board.
  if (!canBoardAtStation(originId) || !canBoardAtStation(destId)) return null;

  const dist = new Map<StateKey, number>();
  const prev = new Map<StateKey, { state: StateKey; hop: Hop | null } | null>();

  // Simple binary-heap-free priority via array; graph is small (~150 nodes).
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

  for (const r of getRoutesForStation(originId)) {
    if (!canBoardAtStation(originId, r.lineId)) continue;
    const k = key(originId, r.lineId, r.id);
    dist.set(k, 0);
    prev.set(k, null);
    push(0, k);
  }

  let best: { cost: number; state: StateKey } | null = null;

  while (pq.length) {
    const { cost, state } = pop();
    if (cost > (dist.get(state) ?? Infinity)) continue;
    const [stationId, lineStr, ...routeParts] = state.split("|");
    const routeId = routeParts.join("|");
    const curLine = Number(lineStr);

    if (stationId === destId) {
      // Only alight where the arriving service actually stops.
      if (!canBoardAtStation(stationId, curLine)) continue;
      if (!best || cost < best.cost) best = { cost, state };
      continue;
    }

    // 1) Ride along the current route (pass-through needs track only).
    const route = ROUTES.find((r) => r.id === routeId);
    for (const next of routeNeighbors(stationId, routeId)) {
      const nextCost = cost + RIDE_COST;
      const nk = key(next, curLine, routeId);
      if (nextCost < (dist.get(nk) ?? Infinity)) {
        dist.set(nk, nextCost);
        prev.set(nk, {
          state,
          hop: {
            from: stationId,
            to: next,
            line: curLine,
            route: routeId,
            ...(route?.branchId ? { branch: route.branchId } : {}),
          },
        });
        push(nextCost, nk);
      }
    }

    // 2) Change service at this station (requires boarding the new service).
    for (const r2 of getRoutesForStation(stationId)) {
      if (r2.id === routeId) continue;
      if (r2.lineId === curLine) {
        // Same line, different route: train change, not a line transfer.
        if (!canBoardAtStation(stationId, r2.lineId)) continue;
        const nextCost = cost + TRAIN_CHANGE_PENALTY;
        const nk = key(stationId, r2.lineId, r2.id);
        if (nextCost < (dist.get(nk) ?? Infinity)) {
          dist.set(nk, nextCost);
          prev.set(nk, { state, hop: null });
          push(nextCost, nk);
        }
      } else {
        // Different line: normal interchange.
        if (!canTransferAtStation(stationId, curLine, r2.lineId)) continue;
        const nextCost = cost + RIDE_COST + TRANSFER_PENALTY;
        const nk = key(stationId, r2.lineId, r2.id);
        if (nextCost < (dist.get(nk) ?? Infinity)) {
          dist.set(nk, nextCost);
          prev.set(nk, { state, hop: null });
          push(nextCost, nk);
        }
      }
    }
  }

  if (!best) return null;

  // Reconstruct hops (service-change steps carry no hop).
  const hops: Hop[] = [];
  let cur: StateKey | null = best.state;
  while (cur) {
    const entry = prev.get(cur);
    if (!entry) break;
    if (entry.hop) hops.unshift(entry.hop);
    cur = entry.state;
  }

  if (!hops.length) return null;

  // Build ordered path.
  const path: string[] = [hops[0].from];
  for (const h of hops) path.push(h.to);

  // Group hops into ride segments by route (not just line). A route change on
  // the same line is a train change; a line change is a normal transfer.
  const segments: RouteSegment[] = [];
  for (const h of hops) {
    const last = segments[segments.length - 1];
    if (last && last.routeId === h.route) {
      last.stations.push(h.to);
    } else {
      const route = ROUTES.find((r) => r.id === h.route);
      const terminal = getRouteTerminalForDirection(h.route, h.from, h.to);
      let changeFromPrevious: JourneyChange = { type: "none" };
      if (last) {
        const atStation = h.from;
        changeFromPrevious =
          last.line === h.line
            ? {
                type: "train_change",
                stationId: atStation,
                lineId: h.line,
                fromRouteId: last.routeId,
                toRouteId: h.route,
              }
            : {
                type: "line_transfer",
                stationId: atStation,
                fromLineId: last.line,
                toLineId: h.line,
              };
      }
      segments.push({
        line: h.line,
        routeId: h.route,
        ...(h.branch ? { branchId: h.branch } : {}),
        ...(route?.branchId ? { branchId: route.branchId } : {}),
        stations: [h.from, h.to],
        terminal,
        changeFromPrevious,
      });
    }
  }

  // Passenger stops: boardable stations excluding the origin. Non-boardable
  // pass-through stations (e.g. Vavan) are traversed but never counted.
  const numStops = path
    .slice(1)
    .filter((sid) => canBoardAtStation(sid)).length;
  const numTransfers = segments.filter(
    (s) => s.changeFromPrevious.type === "line_transfer",
  ).length;
  const numTrainChanges = segments.filter(
    (s) => s.changeFromPrevious.type === "train_change",
  ).length;

  // Time-aware travel calculation: find actual trains for each ride segment.
  // trips[] stays parallel to segments[]; null marks a distance-based
  // fallback. The unified ledger below keeps estimatedSeconds, travelTimeOnly
  // and estimatedArrival correct in both cases.
  const dayType = getCurrentDayType();
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const trips: (TripResult | null)[] = [];
  let currentTime = nowMinutes;
  let totalMinutes = 0;
  let travelOnlyMinutes = 0;
  let lastArrival = "";

  segments.forEach((seg, segIdx) => {
    const isLast = segIdx === segments.length - 1;
    const nextChange = !isLast
      ? segments[segIdx + 1].changeFromPrevious
      : { type: "none" as const };
    // Platform walk applies to line transfers only, not same-line changes.
    const walkMinutes = nextChange.type === "line_transfer" ? 4 : 0;

    const segOrigin = seg.stations[0];
    const segDest = seg.stations[seg.stations.length - 1];

    const trip = findBestTrip(segOrigin, segDest, seg.line, currentTime, dayType);
    if (trip) {
      trips.push(trip);
      const waitTime = Math.max(0, timeToMinutes(trip.departTime) - currentTime);
      totalMinutes += waitTime + trip.travelMinutes + walkMinutes;
      travelOnlyMinutes += trip.travelMinutes + walkMinutes;
      currentTime = timeToMinutes(trip.arriveTime) + walkMinutes;
      lastArrival = trip.arriveTime;
    } else {
      // Fallback: distance-based estimate still advances the ledger.
      let segSeconds = 0;
      for (let i = 0; i < seg.stations.length - 1; i++) {
        const km = hopKm(seg.stations[i], seg.stations[i + 1]);
        segSeconds += (km / AVG_SPEED_KMH) * 3600 + DWELL_S;
      }
      const segMinutes = Math.round(segSeconds / 60);
      trips.push(null);
      totalMinutes += segMinutes + walkMinutes;
      travelOnlyMinutes += segMinutes + walkMinutes;
      currentTime += segMinutes + walkMinutes;
      lastArrival = minutesToClock(currentTime - walkMinutes);
    }
  });

  const estimatedSeconds = totalMinutes * 60;

  return { hops, segments, path, numStops, numTransfers, numTrainChanges, estimatedSeconds, travelTimeOnly: travelOnlyMinutes, estimatedArrival: lastArrival, trips };
}

export { normalize } from "./metro/selectors";

export type LineOrder = {
  chains: string[][]; // one chain per route (most lines have 1)
  terminals: string[]; // far terminal station ID per chain
};

/**
 * Ordered station chains for a line, derived from routes.
 * Forked lines (1, 4) return one chain per route; the UI shows branch chips.
 */
export function orderLineStations(line: number): LineOrder {
  const routes = ROUTES.filter((r) => r.lineId === line);
  if (routes.length === 0) return { chains: [], terminals: [] };
  const chains = routes.map((r) => getRouteStations(r.id));
  const terminals = routes.map((r) => {
    const t = getRouteTerminals(r.id);
    return t[t.length - 1];
  });
  return { chains, terminals };
}

export function searchStations(
  query: string,
  limit = 30,
): MetroStation[] {
  return searchMetroStations(query, limit);
}

// Re-export for call sites that only need the type without importing metro/.
export type { MetroStation };
