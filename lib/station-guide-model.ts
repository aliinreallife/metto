// One model for the shared station page. City adapters supply only facts;
// route planners, URLs and the UI retain their existing public contracts.
import { CITY_LINES, type CityStation } from "./city-catalog";
import { CITY_NETWORKS } from "./city-previews";
import { getOperationalNeighbors, getOperationalStationLines, getRouteStations, getStationTerminalRoutes } from "./metro/selectors";
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
export type GuideModel = {
  lines: GuideLine[];
  neighbors: GuideNeighbor[];
  terminalLineIds: string[];
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
    return {
      lines, terminalLineIds,
      neighbors: neighbors.filter((n, i) =>
        neighbors.findIndex(other => other.id === n.id && other.lineId === n.lineId) === i),
    };
  }
  const preview = CITY_NETWORKS.find(entry => entry.cityId === station.cityId);
  if (!preview) return { lines, terminalLineIds: [], neighbors: [] };
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
  return { lines, terminalLineIds, neighbors };
}
