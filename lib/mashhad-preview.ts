// Review-only candidate. No imports from the Tehran router or timetable.
import rawStations from "../data/previews/mashhad/stations.json";
import rawLines from "../data/previews/mashhad/lines.json";
import rawGraph from "../data/previews/mashhad/graph.json";
import manifest from "../data/previews/mashhad/manifest.json";
import { createCityPathPlanner } from "./city-route-path";

const visible = new Set(manifest.visibleLineIds);
const routes = rawGraph.routes.filter(r => visible.has(r.lineId));
const stationIds = new Set(routes.flatMap(r => r.stops.map(s => s.stationId)));
const routeIds = new Set(routes.map(r => r.id));

export const mashhadPreview = createCityPathPlanner({
  cityId: "mashhad",
  stations: rawStations.filter(s => stationIds.has(s.id)),
  lines: rawLines.filter(l => visible.has(l.id)),
  routes,
  segments: rawGraph.segments.filter(s => routeIds.has(s.routeId)),
  transferLinks: manifest.transferLinks,
});
