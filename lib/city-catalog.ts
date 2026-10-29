// Display catalog only. Tehran's existing route/timetable identity stays intact.
import { STATIONS } from "./metro/stations";
import { LINES, lineOnColor } from "./metro/lines";
import { buildMapEdges, getStationLines, getOperationalStationLines } from "./metro/selectors";
import { mashhadPreview } from "./mashhad-preview";
import rawStations from "../data/previews/mashhad/stations.json";
import { reportedMashhadAmenities } from "./mashhad-reported-amenities";
import type { StationAmenities } from "./metro/types";
import rawGraph from "../data/previews/mashhad/graph.json";
import type { CityId } from "./cities";
import { CITY_PREVIEWS } from "./city-previews";

export type CityStation = {
  id: string; localId: string; cityId: CityId;
  names: { fa: string; en: string }; location: { lat: number; lng: number };
  amenities: Partial<StationAmenities>; reportedAmenities?: Partial<StationAmenities>;
  lineIds: string[]; operationalLineIds: string[]; status: string;
};
export type CityEdge = { from: string; to: string; lineId: string; status: string; coordinates?: [number, number][] };
export const CITY_STATIONS: CityStation[] = [
  ...STATIONS.map(s => ({ id: `tehran:station:${s.id}`, localId: s.id, cityId: "tehran" as const,
    names: s.name, location: s.location, status: s.status, amenities: s.amenities,
    lineIds: getStationLines(s.id).map(id => `tehran:line:${id}`), operationalLineIds: getOperationalStationLines(s.id).map(id => `tehran:line:${id}`) })),
  ...mashhadPreview.stations.map(s => ({ ...s, localId: s.id, cityId: "mashhad" as const,
    amenities: rawStations.find(raw => raw.id === s.id)!.amenities,
    reportedAmenities: reportedMashhadAmenities(rawStations.find(raw => raw.id === s.id)!.sourceKeys.upstreamKey),
    lineIds: mashhadPreview.getStationLineIds(s.id), operationalLineIds: mashhadPreview.getStationLineIds(s.id) })),
  ...CITY_PREVIEWS.flatMap(preview => preview.network.stations.map(s => ({
    ...s, cityId: preview.cityId, localId: s.id, amenities: {},
    lineIds: preview.planner.getStationLineIds(s.id), operationalLineIds: [],
  }))),
];
export const CITY_LINES = [
  ...LINES.map(l => ({ id: `tehran:line:${l.id}`, cityId: "tehran" as const, color: l.color, onColor: lineOnColor(l.id) })),
  ...mashhadPreview.lines.map(l => ({ id: l.id, cityId: "mashhad" as const, color: l.color, onColor: "#18181b" })),
  ...CITY_PREVIEWS.flatMap(preview => preview.network.lines.map(l => ({ id: l.id, cityId: preview.cityId, color: l.color, onColor: l.onColor ?? "#ffffff" }))),
];
export const CITY_EDGES: CityEdge[] = [
  ...buildMapEdges().map(e => ({ from: `tehran:station:${e.a}`, to: `tehran:station:${e.b}`,
    lineId: `tehran:line:${e.line}`, status: e.status })),
  ...rawGraph.segments.filter(e => mashhadPreview.lines.some(l => l.id === e.lineId))
    .map(e => ({ from: e.from, to: e.to, lineId: e.lineId, status: e.status })),
  ...CITY_PREVIEWS.flatMap(preview => preview.geometry.map(edge => ({ ...edge, status: "review_unverified" }))),
];
export const stationByCityId = new Map(CITY_STATIONS.map(s => [s.id, s]));
export const normalizeCitySearch = (value: string) => value.toLowerCase().replace(/ك/g, "ک").replace(/ي/g, "ی").replace(/\u200c/g, " ").trim();
export function catalogStations(cities: readonly CityId[], city?: CityId | "all") {
  return CITY_STATIONS.filter(s => cities.includes(s.cityId) && (!city || city === "all" || s.cityId === city));
}
export function cityCounts(cities: readonly CityId[], city?: CityId | "all") {
  const selected = city && city !== "all" ? cities.filter(id => id === city) : cities;
  return { stations: catalogStations(selected).length, lines: CITY_LINES.filter(l => selected.includes(l.cityId)).length, cities: selected.length };
}
export function stationRouteHref(station: CityStation, role: "from" | "to", lang: string) {
  return `/${station.cityId}/route?${new URLSearchParams({ [role]: station.localId, lang })}`;
}
