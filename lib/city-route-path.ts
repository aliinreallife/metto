// City-scoped path routing. No clock, timetable, speeds, durations or ETA
// fallback: this contract cannot return travel or arrival estimates.
export type PathStation = {
  id: string;
  cityId: string;
  names: { fa: string; en: string };
  location: { lat: number; lng: number };
  status: string;
};
export type PathLine = { id: string; names: { fa: string; en: string }; color: string; onColor?: string };
export type PathRoute = { id: string; lineId: string; stops: { stationId: string; status: string }[] };
export type PathSegment = { routeId: string; from: string; to: string; status: string };
export type PathTransfer = { stationId: string; fromLineId: string; toLineId: string };
export type PathNetwork = {
  cityId: string; stations: PathStation[]; lines: PathLine[]; routes: PathRoute[];
  segments: PathSegment[]; transferLinks: PathTransfer[];
};
export type CityRoutePath = {
  reviewOnly?: true;
  cityId: string;
  stationIds: string[];
  legs: { lineId: string; stationIds: string[] }[];
  transfers: PathTransfer[];
  stops: number;
};

const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

export function createCityPathPlanner(network: PathNetwork, options: { reviewOnly?: boolean } = {}) {
  // Review geometry must never become a passenger path by accident.
  const usable = (status: string) => status === "operational" ||
    (options.reviewOnly === true && status.startsWith("review_"));
  const { cityId } = network;
  const prefix = `${cityId}:station:`;
  const stations = new Map(network.stations.map(s => [s.id, s]));
  const lines = new Map(network.lines.map(l => [l.id, l]));
  const routeByLine = new Map<string, PathRoute>();
  const states = new Map<string, { stationId: string; lineId: string; boardable: boolean }>();
  const neighbors = new Map<string, { to: string; change: boolean }[]>();
  const stateKey = (stationId: string, lineId: string) => `${stationId}|${lineId}`;
  const add = (from: string, to: string, change: boolean) => {
    const entries = neighbors.get(from) ?? [];
    entries.push({ to, change }); neighbors.set(from, entries);
  };
  if (stations.size !== network.stations.length || network.stations.some(s => !s.id.startsWith(prefix) || s.cityId !== cityId)) {
    throw new Error("Invalid or mixed-city station inventory");
  }
  if (lines.size !== network.lines.length || network.lines.some(l => !l.id.startsWith(`${cityId}:line:`))) {
    throw new Error("Invalid or mixed-city line inventory");
  }
  // The initial Mashhad scope has one service pattern per line. Refuse to
  // silently treat future branches as through-running services.
  for (const route of network.routes) {
    if (!route.id.startsWith(`${cityId}:route:`) || !route.lineId.startsWith(`${cityId}:line:`) ||
        !lines.has(route.lineId) || routeByLine.has(route.lineId)) throw new Error("Unsupported route/line inventory");
    routeByLine.set(route.lineId, route);
    for (const stop of route.stops) {
      const station = stations.get(stop.stationId);
      if (!station) throw new Error("Route references a station outside its city");
      const key = stateKey(station.id, route.lineId);
      if (states.has(key)) throw new Error("Repeated route stop");
      states.set(key, { stationId: station.id, lineId: route.lineId,
        boardable: usable(station.status) && usable(stop.status) });
    }
    for (let i = 1; i < route.stops.length; i++) {
      const a = route.stops[i - 1].stationId, b = route.stops[i].stationId;
      const tracks = network.segments.filter(s => s.routeId === route.id &&
        ((s.from === a && s.to === b) || (s.from === b && s.to === a)));
      if (tracks.length !== 1) throw new Error("Missing or duplicate track segment");
      if (!usable(tracks[0].status)) continue;
      add(stateKey(a, route.lineId), stateKey(b, route.lineId), false);
      add(stateKey(b, route.lineId), stateKey(a, route.lineId), false);
    }
  }
  for (const t of network.transferLinks) {
    const from = stateKey(t.stationId, t.fromLineId), to = stateKey(t.stationId, t.toLineId);
    if (t.fromLineId === t.toLineId || !states.has(from) || !states.has(to)) throw new Error("Invalid transfer link");
    if (states.get(from)!.boardable && states.get(to)!.boardable) add(from, to, true);
  }
  for (const list of neighbors.values()) list.sort((a, b) => compare(a.to, b.to));
  const catalog = network.stations.filter(s => [...states.values()].some(state => state.stationId === s.id && state.boardable));
  const catalogIds = new Set(catalog.map(s => s.id));

  function findPath(fromId: string, toId: string): CityRoutePath | null {
    if (fromId === toId || !catalogIds.has(fromId) || !catalogIds.has(toId)) return null;
    type Item = { key: string; changes: number; hops: number };
    const queue: Item[] = [];
    const cost = new Map<string, Item>();
    const previous = new Map<string, string | null>();
    for (const [key, state] of states) {
      if (state.stationId === fromId && state.boardable) {
        const item = { key, changes: 0, hops: 0 }; queue.push(item); cost.set(key, item); previous.set(key, null);
      }
    }
    let end: string | null = null;
    while (queue.length) {
      queue.sort((a, b) => a.changes - b.changes || a.hops - b.hops || compare(a.key, b.key));
      const item = queue.shift()!;
      if (cost.get(item.key) !== item) continue;
      const state = states.get(item.key)!;
      if (state.stationId === toId && state.boardable) { end = item.key; break; }
      for (const edge of neighbors.get(item.key) ?? []) {
        const next = { key: edge.to, changes: item.changes + Number(edge.change), hops: item.hops + Number(!edge.change) };
        const old = cost.get(edge.to);
        if (old && (old.changes < next.changes || (old.changes === next.changes && old.hops <= next.hops))) continue;
        cost.set(edge.to, next); previous.set(edge.to, item.key); queue.push(next);
      }
    }
    if (!end) return null;
    const trace: string[] = [];
    for (let key: string | null = end; key !== null; key = previous.get(key) ?? null) trace.push(key);
    trace.reverse();
    const first = states.get(trace[0])!;
    const result: CityRoutePath = { ...(options.reviewOnly ? { reviewOnly: true as const } : {}), cityId, stationIds: [fromId], legs: [{ lineId: first.lineId, stationIds: [fromId] }], transfers: [], stops: 0 };
    for (let i = 1; i < trace.length; i++) {
      const before = states.get(trace[i - 1])!, after = states.get(trace[i])!;
      if (before.lineId !== after.lineId) {
        result.transfers.push({ stationId: after.stationId, fromLineId: before.lineId, toLineId: after.lineId });
        result.legs.push({ lineId: after.lineId, stationIds: [after.stationId] });
      } else {
        result.stationIds.push(after.stationId);
        result.legs.at(-1)!.stationIds.push(after.stationId);
        if (after.boardable) result.stops++;
      }
    }
    return result;
  }
  return { cityId, stations: catalog, lines: network.lines, findPath,
    getLineStationIds: (lineId: string) => routeByLine.get(lineId)?.stops.map(s => s.stationId) ?? [],
    getTerminal: (lineId: string, fromId: string, toId: string): string | undefined => {
      const stops = routeByLine.get(lineId)?.stops.map(s => s.stationId);
      if (!stops || !stops.includes(fromId) || !stops.includes(toId) || fromId === toId) return undefined;
      return stops.indexOf(fromId) < stops.indexOf(toId) ? stops.at(-1) : stops[0];
    },
    getStationLineIds: (id: string) => [...states.values()]
      .filter(state => state.stationId === id && state.boardable)
      .map(state => state.lineId).sort(compare),
  };
}
