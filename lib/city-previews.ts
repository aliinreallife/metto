import { STRINGS } from "./i18n";
import data from "@/data/reference/isfahan-candidate-preview.json";
import { createCityPathPlanner, type PathNetwork } from "./city-route-path";
import { mashhadPreview } from "./mashhad-preview";
import { getCityMeta, type CityId } from "./cities";
import service from "@/data/reference/isfahan-service.json";

/** New cities supply data here; the existing app owns their screens. */
export type CityPreviewDefinition = {
  cityId: CityId;
  sourceUrl: string;
  notice: { fa: string; en: string };
  network: PathNetwork;
  geometry: { from: string; to: string; lineId: string; coordinates: [number, number][] }[];
};
const lineId = "isfahan:line:1";
const routeId = "isfahan:route:1-core";
const definitions: CityPreviewDefinition[] = [{
  cityId: "isfahan",
  sourceUrl: "https://github.com/aliinreallife/metto-data/pull/37",
  notice: {
    en: STRINGS.en.isfahanPreviewNotice,
    fa: STRINGS.fa.isfahanPreviewNotice,
  },
  network: {
    cityId: "isfahan",
    stations: data.stations.map(s => ({ id: s.id, cityId: "isfahan", names: s.names,
      location: s.representativePoint, status: service.release.productionAuthorized ? "operational" : s.boardingReview === "conflicting-reports" ? "review_disputed" : "review_unverified" })),
    lines: [{ id: lineId, names: { fa: "خط ۱", en: "Line 1" }, color: "#cc0e2d", onColor: "#ffffff" }],
    routes: [{ id: routeId, lineId, stops: data.stations.map(s => ({ stationId: s.id, status: service.release.productionAuthorized ? "operational" : "review_unverified" })) }],
    segments: data.tracks.map(t => ({ routeId, from: t.fromStationId, to: t.toStationId, status: service.release.productionAuthorized ? "operational" : "review_unverified" })),
    transferLinks: [],
  },
  geometry: data.tracks.map(t => ({ from: t.fromStationId, to: t.toStationId, lineId,
    coordinates: t.geometry.map(p => [p.lat, p.lng] as [number, number]) })),
}];
export const CITY_NETWORKS = definitions.map(definition => ({
  ...definition, planner: createCityPathPlanner(definition.network, { reviewOnly: getCityMeta(definition.cityId)?.release === "preview" }),
}));
export const CITY_PREVIEWS = CITY_NETWORKS.filter(c => getCityMeta(c.cityId)?.release === "preview");
export function getCityPreview(city: CityId | "all") {
  return CITY_PREVIEWS.find(preview => preview.cityId === city);
}
export function getUntimedCityPlanner(city: CityId) {
  return city === "mashhad" ? mashhadPreview : CITY_NETWORKS.find(c => c.cityId === city)?.planner;
}
