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
import {
  DEFAULT_TRANSFER_WALK_SECONDS,
  TRAIN_CHANGE_WALK_SECONDS,
  getTransferWalkSeconds,
  hasExplicitTransferRule,
} from "./metro/transfers";
import { ROUTES } from "./metro/routes";
import {
  findTripDetailed,
  type DayType,
  type TripLookupResult,
  type TripResult,
} from "./schedule-utils";
import {
  formatTehranClock,
  parseServiceTimeToMinutes,
  tehranMinuteToInstant,
  tehranParts,
} from "./tehran-time";
import {
  getMetroScheduleDayType,
  scheduleDayToDayType,
} from "./holidays/schedule-day";
import type { IsHolidayDate } from "./holidays/types";

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
// Changing trains on the same line (branch/service change): platform walk is
// tracked separately (TRAIN_CHANGE_WALK_SECONDS, currently 0) and the Dijkstra
// penalty below is conservative — applied unless timetable data proves
// through-running.
const TRAIN_CHANGE_PENALTY = 3;

// Time model: derive travel time from real inter-station distances.
// Tehran Metro cruising speed (incl. acceleration/deceleration): ~35 km/h.
// Dwell time per station: ~25 s. Default platform transfer walk lives in
// metro/transfers (DEFAULT_TRANSFER_WALK_SECONDS).
const AVG_SPEED_KMH = 35;
const DWELL_S = 25;

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
  estimatedSeconds: number; // == totalSeconds (accumulated served time)
  travelTimeOnly: number; // legacy minutes: riding + transfer walking, no waits
  /** Final propagated ETA (Tehran "HH:MM"), or null when service runs out. */
  estimatedArrival: string | null;
  /**
   * Journey-level timetable status: "complete" when fully propagated to the
   * destination, "no_service" when timetable data exists but no usable
   * connecting/onward service remains (estimatedArrival is null then).
   */
  status: JourneyStatus;
  trips: (TripResult | null)[]; // parallel to segments; null = estimated/unserved
  /** Per-segment timing source, parallel to segments. */
  legTiming: LegTiming[];
  /** Per-change connection detail; route.ts is the source of truth. */
  connections: RouteConnection[];
  // Unit-safe breakdown, all in seconds: totalSeconds == sum of the parts.
  initialWaitSeconds: number;
  rideSeconds: number;
  transferWalkSeconds: number;
  transferWaitSeconds: number;
  trainChangeWaitSeconds: number;
  totalSeconds: number;
  /** Requested departure instant rendered as Tehran "HH:MM". */
  departedAt: string;
  departedAtMs: number;
  /** Last station with propagated timing (destination when fully served). */
  reachableUntilStationId: string;
  reachableUntil: string;
};

/** How one ride leg's timing was derived. */
export type LegTiming = "timetable" | "estimated" | "no-service" | "unreached";

/** Journey-level timetable status. */
export type JourneyStatus = "complete" | "no_service";

export type ConnectionStatus = "ok" | "estimated" | "no-service";

/**
 * Chronological connection record for one transfer/train-change.
 * Walking is applied BEFORE the connecting departure is searched, so
 * nextDepartureAt always satisfies nextDepartureAt >= readyAt.
 */
export type RouteConnection = {
  type: "line_transfer" | "train_change";
  stationId: string;
  fromLineId: number;
  toLineId: number;
  fromRouteId: string;
  toRouteId: string;
  walkSeconds: number;
  /** True when a station-specific rule (not the default) set the walk. */
  hasExplicitRule: boolean;
  arriveAt: string; // Tehran "HH:MM" of the incoming train arrival
  arriveAtMs: number;
  readyAt: string; // arriveAt + walkSeconds
  readyAtMs: number;
  nextDepartureAt: string | null;
  nextDepartureAtMs: number | null;
  waitSeconds: number; // nextDepartureAt - readyAt (0 when estimated/unserved)
  status: ConnectionStatus;
};

