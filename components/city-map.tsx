"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Layers, Satellite, WifiOff } from "lucide-react";
import { useMetro } from "@/app/providers";
import { CITIES, type CityId } from "@/lib/cities";
import { CITY_EDGES, CITY_LINES, catalogStations, type CityStation } from "@/lib/city-catalog";
import { mashhadPreview } from "@/lib/mashhad-preview";
import { computeRouteTopology } from "@/lib/route";
import { displayPlaceLabel, reverseGeocode } from "@/lib/geocoding";
import { encodePlacePin, parsePlaceParam, haversineKm, estimateWalkMinutes, formatDistance, formatWalkTime, isLongWalk } from "@/lib/geo";
import { useTripWalking } from "@/lib/walking/use-walking-route";
import { useConnectivity } from "@/lib/offline/use-connectivity";
import { STRINGS } from "@/lib/i18n";
import { lineOnColor } from "@/lib/metro/lines";
import { cn } from "@/lib/utils";
import { MapPickCard } from "./map-pick-card";
import { StationDetailView } from "./station-detail";
import { WalkingRouteInfo } from "./walking-route-info";

const NetworkMap = dynamic(() => import("./city-network-map").then(m => m.CityNetworkMap), { ssr: false });
const EMPTY_PATH: string[] = [];
type Point = { lat: number; lng: number };
const endpointKeys = ["from", "to", "op", "dp", "station", "oPlat", "oPlng", "oPlabel", "dPlat", "dPlng", "dPlabel"];

