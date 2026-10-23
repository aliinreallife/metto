"use client";
import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMetro } from "@/app/providers";
import { CITIES, type CityId } from "@/lib/cities";
import { CITY_LINES, CITY_EDGES, catalogStations, cityCounts, normalizeCitySearch, stationRouteHref } from "@/lib/city-catalog";
import { STRINGS, persianDigits } from "@/lib/i18n";
import { mashhadPreview } from "@/lib/mashhad-preview";
import { haversineKm } from "@/lib/geo";
import { Flag, Map as MapIcon, Search, X, Layers, Satellite } from "lucide-react";
import { cn } from "@/lib/utils";
import { lineOnColor } from "@/lib/metro/lines";

const NetworkMap = dynamic(() => import("./city-network-map").then(m => m.CityNetworkMap), { ssr: false,
  loading: () => <div className="flex min-h-80 items-center justify-center bg-muted" role="status">…</div> });
const control = "min-h-[44px] rounded-lg border border-border bg-background px-3 py-2 focus-visible:outline-2 focus-visible:outline-primary";

export function CityExplorer({ city, view }: { city: CityId | "all"; view: "map" | "stations" | "nearby" }) {
  const { lang, cityIds, mapMode, setMapMode } = useMetro(); const t = STRINGS[lang]; const params = useSearchParams();
  const [query, setQuery] = useState(""); const [selectedId, setSelectedId] = useState(params.get("station") ?? "");
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false); const [geoError, setGeoError] = useState(false);
  const stations = useMemo(() => catalogStations(cityIds, city), [cityIds, city]);
  const ids = useMemo(() => new Set(stations.map(s => s.id)), [stations]);
  const edges = useMemo(() => CITY_EDGES.filter(e => ids.has(e.from) && ids.has(e.to)), [ids]);
  const selected = stations.find(s => s.id === selectedId);
  const onSelect = useCallback((id: string) => setSelectedId(id), []);
  const path = useMemo(() => city === "mashhad" ? mashhadPreview.findPath(params.get("from") ?? "", params.get("to") ?? "") : null, [city, params]);
  const filtered = useMemo(() => {
    const q = normalizeCitySearch(query);
    return stations.filter(s => normalizeCitySearch(`${s.names.fa} ${s.names.en} ${CITIES.find(c => c.slug === s.cityId)!.name[lang]}`).includes(q))
      .sort((a, b) => location ? haversineKm(location.lat, location.lng, a.location.lat, a.location.lng) - haversineKm(location.lat, location.lng, b.location.lat, b.location.lng)
        : a.names[lang].localeCompare(b.names[lang], lang));
  }, [stations, query, lang, location]);
  const title = city === "all" ? t.allCities : CITIES.find(c => c.slug === city)!.name[lang];
  const count = cityCounts(cityIds, city);
  const stationName = (id: string) => { const s = stations.find(s => s.id === id); return s ? `${s.names[lang]} · ${CITIES.find(c => c.slug === s.cityId)!.name[lang]}` : ""; };
  return <div className="flex min-h-0 flex-1 flex-col" dir={lang === "fa" ? "rtl" : "ltr"} data-testid="city-explorer">
    {view !== "map" && <header className="shrink-0 border-b border-border px-4 py-3">
      <div className="mx-auto w-full max-w-xl">
        <h1 className="text-base font-bold md:text-lg">{title} · {t[view === "nearby" ? "tabNearby" : "tabStations"]}</h1>
        <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">{persianDigits(count.stations, lang)} {t.stops} · {persianDigits(count.lines, lang)} {t.cityLines}</p>
      </div>
    </header>}
    {view === "map" ? <div className="relative min-h-0 flex-1">
      <NetworkMap key={city} stations={stations} edges={edges} lang={lang} selectedId={selectedId} pathIds={path?.stationIds} onSelect={onSelect} showCity={city === "all"} mapMode={mapMode} />
      <div role="group" aria-label={t.mapMode} className="absolute start-3 top-3 z-[600] flex overflow-hidden rounded-lg border border-border bg-background/90 shadow-sm backdrop-blur">
        {(["satellite", "minimalist"] as const).map(mode => <button key={mode} type="button" aria-pressed={mapMode === mode} onClick={() => setMapMode(mode)} className={cn("flex min-h-9 items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors", mapMode === mode ? "bg-primary text-primary-foreground" : "text-foreground/80 hover:bg-accent")}>
          {mode === "satellite" ? <Satellite aria-hidden="true" className="size-3.5" /> : <Layers aria-hidden="true" className="size-3.5" />}{t[mode]}
        </button>)}
      </div>
      {selected && <section className="absolute inset-x-3 bottom-3 z-[600] mx-auto max-w-md overflow-hidden rounded-xl border border-border bg-card shadow-sm" aria-label={stationName(selected.id)}>
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1"><h2 className="truncate text-sm font-bold">{stationName(selected.id)}</h2><p className="mt-0.5 text-xs text-muted-foreground">{selected.names[lang === "fa" ? "en" : "fa"]}</p></div>
          <button aria-label={t.close} className="flex size-11 items-center justify-center rounded-lg hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary" onClick={() => {
            const id = selectedId; setSelectedId("");
            requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-station-id="${CSS.escape(id)}"]`)?.focus());
          }}><X aria-hidden="true" className="size-4" /></button>
        </div>
        <div className="flex border-t border-border">
          <Link className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 text-xs font-semibold text-primary hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary" href={stationRouteHref(selected, "from", lang)}>{t.from}</Link>
          <Link className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 border-s border-border text-xs font-semibold text-primary hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary" href={stationRouteHref(selected, "to", lang)}>{t.to}</Link>
        </div>
      </section>}
    </div> : <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <div className="mx-auto max-w-xl">
        {view === "nearby" && <div className="mb-4">
          <button className={control} disabled={locating} onClick={() => {
            setGeoError(false); setLocating(true);
            if (!navigator.geolocation) { setGeoError(true); setLocating(false); return; }
            navigator.geolocation.getCurrentPosition(p => { setLocation({ lat: p.coords.latitude, lng: p.coords.longitude }); setLocating(false); }, () => { setGeoError(true); setLocating(false); }, { timeout: 15000, maximumAge: 60000 });
          }}>{locating ? t.cityLocating : t.cityUseLocation}</button>
          <p className="mt-2 text-sm">{t.cityStraightDistance}</p>
          {geoError && <p role="alert" className="mt-2">{t.cityLocationUnavailable}</p>}
        </div>}
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input id="city-catalog-search" aria-label={t.searchStations} placeholder={t.searchStations} type="search" className="ios-no-zoom-input w-full rounded-xl border border-border bg-card py-3 ps-9 pe-3 text-sm outline-none ring-primary/30 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <p role="status" className="my-3 text-xs text-muted-foreground">{persianDigits(filtered.length, lang)} {t.stops}</p>
        <ul className="grid gap-4">{filtered.map(s => <li key={s.id} className="overflow-hidden rounded-xl border border-border bg-card" data-city={s.cityId} data-station-id={s.id}>
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="flex shrink-0 gap-1">{s.lineIds.map(id => <span key={id} className="flex size-8 items-center justify-center rounded-lg text-sm font-bold" style={{ backgroundColor: CITY_LINES.find(l => l.id === id)?.color ?? "#555", color: s.cityId === "mashhad" ? "#18181b" : lineOnColor(Number(id.split(":").at(-1))) }}>{persianDigits(id.split(":").at(-1)!, lang)}</span>)}</div>
            <div className="min-w-0 flex-1"><h2 className="truncate text-sm font-bold leading-tight">{s.names[lang]}</h2><p className="mt-0.5 truncate text-xs text-muted-foreground">{city === "all" ? CITIES.find(c => c.slug === s.cityId)!.name[lang] : s.names[lang === "fa" ? "en" : "fa"]}</p></div>
            {location && <span className="text-xs text-muted-foreground">{persianDigits(haversineKm(location.lat, location.lng, s.location.lat, s.location.lng).toFixed(1), lang)} {t.cityKm}</span>}
          </div>
          <div className="flex border-t border-border">
            <Link className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 text-xs text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary" href={`/${s.cityId}/map?${new URLSearchParams({ station: s.localId, lang })}`}><MapIcon aria-hidden="true" className="size-3.5" />{t.tabMap}</Link>
            <Link className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 border-s border-border text-xs font-semibold text-primary hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary" href={stationRouteHref(s, "to", lang)}><Flag aria-hidden="true" className="size-3.5" />{t.cityRouteToStation}</Link>
          </div>
        </li>)}</ul>
        {!filtered.length && <p className="py-4">{t.noResults}</p>}
      </div>
    </div>}
  </div>;
}
