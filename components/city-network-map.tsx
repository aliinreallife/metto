"use client";
import { useMemo, type ComponentProps } from "react";
import { CITY_LINES, type CityEdge, type CityStation } from "@/lib/city-catalog";
import { CITIES } from "@/lib/cities";
import type { Lang } from "@/lib/i18n";
import { RealMap, type MapNetwork, type MapRoute } from "./real-map";
import construction from "@/data/reference/mashhad-construction.json";

const EMPTY_PATH: string[] = [];

// Only adapts city identity and source data. Rendering, labels, basemaps,
// zoom, GPS, attribution and offline recovery are Tehran's RealMap.
export function CityNetworkMap({ stations, edges, lang, selectedId, pathIds = EMPTY_PATH, onSelect, showCity, mapMode, onClearRoute, originId, destId, showClearRoute, ...mapFeatures }: {
  stations: CityStation[]; edges: CityEdge[]; lang: Lang; selectedId?: string;
  pathIds?: string[]; onSelect: (id: string | null) => void; showCity: boolean;
  mapMode: "satellite" | "minimalist"; onClearRoute?: () => void;
} & Partial<Pick<ComponentProps<typeof RealMap>, "originId" | "destId" | "onPickPoint" | "pendingPick" | "placeMarkers" | "walkingPaths" | "directWalk" | "showClearRoute">>) {
  const network = useMemo<MapNetwork>(() => {
    const display = stations.map(s => ({ id: s.id, location: s.location, status: s.status,
      name: showCity ? { fa: `${s.names.fa} · ${CITIES.find(c => c.slug === s.cityId)!.name.fa}`,
        en: `${s.names.en} · ${CITIES.find(c => c.slug === s.cityId)!.name.en}` } : s.names }));
    const byId = new Map(stations.map(s => [s.id, s]));
    const tracks = edges.filter(e => byId.get(e.from)?.cityId === byId.get(e.to)?.cityId && byId.has(e.from) && byId.has(e.to));
    return { stations: display, stationMap: new Map(display.map(s => [s.id, s])),
      construction: stations.some(station => station.cityId === "mashhad") ? construction.segments.map(section => ({
        id: section.id, color: section.displayColor, coordinates: section.coordinates.map(([lat, lng]) => [lat, lng] as [number, number]),
      })) : [],
      edges: tracks.map(e => ({ a: e.from, b: e.to, line: e.lineId, status: e.status })),
      colors: Object.fromEntries(CITY_LINES.map(l => [l.id, l.color])),
      stationLines: id => byId.get(id)?.lineIds ?? [],
      isInterchange: id => (byId.get(id)?.operationalLineIds.length ?? 0) > 1,
      isTerminal: id => (byId.get(id)?.lineIds ?? []).some(line => tracks.filter(e => e.lineId === line && (e.from === id || e.to === id)).length === 1) };
  }, [stations, edges, showCity]);
  const route = useMemo<MapRoute | null>(() => pathIds.length ? { path: pathIds,
    hops: pathIds.slice(1).flatMap((to, i) => {
      const from = pathIds[i]; const edge = edges.find(e => (e.from === from && e.to === to) || (e.to === from && e.from === to));
      return edge ? [{ from, to, line: edge.lineId }] : [];
    }) } : null, [pathIds, edges]);
  return <div className="size-full" data-testid="city-network-map" data-station-count={stations.length} data-route-station-count={pathIds.length} data-construction-section-count={network.construction?.length ?? 0}>
    <RealMap {...mapFeatures} network={network} route={route} originId={originId ?? pathIds[0] ?? null} destId={destId ?? pathIds.at(-1) ?? null}
      lang={lang} mapMode={mapMode} selectedId={selectedId ?? null} onSelect={onSelect} onClearRoute={onClearRoute} showClearRoute={showClearRoute ?? pathIds.length > 0} />
  </div>;
}
