"use client";
import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMetro } from "@/app/providers";
import { CITIES, type CityId } from "@/lib/cities";
import { CITY_LINES, CITY_EDGES, catalogStations, cityCounts, normalizeCitySearch, stationRouteHref } from "@/lib/city-catalog";
import { STRINGS, persianDigits } from "@/lib/i18n";
import { mashhadPreview } from "@/lib/mashhad-preview";
import { haversineKm } from "@/lib/geo";
import { Map as MapIcon, Search, Layers, Satellite } from "lucide-react";
import { cn } from "@/lib/utils";
import { StationDetailView } from "./station-detail";
import { StationCardView } from "./station-card";
import { FilterChip } from "./stations-tab";
import { NearbyLocation } from "./nearby-tab";
import { CityStationPicker } from "./city-station-picker";
import { getCurrentPositionTolerant, classifyGeoError, type GeoErrorKind } from "@/lib/geolocation";
import { LocationErrorActions } from "./location-error";
import { lineOnColor } from "@/lib/metro/lines";

const NetworkMap = dynamic(() => import("./city-network-map").then(m => m.CityNetworkMap), { ssr: false,
  loading: () => <div className="flex min-h-80 items-center justify-center bg-muted" role="status">…</div> });

export function CityExplorer({ city, view }: { city: CityId | "all"; view: "map" | "stations" | "nearby" }) {
  const { lang, cityIds, mapMode, setMapMode } = useMetro(); const t = STRINGS[lang]; const params = useSearchParams(); const router = useRouter();
  const [query, setQuery] = useState(""); const [lineFilter, setLineFilter] = useState<string | null>(null); const [selectedId, setSelectedId] = useState(params.get("station") ?? "");
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false); const [geoError, setGeoError] = useState<GeoErrorKind | null>(null);
  const [nearbyStationId, setNearbyStationId] = useState("");
  const stations = useMemo(() => catalogStations(cityIds, city), [cityIds, city]);
  const ids = useMemo(() => new Set(stations.map(s => s.id)), [stations]);
  const edges = useMemo(() => CITY_EDGES.filter(e => ids.has(e.from) && ids.has(e.to)), [ids]);
  const selected = stations.find(s => s.id === selectedId);
  const onSelect = useCallback((id: string | null) => setSelectedId(id ?? ""), []);
  const path = useMemo(() => city === "mashhad" ? mashhadPreview.findPath(params.get("from") ?? "", params.get("to") ?? "") : null, [city, params]);
  const filtered = useMemo(() => {
    const lineOrder = lineFilter?.startsWith("mashhad:") ? mashhadPreview.getLineStationIds(lineFilter) : [];
    const q = normalizeCitySearch(query);
    return stations.filter(s => (!lineFilter || s.lineIds.includes(lineFilter)) && normalizeCitySearch(`${s.names.fa} ${s.names.en} ${CITIES.find(c => c.slug === s.cityId)!.name[lang]}`).includes(q))
      .sort((a, b) => location ? haversineKm(location.lat, location.lng, a.location.lat, a.location.lng) - haversineKm(location.lat, location.lng, b.location.lat, b.location.lng)
        : lineOrder.length ? lineOrder.indexOf(a.id) - lineOrder.indexOf(b.id) : a.names[lang].localeCompare(b.names[lang], lang));
  }, [stations, query, lang, location, lineFilter]);
  const title = city === "all" ? t.allCities : CITIES.find(c => c.slug === city)!.name[lang];
  const count = cityCounts(cityIds, city);
  const requestGps = async () => {
    setGeoError(null); setLocating(true);
    try { setLocation(await getCurrentPositionTolerant()); setNearbyStationId(""); }
    catch (error) { setGeoError(classifyGeoError(error)); }
    finally { setLocating(false); }
  };
  const renderRows = (items: typeof stations) => (<ul className="flex flex-col gap-3">{items.map(s => <li key={s.id} data-city={s.cityId} data-station-id={s.id}>
          <StationCardView station={{ id: s.id, name: s.names, location: s.location, status: s.status, amenities: {} }} lang={lang}
            secondaryName={city === "all" ? CITIES.find(c => c.slug === s.cityId)!.name[lang] : undefined}
            lines={s.lineIds.map(id => ({ id, label: id.split(":").at(-1)!, color: CITY_LINES.find(l => l.id === id)!.color,
              onColor: s.cityId === "mashhad" ? "#18181b" : lineOnColor(Number(id.split(":").at(-1))) }))}
            boardableCount={s.operationalLineIds.length}
            distance={location ? haversineKm(location.lat, location.lng, s.location.lat, s.location.lng) : undefined}
            onSetDest={() => router.push(stationRouteHref(s, "to", lang))} />
          {city === "all" && <Link className="inline-flex min-h-11 items-center gap-1.5 text-xs text-muted-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-primary" href={`/${s.cityId}/map?${new URLSearchParams({ station: s.localId, lang })}`}><MapIcon aria-hidden="true" className="size-3.5" />{t.tabMap}</Link>}
        </li>)}</ul>);
  const stationName = (id: string) => { const s = stations.find(s => s.id === id); return s ? `${s.names[lang]} · ${CITIES.find(c => c.slug === s.cityId)!.name[lang]}` : ""; };
  return <div className="flex min-h-0 flex-1 flex-col" dir={lang === "fa" ? "rtl" : "ltr"} data-testid="city-explorer">
    {view !== "map" && <header className="shrink-0 border-b border-border px-4 py-3">
      <div className="mx-auto w-full max-w-xl">
        <h1 className="text-base font-bold md:text-lg">{title} · {t[view === "nearby" ? "tabNearby" : "tabStations"]}</h1>
        <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">{persianDigits(count.stations, lang)} {t.stops} · {persianDigits(count.lines, lang)} {t.cityLines}</p>
      </div>
    </header>}
    {view === "map" ? <div className="relative min-h-0 flex-1">
      <NetworkMap key={city} stations={stations} edges={edges} lang={lang} selectedId={selectedId} pathIds={path?.stationIds} onSelect={onSelect} showCity={city === "all"} mapMode={mapMode} onClearRoute={() => { setSelectedId(""); router.replace(`/${city === "all" ? "cities" : city}/map?lang=${lang}`); }} />
      <div role="group" aria-label={t.mapMode} className="absolute start-3 top-3 z-[600] flex overflow-hidden rounded-lg border border-border bg-background/90 shadow-sm backdrop-blur">
        {(["satellite", "minimalist"] as const).map(mode => <button key={mode} type="button" aria-pressed={mapMode === mode} onClick={() => setMapMode(mode)} className={cn("flex min-h-9 items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors", mapMode === mode ? "bg-primary text-primary-foreground" : "text-foreground/80 hover:bg-accent")}>
          {mode === "satellite" ? <Satellite aria-hidden="true" className="size-3.5" /> : <Layers aria-hidden="true" className="size-3.5" />}{t[mode]}
        </button>)}
      </div>
      {selected && <section className="absolute inset-x-3 bottom-3 z-[600] mx-auto max-w-md overflow-hidden rounded-xl bg-card shadow-sm" aria-label={stationName(selected.id)}>
        <StationDetailView station={{ id: selected.id, name: city === "all" ? { fa: `${selected.names.fa} · ${CITIES.find(c => c.slug === selected.cityId)!.name.fa}`, en: `${selected.names.en} · ${CITIES.find(c => c.slug === selected.cityId)!.name.en}` } : selected.names, location: selected.location, status: selected.status, amenities: {} }}
          lang={lang} onClose={() => {
            const id = selectedId; setSelectedId("");
            requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-station-id="${CSS.escape(id)}"]`)?.focus());
          }} lines={selected.lineIds.map(id => ({ id, label: id.split(":").at(-1)!, color: CITY_LINES.find(l => l.id === id)!.color,
            onColor: selected.cityId === "mashhad" ? "#18181b" : lineOnColor(Number(id.split(":").at(-1))), boardable: selected.operationalLineIds.includes(id) }))} />
        <div className="flex border-t border-border">
          <Link className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 text-xs font-semibold text-primary hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary" href={stationRouteHref(selected, "from", lang)}>{t.from}</Link>
          <Link className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 border-s border-border text-xs font-semibold text-primary hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary" href={stationRouteHref(selected, "to", lang)}>{t.to}</Link>
        </div>
      </section>}
    </div> : view === "nearby" ? <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 p-4">
        <NearbyLocation lang={lang} locating={locating} onLocate={requestGps}
          locationLabel={location ? stations.find(s => s.id === nearbyStationId)?.names[lang] ?? t.useMyLocation : ""}
          picker={<CityStationPicker id="city-nearby" stations={stations} value={nearbyStationId} lang={lang} placeholder={t.searchStations} accentClass="bg-primary" showCity={city === "all"}
            onChange={id => { const station = stations.find(s => s.id === id); setNearbyStationId(id); setLocation(station?.location ?? null); setGeoError(null); }} />}
          error={geoError && <LocationErrorActions lang={lang} kind={geoError} onRetry={requestGps} />} />
        {!location ? <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-12 text-center text-sm text-muted-foreground">{t.cityNearbyHint}</div>
          : <><p className="text-xs text-muted-foreground">{t.cityStraightDistance}</p>{renderRows(filtered.filter(s => s.status === "operational").slice(0, 15))}</>}
      </div>
    </div> : <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <div className="mx-auto max-w-xl">
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input id="city-catalog-search" aria-label={t.searchStations} placeholder={t.searchStations} type="search" className="ios-no-zoom-input w-full rounded-xl border border-border bg-card py-3 ps-9 pe-3 text-sm outline-none ring-primary/30 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.filterLine}</p>
          <div className="flex flex-wrap gap-2">
            <FilterChip active={lineFilter === null} onClick={() => setLineFilter(null)}>{t.all}</FilterChip>
            {CITY_LINES.filter(l => stations.some(s => s.lineIds.includes(l.id))).map(l => <FilterChip key={l.id} active={lineFilter === l.id} onClick={() => setLineFilter(l.id)} dot={l.color}>
              {city === "all" && `${CITIES.find(c => c.slug === l.cityId)!.name[lang]} · `}{t.line} {persianDigits(l.id.split(":").at(-1)!, lang)}
            </FilterChip>)}
          </div>
        </div>
        <p role="status" className="my-3 text-xs text-muted-foreground">{persianDigits(filtered.length, lang)} {t.stops}</p>
        {renderRows(filtered)}
        {!filtered.length && <p className="py-4">{t.noResults}</p>}
      </div>
    </div>}
  </div>;
}
