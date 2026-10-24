"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMetro } from "@/app/providers";
import { CITIES, type CityId } from "@/lib/cities";
import { CITY_LINES, catalogStations, cityCounts, normalizeCitySearch, stationRouteHref } from "@/lib/city-catalog";
import { AMENITY_LABELS, STRINGS, persianDigits } from "@/lib/i18n";
import { mashhadPreview } from "@/lib/mashhad-preview";
import { haversineKm } from "@/lib/geo";
import { Map as MapIcon, Search } from "lucide-react";
import { CityMap } from "./city-map";
import { AMENITY_ICON_MAP } from "@/lib/amenity-icons";
import type { AmenityKey } from "@/lib/geo";
import { StationCardView } from "./station-card";
import { FilterChip } from "./stations-tab";
import { NearbyLocation } from "./nearby-tab";
import { CityStationPicker } from "./city-station-picker";
import { getCurrentPositionTolerant, classifyGeoError, type GeoErrorKind } from "@/lib/geolocation";
import { LocationErrorActions } from "./location-error";
import { lineOnColor } from "@/lib/metro/lines";

export function CityExplorer({ city, view }: { city: CityId | "all"; view: "map" | "stations" | "nearby" }) {
  return view === "map" ? <CityMap key={city} city={city} /> : <CityDirectory key={city} city={city} view={view} />;
}