export type TripLookupArgs = {
  fromId: string;
  toId: string;
  line: number;
  /** Tehran minute-of-day of the propagated ready/board instant. */
  afterMinutes: number;
  dayType: DayType;
  fromRouteId: string;
  toRouteId: string;
};

export type FindRouteOptions = {
  /** Requested departure; defaults to now. Propagated as absolute time. */
  departAt?: Date;
  /** Injectable timetable lookup (tests). Defaults to findTripDetailed. */
  tripLookup?: (args: TripLookupArgs) => TripLookupResult;
  /**
   * Sync holiday resolver over already-loaded cache entries.
   * The caller pre-loads today + next Tehran date ONCE; the ETA loop
   * re-evaluates the Tehran date per leg against this local function.
   * No storage/network calls happen inside routing.
   */
  isHolidayDate?: IsHolidayDate;
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

// Dijkstra over (station, line, route) states.
// - Riding along a route: no transfer, no train change.
// - Same line, different route: train_change (split segment, penalty, no walk).
// - Different line: line_transfer (walk-scaled penalty + walk), requires
//   boardable stops.
// Pass-through of non-boardable stations is free; boarding / alighting /
// transferring requires canBoard/canTransfer.
export function findRoute(
  originInput: string,
  destInput: string,
  opts?: FindRouteOptions,
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
        // Different line: normal interchange. Long station-specific walks
        // (e.g. Eram-e Sabz) rank worse via walk-scaled penalty.
        if (!canTransferAtStation(stationId, curLine, r2.lineId)) continue;
        const walkS = getTransferWalkSeconds(
          stationId,
          curLine,
          r2.lineId,
          routeId,
          r2.id,
        );
        const nextCost =
          cost +
          RIDE_COST +
          TRANSFER_PENALTY * (walkS / DEFAULT_TRANSFER_WALK_SECONDS);
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
                walkSeconds: getTransferWalkSeconds(
                  atStation,
                  last.line,
                  h.line,
                  last.routeId,
                  h.route,
                ),
                fromRouteId: last.routeId,
                toRouteId: h.route,
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

  // Chronological ETA engine: one absolute currentInstant (epoch ms) is
  // propagated through every leg. Walking is applied BEFORE the connecting
  // departure is searched, so a train departing before the passenger finishes
  // walking is always treated as missed. All breakdown fields are integer
  // seconds; instants are never derived by adding seconds to wall minutes.
  const departAt = opts?.departAt ?? new Date();
  const startInstantMs = departAt.getTime();
  let currentInstantMs = startInstantMs;
  const trips: (TripResult | null)[] = [];
  const legTiming: LegTiming[] = [];
  const connections: RouteConnection[] = [];
  let initialWaitSeconds = 0;
  let rideSeconds = 0;
  let transferWalkSeconds = 0;
  let transferWaitSeconds = 0;
  let trainChangeWaitSeconds = 0;
  let unserved = false;

  const tripLookup =
    opts?.tripLookup ??
    ((args: TripLookupArgs): TripLookupResult =>
      findTripDetailed(
        args.fromId,
        args.toId,
        args.line,
        args.afterMinutes,
        args.dayType,
      ));

  // Pending connection opened after leg k arrives; finalized once leg k+1's
  // lookup resolves (its departure/wait) or fails (no-service).
  let pending: {
    type: "line_transfer" | "train_change";
    stationId: string;
    fromLineId: number;
    toLineId: number;
    fromRouteId: string;
    toRouteId: string;
    walkSeconds: number;
    hasExplicitRule: boolean;
    arriveAtMs: number;
    readyAtMs: number;
    prevEstimated: boolean;
  } | null = null;

  const finalizePending = (final: {
    nextDepartureAtMs: number | null;
    waitSeconds: number;
    status: ConnectionStatus;
  }): void => {
    if (!pending) return;
    connections.push({
      type: pending.type,
      stationId: pending.stationId,
      fromLineId: pending.fromLineId,
      toLineId: pending.toLineId,
      fromRouteId: pending.fromRouteId,
      toRouteId: pending.toRouteId,
      walkSeconds: pending.walkSeconds,
      hasExplicitRule: pending.hasExplicitRule,
      arriveAt: formatTehranClock(pending.arriveAtMs),
      arriveAtMs: pending.arriveAtMs,
      readyAt: formatTehranClock(pending.readyAtMs),
      readyAtMs: pending.readyAtMs,
      nextDepartureAt:
        final.nextDepartureAtMs === null
          ? null
          : formatTehranClock(final.nextDepartureAtMs),
      nextDepartureAtMs: final.nextDepartureAtMs,
      waitSeconds: final.waitSeconds,
      status: final.status,
    });
    pending = null;
  };

  for (let segIdx = 0; segIdx < segments.length; segIdx++) {
    const seg = segments[segIdx];
    const segOrigin = seg.stations[0];
    const segDest = seg.stations[seg.stations.length - 1];
    // Tehran wall clock + day type re-derived from the propagated instant,
    // so midnight crossings re-evaluate the timetable day. Holiday lookup
    // uses the pre-loaded sync resolver (local map, no I/O here).
    const parts = tehranParts(currentInstantMs);
    const holidayDayType = scheduleDayToDayType(
      getMetroScheduleDayType(currentInstantMs, opts?.isHolidayDate),
    );
    const lookup = tripLookup({
      fromId: segOrigin,
      toId: segDest,
      line: seg.line,
      afterMinutes: parts.minuteOfDay,
      dayType: holidayDayType,
      fromRouteId: seg.routeId,
      toRouteId: seg.routeId,
    });

    if (lookup.status === "found") {
      const depMin = parseServiceTimeToMinutes(lookup.trip.departTime);
      let arrMin = parseServiceTimeToMinutes(lookup.trip.arriveTime);
      // A trip itself may cross midnight.
      if (arrMin < depMin) arrMin += 24 * 60;
      const departMs = tehranMinuteToInstant(parts.dateStr, depMin);
      const arriveMs = tehranMinuteToInstant(parts.dateStr, arrMin);
      const waitS = Math.max(
        0,
        Math.round((departMs - currentInstantMs) / 1000),
      );
      const change = seg.changeFromPrevious;
      if (segIdx === 0 || change.type === "none") {
        initialWaitSeconds += waitS;
      } else if (change.type === "line_transfer") {
        transferWaitSeconds += waitS;
      } else {
        trainChangeWaitSeconds += waitS;
      }
      rideSeconds += Math.max(0, Math.round((arriveMs - departMs) / 1000));
      trips.push(lookup.trip);
      legTiming.push("timetable");
      finalizePending({
        nextDepartureAtMs: departMs,
        waitSeconds: waitS,
        status: pending?.prevEstimated ? "estimated" : "ok",
      });
      currentInstantMs = arriveMs;
    } else if (lookup.status === "missing_schedule_data") {
      // Fallback estimate advances the SAME ledger so later timetable legs
      // search from this leg's calculated arrival. Allowed only when schedule
      // data is missing — never when the timetable reports no service.
      let segSeconds = 0;
      for (let i = 0; i < seg.stations.length - 1; i++) {
        const km = hopKm(seg.stations[i], seg.stations[i + 1]);
        segSeconds += (km / AVG_SPEED_KMH) * 3600 + DWELL_S;
      }
      segSeconds = Math.round(segSeconds);
      rideSeconds += segSeconds;
      trips.push(null);
      legTiming.push("estimated");
      finalizePending({
        nextDepartureAtMs: null,
        waitSeconds: 0,
        status: "estimated",
      });
      currentInstantMs += segSeconds * 1000;
    } else {
      // Timetable covers this lookup but offers no departure: stop
      // propagation. No fallback train is invented; ETA stays null.
      trips.push(null);
      legTiming.push("no-service");
      for (let k = segIdx + 1; k < segments.length; k++) {
        trips.push(null);
        legTiming.push("unreached");
      }
      finalizePending({
        nextDepartureAtMs: null,
        waitSeconds: 0,
        status: "no-service",
      });
      unserved = true;
      break;
    }

    // Open the connection to the next segment: walk first, then the next
    // iteration searches from the ready instant.
    if (!unserved && segIdx < segments.length - 1) {
      const nextChange = segments[segIdx + 1].changeFromPrevious;
      if (
        nextChange.type === "line_transfer" ||
        nextChange.type === "train_change"
      ) {
        const walkS =
          nextChange.type === "line_transfer"
            ? nextChange.walkSeconds
            : TRAIN_CHANGE_WALK_SECONDS;
        if (nextChange.type === "line_transfer") {
          transferWalkSeconds += walkS;
          pending = {
            type: "line_transfer",
            stationId: nextChange.stationId,
            fromLineId: nextChange.fromLineId,
            toLineId: nextChange.toLineId,
            fromRouteId: nextChange.fromRouteId ?? segments[segIdx].routeId,
            toRouteId: nextChange.toRouteId ?? segments[segIdx + 1].routeId,
            walkSeconds: walkS,
            hasExplicitRule: hasExplicitTransferRule(
              nextChange.stationId,
              nextChange.fromLineId,
              nextChange.toLineId,
              nextChange.fromRouteId,
              nextChange.toRouteId,
            ),
            arriveAtMs: currentInstantMs,
            readyAtMs: currentInstantMs + walkS * 1000,
            prevEstimated: legTiming[segIdx] === "estimated",
          };
        } else {
          pending = {
            type: "train_change",
            stationId: nextChange.stationId,
            fromLineId: nextChange.lineId,
            toLineId: nextChange.lineId,
            fromRouteId: nextChange.fromRouteId,
            toRouteId: nextChange.toRouteId,
            walkSeconds: walkS,
            hasExplicitRule: false,
            arriveAtMs: currentInstantMs,
            readyAtMs: currentInstantMs + walkS * 1000,
            prevEstimated: legTiming[segIdx] === "estimated",
          };
        }
        currentInstantMs = pending.readyAtMs;
      }
    }
  }

  const totalSeconds =
    initialWaitSeconds +
    rideSeconds +
    transferWalkSeconds +
    transferWaitSeconds +
    trainChangeWaitSeconds;

  let estimatedArrival: string | null;
  let reachableUntilStationId: string;
  let reachableUntil: string;
  let status: JourneyStatus;
  if (unserved) {
    status = "no_service";
    estimatedArrival = null;
    const failedIdx = legTiming.findIndex(
      (t) => t === "no-service" || t === "unreached",
    );
    reachableUntilStationId =
      failedIdx > 0
        ? segments[failedIdx - 1].stations[
            segments[failedIdx - 1].stations.length - 1
          ]
        : originId;
    reachableUntil = formatTehranClock(currentInstantMs);
  } else {
    status = "complete";
    estimatedArrival = formatTehranClock(currentInstantMs);
    reachableUntilStationId = destId;
    reachableUntil = estimatedArrival;
  }

  return {
    hops,
    segments,
    path,
    numStops,
    numTransfers,
    numTrainChanges,
    estimatedSeconds: totalSeconds,
    travelTimeOnly: Math.round((rideSeconds + transferWalkSeconds) / 60),
    estimatedArrival,
    status,
    trips,
    legTiming,
    connections,
    initialWaitSeconds,
    rideSeconds,
    transferWalkSeconds,
    transferWaitSeconds,
    trainChangeWaitSeconds,
    totalSeconds,
    departedAt: formatTehranClock(startInstantMs),
    departedAtMs: startInstantMs,
    reachableUntilStationId,
    reachableUntil,
  };
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
