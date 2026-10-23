"use client";
import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMetro } from "@/app/providers";
import { CITIES, type CityId } from "@/lib/cities";
import { CITY_EDGES, catalogStations, cityCounts, normalizeCitySearch, stationRouteHref } from "@/lib/city-catalog";
import { STRINGS, persianDigits } from "@/lib/i18n";
import { mashhadPreview } from "@/lib/mashhad-preview";
import { haversineKm } from "@/lib/geo";

const NetworkMap = dynamic(() => import("./city-network-map").then(m => m.CityNetworkMap), { ssr: false,
  loading: () => <div className="flex min-h-80 items-center justify-center bg-muted" role="status">…</div> });
const control = "min-h-[44px] rounded-lg border border-border bg-background px-3 py-2 focus-visible:outline-2 focus-visible:outline-primary";

export function CityExplorer({ city, view }: { city: CityId | "all"; view: "map" | "stations" | "nearby" }) {
  const { lang, cityIds } = useMetro(); const t = STRINGS[lang]; const params = useSearchParams();
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
    <header className="shrink-0 border-b px-4 py-3">
      <h1 className="text-lg font-bold">{title} · {t[view === "map" ? "tabMap" : view === "nearby" ? "tabNearby" : "tabStations"]}</h1>
      <p className="mt-1 text-sm">{persianDigits(count.stations, lang)} {t.stops} · {persianDigits(count.lines, lang)} {t.cityLines}</p>
      {city === "mashhad" && <p className="mt-1 text-sm">{t.cityPathOnly}</p>}
      {city === "all" && <div className="mt-2 flex flex-wrap gap-2">{CITIES.filter(c => cityIds.includes(c.slug)).map(c =>
        <Link key={c.slug} href={`/${c.slug}/${view}?lang=${lang}`} className={`${control} inline-flex items-center`}>{c.name[lang]}</Link>)}</div>}
    </header>
    {view === "map" ? <div className="relative min-h-0 flex-1">
      <NetworkMap key={city} stations={stations} edges={edges} lang={lang} selectedId={selectedId} pathIds={path?.stationIds} onSelect={onSelect} showCity={city === "all"} />
      {selected && <section className="absolute inset-x-3 bottom-7 z-[600] mx-auto max-w-sm rounded-xl border bg-background p-3 shadow-lg" aria-label={stationName(selected.id)}>
        <h2 className="font-bold">{stationName(selected.id)}</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link className={`${control} inline-flex items-center`} href={stationRouteHref(selected, "from", lang)}>{t.from}</Link>
          <Link className={`${control} inline-flex items-center`} href={stationRouteHref(selected, "to", lang)}>{t.to}</Link>
          <button className={control} onClick={() => setSelectedId("")}>{t.close}</button>
        </div>
      </section>}
    </div> : <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <div className="mx-auto max-w-3xl">
        {view === "nearby" && <div className="mb-4">
          <button className={control} disabled={locating} onClick={() => {
            setGeoError(false); setLocating(true);
            if (!navigator.geolocation) { setGeoError(true); setLocating(false); return; }
            navigator.geolocation.getCurrentPosition(p => { setLocation({ lat: p.coords.latitude, lng: p.coords.longitude }); setLocating(false); }, () => { setGeoError(true); setLocating(false); }, { timeout: 15000, maximumAge: 60000 });
          }}>{locating ? t.cityLocating : t.cityUseLocation}</button>
          <p className="mt-2 text-sm">{t.cityStraightDistance}</p>
          {geoError && <p role="alert" className="mt-2">{t.cityLocationUnavailable}</p>}
        </div>}
        <label htmlFor="city-catalog-search" className="block text-sm font-medium">{t.searchStations}</label>
        <input id="city-catalog-search" type="search" className={`${control} mt-2 w-full`} value={query} onChange={e => setQuery(e.target.value)} />
        <p role="status" className="my-3 text-sm">{persianDigits(filtered.length, lang)} {t.stops}</p>
        <ul className="grid gap-3 sm:grid-cols-2">{filtered.map(s => <li key={s.id} className="rounded-xl border p-3" data-city={s.cityId} data-station-id={s.id}>
          <h2 className="font-bold">{s.names[lang]}</h2><p className="mt-1 text-sm">{CITIES.find(c => c.slug === s.cityId)!.name[lang]} · {s.lineIds.map(id => `${t.line} ${persianDigits(id.split(":").at(-1)!, lang)}`).join(" · ")}</p>
          {location && <p className="mt-1 text-sm">{persianDigits(haversineKm(location.lat, location.lng, s.location.lat, s.location.lng).toFixed(1), lang)} {t.cityKm}</p>}
          <div className="mt-2 flex gap-2">
            <Link className={`${control} inline-flex items-center`} href={stationRouteHref(s, "to", lang)}>{t.cityRouteToStation}</Link>
            <Link className={`${control} inline-flex items-center`} href={`/${s.cityId}/map?${new URLSearchParams({ station: s.localId, lang })}`}>{t.tabMap}</Link>
          </div>
        </li>)}</ul>
        {!filtered.length && <p className="py-4">{t.noResults}</p>}
      </div>
    </div>}
  </div>;
}