function CityDirectory({ city, view }: { city: CityId | "all"; view: "stations" | "nearby" }) {
  const { lang, cityIds } = useMetro(); const t = STRINGS[lang]; const router = useRouter();
  const [query, setQuery] = useState(""); const [lineFilter, setLineFilter] = useState<string | null>(null); const [cityFilter, setCityFilter] = useState<CityId | "all">("all");
  const [amenityFilter, setAmenityFilter] = useState<AmenityKey[]>([]);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false); const [geoError, setGeoError] = useState<GeoErrorKind | null>(null);
  const [nearbyStationId, setNearbyStationId] = useState("");
  const stations = useMemo(() => catalogStations(cityIds, city), [cityIds, city]);
  const effectiveCity = city === "all" && view === "stations" ? cityFilter : city;
  const filtered = useMemo(() => {
    const lineOrder = lineFilter?.startsWith("mashhad:") ? mashhadPreview.getLineStationIds(lineFilter) : [];
    const q = normalizeCitySearch(query);
    return stations.filter(s => (effectiveCity === "all" || s.cityId === effectiveCity) && amenityFilter.every(key => (s.reportedAmenities ?? s.amenities)[key] === true) && (!lineFilter || s.lineIds.includes(lineFilter)) && normalizeCitySearch(`${s.names.fa} ${s.names.en} ${CITIES.find(c => c.slug === s.cityId)!.name[lang]}`).includes(q))
      .sort((a, b) => location ? haversineKm(location.lat, location.lng, a.location.lat, a.location.lng) - haversineKm(location.lat, location.lng, b.location.lat, b.location.lng)
        : lineOrder.length ? lineOrder.indexOf(a.id) - lineOrder.indexOf(b.id) : a.names[lang].localeCompare(b.names[lang], lang));
  }, [stations, query, lang, location, lineFilter, effectiveCity, amenityFilter]);
  const title = city === "all" ? t.allCities : CITIES.find(c => c.slug === city)!.name[lang];
  const count = cityCounts(cityIds, city);
  const requestGps = async () => {
    setGeoError(null); setLocating(true);
    try { setLocation(await getCurrentPositionTolerant()); setNearbyStationId(""); }
    catch (error) { setGeoError(classifyGeoError(error)); }
    finally { setLocating(false); }
  };
  const amenitiesFilter = <section>
    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.amenities}</p>
    {stations.some(s => s.reportedAmenities && (effectiveCity === "all" || s.cityId === effectiveCity)) && <p className="mb-2 text-xs text-muted-foreground">{t.amenitiesReported}</p>}
    <div className="flex flex-wrap gap-2">
      <FilterChip active={!amenityFilter.length} onClick={() => setAmenityFilter([])}>{t.all}</FilterChip>
      {(Object.keys(AMENITY_LABELS) as AmenityKey[]).map(key => {
        const Icon = AMENITY_ICON_MAP[key];
        return <FilterChip key={key} active={amenityFilter.includes(key)} onClick={() => setAmenityFilter(values => values.includes(key) ? values.filter(value => value !== key) : [...values, key])}>
          {Icon && <Icon aria-hidden="true" className="size-3.5" />}{AMENITY_LABELS[key][lang]}
        </FilterChip>;
      })}
    </div>
  </section>;
  const renderRows = (items: typeof stations) => (<ul className="flex flex-col gap-3">{items.map(s => <li key={s.id} data-city={s.cityId} data-station-id={s.id}>
          <StationCardView station={{ id: s.id, name: s.names, location: s.location, status: s.status, amenities: s.amenities }} lang={lang}
            reportedAmenities={s.reportedAmenities}
            secondaryName={city === "all" ? CITIES.find(c => c.slug === s.cityId)!.name[lang] : undefined}
            lines={s.lineIds.map(id => ({ id, label: id.split(":").at(-1)!, color: CITY_LINES.find(l => l.id === id)!.color,
              onColor: s.cityId === "mashhad" ? "#18181b" : lineOnColor(Number(id.split(":").at(-1))) }))}
            boardableCount={s.operationalLineIds.length}
            distance={location ? haversineKm(location.lat, location.lng, s.location.lat, s.location.lng) : undefined}
            onSetDest={() => router.push(stationRouteHref(s, "to", lang))} />
          {city === "all" && <Link className="inline-flex min-h-11 items-center gap-1.5 text-xs text-muted-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-primary" href={`/${s.cityId}/map?${new URLSearchParams({ station: s.localId, lang })}`}><MapIcon aria-hidden="true" className="size-3.5" />{t.tabMap}</Link>}
        </li>)}</ul>);
  return <div className="flex min-h-0 flex-1 flex-col" dir={lang === "fa" ? "rtl" : "ltr"} data-testid="city-explorer">
    <header className="shrink-0 border-b border-border px-4 py-3">
      <div className="mx-auto w-full max-w-xl">
        <h1 className="text-base font-bold md:text-lg">{title} · {t[view === "nearby" ? "tabNearby" : "tabStations"]}</h1>
        <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">{persianDigits(count.stations, lang)} {t.stops} · {persianDigits(count.lines, lang)} {t.cityLines}</p>
      </div>
    </header>
    {view === "nearby" ? <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 p-4">
        <NearbyLocation lang={lang} locating={locating} onLocate={requestGps}
          locationLabel={location ? stations.find(s => s.id === nearbyStationId)?.names[lang] ?? t.useMyLocation : ""}
          picker={<CityStationPicker id="city-nearby" stations={stations} value={nearbyStationId} lang={lang} placeholder={t.searchStations} accentClass="bg-primary" showCity={city === "all"}
            onChange={id => { const station = stations.find(s => s.id === id); setNearbyStationId(id); setLocation(station?.location ?? null); setGeoError(null); }} />}
          error={geoError && <LocationErrorActions lang={lang} kind={geoError} onRetry={requestGps} />} />
        {!location ? <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-12 text-center text-sm text-muted-foreground">{t.cityNearbyHint}</div>
          : <>{amenitiesFilter}<p className="text-xs text-muted-foreground">{t.cityStraightDistance}</p>{renderRows(filtered.filter(s => s.status === "operational").slice(0, 15))}</>}
      </div>
    </div> : <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <div className="mx-auto max-w-xl">
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input id="city-catalog-search" aria-label={t.searchStations} placeholder={t.searchStations} type="search" className="ios-no-zoom-input w-full rounded-xl border border-border bg-card py-3 ps-9 pe-3 text-sm outline-none ring-primary/30 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        {city === "all" && <fieldset className="mt-4" aria-label={t.chooseCity}>
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.chooseCity}</legend>
          <div className="flex flex-wrap gap-2">
            <FilterChip active={cityFilter === "all"} onClick={() => { setCityFilter("all"); setLineFilter(null); }}>{t.allCities}</FilterChip>
            {CITIES.filter(c => cityIds.includes(c.slug)).map(c => <FilterChip key={c.slug} active={cityFilter === c.slug} onClick={() => { setCityFilter(c.slug); setLineFilter(null); }}>{c.name[lang]}</FilterChip>)}
          </div>
        </fieldset>}
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.filterLine}</p>
          <div className="flex flex-wrap gap-2">
            <FilterChip active={lineFilter === null} onClick={() => setLineFilter(null)}>{t.all}</FilterChip>
            {CITY_LINES.filter(l => (effectiveCity === "all" || l.cityId === effectiveCity) && stations.some(s => s.lineIds.includes(l.id))).map(l => <FilterChip key={l.id} active={lineFilter === l.id} onClick={() => setLineFilter(l.id)} dot={l.color}>
              {city === "all" && `${CITIES.find(c => c.slug === l.cityId)!.name[lang]} · `}{t.line} {persianDigits(l.id.split(":").at(-1)!, lang)}
            </FilterChip>)}
          </div>
        </div>
        <div className="mt-4">{amenitiesFilter}</div>
        <p role="status" className="my-3 text-xs text-muted-foreground">{persianDigits(filtered.length, lang)} {t.stops}</p>
        {renderRows(filtered)}
        {!filtered.length && <p className="py-4">{t.noResults}</p>}
      </div>
    </div>}
  </div>;
}
