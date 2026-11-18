// One model for the shared station page. City adapters supply only facts;
// route planners, URLs and the UI retain their existing public contracts.
import { CITY_LINES, type CityStation } from "./city-catalog";
import { CITY_NETWORKS } from "./city-previews";
import { getOperationalNeighbors, getOperationalStationLines, getRouteStations, getStationTerminalRoutes, getRoutesForStation, getStation } from "./metro/selectors";
import { getTehranStationDirectionsSync } from "./station-seo-timetable";
import { regionalServicePatterns, regionalStationDepartures } from "./regional-station-schedules";
import { getSeoCityStation } from "./station-seo";

export type GuideLine = {
  id: string;
  number: string;
  color: string;
  onColor: string;
};
export type GuideNeighbor = {
  id: string;
  name: { fa: string; en: string };
  lineId: string;
  side: "before" | "after";
};
export type GuideDirection = {
  lineId: string;
  destinationId: string;
  name: { fa: string; en: string };
  side: "before" | "after";
};
export type GuideModel = {
  lines: GuideLine[];
  neighbors: GuideNeighbor[];
  terminalLineIds: string[];
  /** Actual published train destinations departing this station, not every
   * physical or planned end of track. Service days vary by timetable. */
  directions: GuideDirection[];
};

export function buildStationGuideModel(station: CityStation): GuideModel {
  const lines: GuideLine[] = station.operationalLineIds.flatMap(id => {
    const line = CITY_LINES.find(line => line.cityId === station.cityId && line.id === id);
    return line ? [{
      id, number: id.split(":").at(-1)!, color: line.color, onColor: line.onColor,
    }] : [];
  });
  if (station.cityId === "tehran") {
    const terminalRoutes = new Set(getStationTerminalRoutes(station.localId));
    const terminalLineIds = [...new Set(
      getOperationalStationLines(station.localId)
        .filter(line => getOperationalNeighbors(station.localId).some(edge =>
          edge.lineId === line && terminalRoutes.has(edge.routeId)))
        .map(line => `tehran:line:${line}`),
    )];
    const neighbors: GuideNeighbor[] = getOperationalNeighbors(station.localId)
      .flatMap(edge => {
        const neighbor = getSeoCityStation("tehran", edge.stationId);
        if (!neighbor) return [];
        const route = getRouteStations(edge.routeId);
        const a = route.indexOf(station.localId), b = route.indexOf(edge.stationId);
        if (a < 0 || b < 0) return [];
        return [{
          id: neighbor.localId, name: neighbor.names,
          lineId: `tehran:line:${edge.lineId}`,
          side: b < a ? "before" as const : "after" as const,
        }];
      });
    // Match the train's NEXT stop to the displayed track's before/after
    // direction. Its final destination alone cannot tell us which side
    // of a branch or interchange to place the label on.
    const destinations = new Map<string, GuideDirection | null>();
    for (const { line, destinationId, nextStopId } of getTehranStationDirectionsSync(station.localId)) {
      const lineId = `tehran:line:${line}`;
      const destination = getStation(destinationId);
      if (!station.operationalLineIds.includes(lineId) || !destination) continue;

      const exactSides = [...new Set(neighbors.filter(n =>
        n.lineId === lineId && n.id === nextStopId).map(n => n.side))];
      // Express services can skip the adjacent station. Use only routes
      // which contain both stops and agree on the direction of travel.
      const routeSides = exactSides.length ? exactSides : [...new Set(
        getRoutesForStation(station.localId)
          .filter(route => route.lineId === line)
          .flatMap(route => {
            const stops = getRouteStations(route.id);
            const here = stops.indexOf(station.localId);
            const next = stops.indexOf(nextStopId);
            if (here < 0 || next < 0 || here === next) return [];
            return [next < here ? "before" as const : "after" as const];
          }),
      )];
      // Better to show no arrow than put one on the wrong side.
      if (routeSides.length !== 1) continue;
      const side = routeSides[0];
      const key = `${lineId}:${destinationId}`;
      const existing = destinations.get(key);
      if (existing === null || (existing && existing.side !== side)) {
        destinations.set(key, null);
      } else {
        destinations.set(key, { lineId, destinationId, name: destination.name, side });
      }
    }
    const directions: GuideDirection[] = [...destinations.values()]
      .filter((item): item is GuideDirection => item !== null);
    return {
      lines, terminalLineIds, directions,
      neighbors: neighbors.filter((n, i) =>
        neighbors.findIndex(other => other.id === n.id && other.lineId === n.lineId) === i),
    };
  }
  const preview = CITY_NETWORKS.find(entry => entry.cityId === station.cityId);
  if (!preview) return { lines, terminalLineIds: [], neighbors: [], directions: [] };
  const terminalLineIds: string[] = [], neighbors: GuideNeighbor[] = [];
  for (const line of lines) {
    const route = preview.network.routes.find(route => route.lineId === line.id);
    if (!route) continue;
    const ordered = route.stops.map(stop => stop.stationId);
    const index = ordered.indexOf(station.id);
    if (index < 0) continue;
    if (index === 0 || index === ordered.length - 1) terminalLineIds.push(line.id);
    for (const step of [-1, 1] as const) {
      const adjacentId = ordered[index + step];
      if (!adjacentId) continue;
      // Never imply an unreviewed/disconnected track is in passenger service.
      const connected = preview.network.segments.some(segment =>
        segment.routeId === route.id && segment.status === "operational" &&
        ((segment.from === station.id && segment.to === adjacentId) ||
          (segment.to === station.id && segment.from === adjacentId)));
      if (!connected) continue;
      const neighbor = getSeoCityStation(station.cityId, adjacentId.split(":station:")[1]);
      if (!neighbor) continue;
      neighbors.push({
        id: neighbor.localId, name: neighbor.names,
        lineId: line.id, side: step < 0 ? "before" : "after",
      });
    }
  }
  const directions: GuideDirection[] = station.cityId === "isfahan" || station.cityId === "tabriz"
    ? [...new Map(regionalServicePatterns(station.cityId)
        .flatMap(pattern => regionalStationDepartures(station.cityId as "isfahan" | "tabriz", station.id, pattern.id))
        .filter(departure => station.operationalLineIds.includes(departure.lineId))
        .flatMap(departure => {
          const destination = getSeoCityStation(station.cityId, departure.directionId.split(":station:")[1]);
          const route = preview.network.routes.find(r => r.lineId === departure.lineId);
          const stops = route?.stops.map(stop => stop.stationId) ?? [];
          const here = stops.indexOf(station.id);
          const end = stops.indexOf(departure.directionId);
          if (!destination || here < 0 || end < 0 || here === end) return [];
          const side = end < here ? "before" as const : "after" as const;
          // Do not point toward a route whose adjacent track is not operational.
          if (!neighbors.some(n => n.lineId === departure.lineId && n.side === side)) return [];
          return [[`${departure.lineId}:${destination.id}`, {
            lineId: departure.lineId, destinationId: destination.localId,
            name: destination.names, side,
          } satisfies GuideDirection] as const];
        }),
      ).values()]
    : [];
  return { lines, terminalLineIds, neighbors, directions };
}