export function CityMap({ city }: { city: CityId | "all" }) {
  const { lang, cityIds, mapMode, setMapMode } = useMetro();
  const params = useSearchParams(); const router = useRouter(); const t = STRINGS[lang];
  const { state: connectivity } = useConnectivity();
  const host = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState(params.get("station"));
  const [picked, setPicked] = useState<Point | null>(null);
  const [resolved, setResolved] = useState<(Point & { label: string }) | null>(null);
  const stations = useMemo(() => catalogStations(cityIds, city), [cityIds, city]);
  const byId = useMemo(() => new Map(stations.map(s => [s.id, s])), [stations]);
  const edges = useMemo(() => CITY_EDGES.filter(e => byId.has(e.from) && byId.has(e.to)), [byId]);
  const selected = selectedId ? byId.get(selectedId) : undefined;
  const origin = byId.get(params.get("from") ?? "");
  const dest = byId.get(params.get("to") ?? "");
  const originPin = useMemo(() => origin ? parsePlaceParam(params, "oP") : null, [origin, params]);
  const destPin = useMemo(() => dest ? parsePlaceParam(params, "dP") : null, [dest, params]);
  const crossCity = !!origin && !!dest && origin.cityId !== dest.cityId;
  const pathIds = useMemo(() => {
    if (!origin || !dest || origin.cityId !== dest.cityId || origin.id === dest.id) return EMPTY_PATH;
    if (origin.cityId === "mashhad") return mashhadPreview.findPath(origin.id, dest.id)?.stationIds ?? EMPTY_PATH;
    return computeRouteTopology(origin.localId, dest.localId)?.path.map(id => `tehran:station:${id}`) ?? EMPTY_PATH;
  }, [origin, dest]);
  const stationName = (station: CityStation) => city === "all"
    ? `${station.names[lang]} · ${CITIES.find(c => c.slug === station.cityId)!.name[lang]}` : station.names[lang];
  const nearest = useMemo(() => {
    if (!picked) return null;
    return stations.filter(s => s.operationalLineIds.length > 0).map(station => ({ station,
      km: haversineKm(picked.lat, picked.lng, station.location.lat, station.location.lng) }))
      .sort((a, b) => a.km - b.km)[0] ?? null;
  }, [picked, stations]);
  const pickedLabel = picked && resolved?.lat === picked.lat && resolved.lng === picked.lng
    ? displayPlaceLabel(resolved.label, lang) : t.selectedMapPoint;
  useEffect(() => {
    if (!picked) return;
    const point = picked; let cancelled = false;
    reverseGeocode(point.lat, point.lng, lang).then(label => { if (!cancelled && label) setResolved({ ...point, label }); });
    return () => { cancelled = true; };
  }, [picked, lang]);
  const handlePick = useCallback((lat: number, lng: number) => { setPicked({ lat, lng }); setResolved(null); setSelectedId(null); }, []);
  const handleSelect = useCallback((id: string | null) => { setSelectedId(id); setPicked(null); setResolved(null); }, []);
  const refocusMap = () => requestAnimationFrame(() => host.current?.querySelector<HTMLElement>('[aria-label="Metro on real map"]')?.focus());
  const closeCard = () => { setPicked(null); setResolved(null); setSelectedId(null); refocusMap(); };
  const mapPath = `/${city === "all" ? "cities" : city}/map`;
  function chooseEndpoint(role: "origin" | "dest", station = nearest?.station, point = picked, label = pickedLabel) {
    if (!station || station.operationalLineIds.length === 0) return;
    const next = new URLSearchParams(params.toString());
    next.set(role === "origin" ? "from" : "to", station.id);
    next.set(role === "origin" ? "op" : "dp", encodePlacePin({ ...(point ?? station.location), label }));
    next.set("lang", lang); next.delete("station");
    for (const key of role === "origin" ? ["oPlat", "oPlng", "oPlabel"] : ["dPlat", "dPlng", "dPlabel"]) next.delete(key);
    if (station.cityId === "mashhad") {
      try { localStorage.setItem(`mashhad.route.${role === "origin" ? "from" : "to"}`, station.id); } catch { /* storage optional */ }
    }
    setSelectedId(null); setPicked(null); setResolved(null);
    router.replace(`${mapPath}?${next}`);
    refocusMap();
  }
  function clearRoute() {
    const next = new URLSearchParams(params.toString());
    for (const key of endpointKeys) next.delete(key);
    next.set("lang", lang);
    setSelectedId(null); setPicked(null); setResolved(null);
    router.replace(`${mapPath}?${next}`);
  }
  const walking = useTripWalking(originPin ?? origin?.location, destPin ?? dest?.location,
    origin?.location, dest?.location, null);
  const placeMarkers = useMemo(() => [
    ...(originPin && origin ? [{ ...originPin, role: "origin" as const, stationId: origin.id, label: displayPlaceLabel(originPin.label, lang) }] : []),
    ...(destPin && dest ? [{ ...destPin, role: "dest" as const, stationId: dest.id, label: displayPlaceLabel(destPin.label, lang) }] : []),
  ], [originPin, origin, destPin, dest, lang]);
  const walkingPaths = useMemo(() => ({ origin: walking.access.route?.coordinates, dest: walking.egress.route?.coordinates }), [walking.access.route, walking.egress.route]);
  const directWalk = useMemo(() => origin && dest && origin.id === dest.id && originPin && destPin
    ? { from: originPin, to: destPin, coordinates: walking.direct.route?.coordinates } : null,
    [origin, dest, originPin, destPin, walking.direct.route]);
  return <div ref={host} data-testid="city-map" className="relative isolate flex min-h-0 flex-1 flex-col overflow-hidden"
    onKeyDown={event => { if (event.key === "Escape" && (picked || selected)) { event.preventDefault(); closeCard(); } }}>
    <NetworkMap stations={stations} edges={edges} lang={lang} selectedId={selectedId ?? undefined} pathIds={pathIds}
      originId={origin?.id} destId={dest?.id} onSelect={handleSelect} showCity={city === "all"} mapMode={mapMode}
      onPickPoint={handlePick} pendingPick={picked ? { ...picked, label: pickedLabel } : null}
      placeMarkers={placeMarkers} walkingPaths={walkingPaths} directWalk={directWalk}
      onClearRoute={clearRoute} showClearRoute={!!(origin || dest || selected || picked || originPin || destPin)} />
    <div role="group" aria-label={t.mapMode} className="absolute start-3 top-3 z-[600] flex overflow-hidden rounded-lg border border-border bg-background/90 shadow-sm backdrop-blur">
      {(["satellite", "minimalist"] as const).map(mode => <button key={mode} type="button" aria-pressed={mapMode === mode} onClick={() => setMapMode(mode)} className={cn("flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors", mapMode === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}>
        {mode === "satellite" ? <Satellite aria-hidden="true" className="size-3.5" /> : <Layers aria-hidden="true" className="size-3.5" />}{t[mode]}
      </button>)}
    </div>
    <div className="pointer-events-none absolute inset-x-3 top-14 z-[600] mx-auto flex max-w-md flex-col gap-1.5">
      {stations.some(station => station.cityId === "mashhad") && <p data-testid="construction-legend" className="self-start rounded-md bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow-sm">
        <span aria-hidden="true" className="me-1.5 inline-block w-5 border-t-2 border-dashed border-muted-foreground align-middle" />{t.mashhadConstructionMap}
      </p>}
      {connectivity === "offline" && <div className="rounded-lg border border-border bg-background/95 px-3 py-2 text-xs shadow-sm"><p className="flex items-center gap-2 font-semibold"><WifiOff aria-hidden="true" className="size-4" />{t.mapOfflineTitle}</p><p className="mt-0.5 text-muted-foreground">{t.mapOfflineBody}</p></div>}
      {crossCity && <p role="alert" className="rounded-lg border border-border bg-background/95 px-3 py-2 text-sm shadow-sm">{t.citySameCityOnly}</p>}
      {placeMarkers.map(marker => {
        const station = byId.get(marker.stationId)!;
        const street = marker.role === "origin" ? walking.access.route : walking.egress.route;
        const km = street ? street.distanceMeters / 1000 : haversineKm(marker.lat, marker.lng, station.location.lat, station.location.lng);
        const minutes = street ? street.durationSeconds / 60 : estimateWalkMinutes(km);
        return <div key={marker.role} data-testid="map-place-card" className="rounded-lg border border-border bg-background/95 px-3 py-2 text-xs shadow-sm">
          <p className="truncate font-medium">{marker.label}</p><p className="mt-0.5 text-muted-foreground">{t.nearestStation}: {stationName(station)} · {formatDistance(km, lang)} · {street ? "" : "~"}{formatWalkTime(minutes, lang)} {t.walkTime}</p>
          {isLongWalk(km, minutes) && <p className="mt-0.5 font-medium text-foreground">{t.longWalkConsiderTransport}</p>}
        </div>;
      })}
      {placeMarkers.length > 0 && <WalkingRouteInfo lang={lang} onMap loading={walking.access.loading || walking.egress.loading || walking.direct.loading}
        hasPath={!!(walking.access.route || walking.egress.route || walking.direct.route)} saved={walking.access.saved || walking.egress.saved || walking.direct.saved} />}
    </div>
    {selected && <section data-testid="map-station-card" className="absolute inset-x-3 bottom-3 z-[600] mx-auto max-w-md overflow-hidden rounded-xl bg-card shadow-sm" aria-label={stationName(selected)}>
      <StationDetailView station={{ id: selected.id, name: city === "all" ? { fa: `${selected.names.fa} · ${CITIES.find(c => c.slug === selected.cityId)!.name.fa}`, en: `${selected.names.en} · ${CITIES.find(c => c.slug === selected.cityId)!.name.en}` } : selected.names, location: selected.location, status: selected.status, amenities: selected.amenities }}
        reportedAmenities={selected.reportedAmenities} lang={lang} onClose={closeCard}
        lines={selected.lineIds.map(id => ({ id, label: id.split(":").at(-1)!, color: CITY_LINES.find(l => l.id === id)!.color,
          onColor: selected.cityId === "mashhad" ? "#18181b" : lineOnColor(Number(id.split(":").at(-1))), boardable: selected.operationalLineIds.includes(id) }))} />
      <div className="flex gap-2 p-3 pt-0">
        <button type="button" disabled={!selected.operationalLineIds.length} className="min-h-11 flex-1 rounded-lg border border-border px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50" onClick={() => chooseEndpoint("origin", selected, selected.location, stationName(selected))}>{t.setAsOrigin}</button>
        <button type="button" disabled={!selected.operationalLineIds.length} className="min-h-11 flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50" onClick={() => chooseEndpoint("dest", selected, selected.location, stationName(selected))}>{t.setDestination}</button>
      </div>
    </section>}
    {picked && nearest && <div className="absolute inset-x-3 bottom-3 z-[600] mx-auto max-w-md"><MapPickCard lang={lang} title={pickedLabel}
      stationName={stationName(nearest.station)} distanceText={formatDistance(nearest.km, lang)} walkText={formatWalkTime(estimateWalkMinutes(nearest.km), lang)}
      destPrimary={!!origin} onChooseOrigin={() => chooseEndpoint("origin")} onChooseDest={() => chooseEndpoint("dest")} onClose={closeCard} /></div>}
  </div>;
}
