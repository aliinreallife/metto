"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMetro } from "@/app/providers";
import { getCityPreview, getUntimedCityPlanner } from "@/lib/city-previews";
import { getCityMeta, type CityId } from "@/lib/cities";
import { shortPlaceLabel } from "@/lib/geocoding";
import { STRINGS, type Lang } from "@/lib/i18n";
import { AppSkipLink } from "@/app/(app)/skip-link";
import { useSearchParams } from "next/navigation";
import { Database, ExternalLink, LocateFixed, Loader2, Map as MapIcon } from "lucide-react";
import { cityDataCredit } from "@/lib/data-credit";
import { RoutePlaceCard } from "@/components/route-place-card";
import { useTripWalking } from "@/lib/walking/use-walking-route";
import { WalkingRouteInfo } from "@/components/walking-route-info";
import { RouteFields } from "@/components/route-fields";
import { TimetableHelpNotice } from "@/components/timetable-help-notice";
import { RouteActions } from "@/components/route-actions";
import { recordRouteSuccess } from "@/lib/app-rating";
import { PathRoutePanel, PastTimeNotice, SameStationNotice, WalkSuggestCard } from "@/components/route-panel";
import { getCurrentPositionTolerant, classifyGeoError, type GeoErrorKind } from "@/lib/geolocation";
import { haversineKm, parsePlaceParam, encodePlacePin } from "@/lib/geo";
import { LocationErrorActions } from "@/components/location-error";
import { CityStationPicker } from "@/components/city-station-picker";
import { catalogStations, CITY_LINES } from "@/lib/city-catalog";

import { IsfahanJourney } from "./isfahan-times";
import { TabrizJourney } from "./tabriz-times";
import { TravelTimeCard } from "./travel-time-card";
import { useRouteClock } from "@/lib/use-route-clock";
import { parseTimeModeParams, applyTimeParams, seedNextFiveMinutes, directWalkVerdict, type TimeMode } from "@/lib/route-planning";
import { useHolidayData } from "@/lib/holidays/use-holiday-data";
import { findIsfahanTrips } from "@/lib/isfahan-timetable";
import { findTabrizTrips } from "@/lib/tabriz-timetable";
import { tehranMinuteToInstant, parseServiceTimeToMinutes } from "@/lib/tehran-time";

// Any new public OR preview city that declares a timetable must register a
// source-backed journey adapter. Do not silently downgrade it to an untimed
// geometric path (which would invent a departure/arrival experience).
const TIMETABLED_CITY_JOURNEYS: Record<Exclude<CityId, "tehran">, typeof IsfahanJourney | null> = {
  mashhad: null,
  isfahan: IsfahanJourney,
  tabriz: TabrizJourney,
};

const control = "min-h-[44px] rounded-lg border bg-background px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export function CityRoute({ city, initialFrom: fromProp, initialTo: toProp, initialLang: langProp, embedded = false }: {
  city: Exclude<CityId, "tehran">; initialFrom?: string; initialTo?: string; initialLang?: Lang; embedded?: boolean;
}) {
  const planner = getUntimedCityPlanner(city)!;
  const reviewOnly = !!getCityPreview(city);
  const hasTimetable = getCityMeta(city)!.timing;
  const TimetabledJourney = TIMETABLED_CITY_JOURNEYS[city];
  const stations = useMemo(() => catalogStations([city]), [city]);
  const byId = useMemo(() => new Map(planner.stations.map(s => [s.id, s])), [planner]);
  const params = useSearchParams();
  const initialFrom = fromProp ?? params.get("from") ?? undefined;
  const initialTo = toProp ?? params.get("to") ?? undefined;
  const requestedLang = params.get("lang");
  const initialLang = langProp ?? (requestedLang === "fa" || requestedLang === "en" ? requestedLang : undefined);
  const { lang: preferredLang, setLang } = useMetro();
  // A shared URL's language must also win on the server/first render, before
  // the provider hydrates the saved preference. This avoids rewriting it.
  const [selectedLang, setSelectedLang] = useState<Lang | undefined>(initialLang);
  const languageReady = useRef(!initialLang);
  const lang = embedded ? preferredLang : selectedLang ?? preferredLang;
  const t = STRINGS[lang];
  const preference = parseTimeModeParams(new URLSearchParams(params.toString()));
  // Preserve links published with the earlier Iran-local datetime field.
  const legacyAt = params.get("at") ?? "";
  const legacyMs = !params.has("timeMode") && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(legacyAt)
    ? tehranMinuteToInstant(legacyAt.slice(0, 10), parseServiceTimeToMinutes(legacyAt.slice(11))) : null;
  const [timeMode, setTimeMode] = useState<TimeMode>(legacyMs !== null ? "depart" : preference.mode);
  const [planAtMs, setPlanAtMs] = useState<number | null>(legacyMs ?? preference.at?.getTime() ?? null);
  const [timeExpanded, setTimeExpanded] = useState(() => legacyMs !== null || preference.mode !== "now");
  const timeCardRef = useRef<HTMLDivElement>(null);
  function expandTimeCard() {
    setTimeExpanded(true);
    requestAnimationFrame(() => timeCardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }
  const nowMs = useRouteClock();
  const { dataset: holidayDataset } = useHolidayData();
  // Match Tehran: never display a journey that would depart at a time already in the past.
  const isPastTime = hasTimetable && timeMode !== "now" && planAtMs !== null && planAtMs < nowMs;
  const plannedAt = timeMode === "now" ? undefined : planAtMs ?? undefined;
  function selectTimeMode(mode: TimeMode) {
    setTimeMode(mode);
    if (mode === "now") { setPlanAtMs(null); return; }
    if (planAtMs === null) {
      const seed = seedNextFiveMinutes(Date.now());
      setPlanAtMs(tehranMinuteToInstant(seed.dateStr, seed.hh * 60 + seed.mm));
    }
  }
  const [locating, setLocating] = useState(false);
  const [gpsError, setGpsError] = useState<GeoErrorKind | null>(null);
  const [from, setFrom] = useState(byId.has(initialFrom ?? "") ? initialFrom! : "");
  const [to, setTo] = useState(byId.has(initialTo ?? "") ? initialTo! : "");
  const [invalidLink, setInvalidLink] = useState(Boolean(
    (initialFrom && !byId.has(initialFrom)) || (initialTo && !byId.has(initialTo)),
  ));
  useEffect(() => { if (initialLang) setLang(initialLang); }, [initialLang, setLang]);
  useEffect(() => {
    let active = true;
    try {
      const savedFrom = localStorage.getItem(`${city}.route.from`);
      const savedTo = localStorage.getItem(`${city}.route.to`);
      queueMicrotask(() => {
        if (!active) return;
        if (!initialFrom && savedFrom && byId.has(savedFrom)) setFrom(savedFrom);
        if (!initialTo && savedTo && byId.has(savedTo)) setTo(savedTo);
      });
    } catch { /* storage optional */ }
    return () => { active = false; };
    // Restore only on mount; explicit city-scoped URLs win.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!languageReady.current) {
      if (preferredLang !== initialLang) return;
      languageReady.current = true;
    }
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries({ from, to, lang })) {
      if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
    }
    if (city === "isfahan") applyTimeParams(url.searchParams, timeMode, planAtMs === null ? null : new Date(planAtMs));
    if (url.href !== window.location.href) window.history.replaceState(null, "", url);
    try {
      if (from) localStorage.setItem(`${city}.route.from`, from);
      if (to) localStorage.setItem(`${city}.route.to`, to);
    } catch { /* storage optional */ }
  }, [from, to, lang, initialLang, preferredLang, city, timeMode, planAtMs]);
  const originPin = useMemo(() => from ? parsePlaceParam(params, "oP") : null, [from, params]);
  const destPin = useMemo(() => to ? parsePlaceParam(params, "dP") : null, [to, params]);
  const originStation = byId.get(from), destStation = byId.get(to);
  const route = useMemo(() =>
    from && to && from !== to ? planner.findPath(from, to) : null,
    [from, to, planner]);
  // City adapters supply the source-backed time; every timed city receives
  // Tehran's walking-comparison and same-station behavior from the template.
  const published = useMemo(() => {
    if (!route || isPastTime) return null;
    const options = { arriveBy: timeMode === "arrive", notBeforeMs: nowMs };
    if (city === "isfahan") return findIsfahanTrips(from, to, plannedAt ?? nowMs, holidayDataset, options);
    if (city === "tabriz") return findTabrizTrips(from, to, plannedAt ?? nowMs, holidayDataset, options);
    return null;
  }, [city, route, from, to, plannedAt, nowMs, holidayDataset, timeMode, isPastTime]);
  const publishedTrip = published?.applicable && !published.blocked ? published.trips[0] : undefined;
  const lastCountedRouteKey = useRef<string | null>(null);
  useEffect(() => {
    if (!hasTimetable || !publishedTrip || isPastTime) return;
    const key = `${city}|${from}|${to}|${timeMode}|${planAtMs ?? "now"}`;
    if (lastCountedRouteKey.current === key) return;
    lastCountedRouteKey.current = key;
    try { recordRouteSuccess(new Date()); } catch { /* rating is best-effort */ }
  }, [hasTimetable, publishedTrip, isPastTime, city, from, to, timeMode, planAtMs]);
  const waitSeconds = publishedTrip
    ? Math.max(0, Math.round((publishedTrip.departureMs - (plannedAt ?? nowMs)) / 1000))
    : 0;
  const metroWalkPlan = publishedTrip
    ? { status: "complete" as const, totalSeconds: waitSeconds + publishedTrip.minutes * 60,
        initialWaitSeconds: waitSeconds }
    : null;
  const originPoint = originPin ?? originStation?.location;
  const destPoint = destPin ?? destStation?.location;
  const walking = useTripWalking(originPoint, destPoint, originStation?.location,
    destStation?.location, metroWalkPlan);
  const walkVerdict = directWalkVerdict({
    origin: originPoint, dest: destPoint, sameStation: !!from && from === to,
    metroTotalSeconds: metroWalkPlan?.totalSeconds ?? null,
    initialWaitSeconds: metroWalkPlan?.initialWaitSeconds,
    accessMinutes: walking.accessMinutes,
    walkingRoute: walking.accessApproximate ? null : walking.direct.route,
  });
  function clearPin(role: "origin" | "dest") {
    const url = new URL(window.location.href);
    for (const key of role === "origin" ? ["op", "oPlat", "oPlng", "oPlabel"] : ["dp", "dPlat", "dPlng", "dPlabel"]) url.searchParams.delete(key);
    window.history.replaceState(null, "", url);
  }
  function selectPlace(place: { lat: number; lng: number; name: string }, role: "origin" | "dest") {
    const nearest = [...stations].sort((a, b) => haversineKm(place.lat, place.lng, a.location.lat, a.location.lng) - haversineKm(place.lat, place.lng, b.location.lat, b.location.lng))[0];
    if (!nearest) return;
    clearPin(role);
    const url = new URL(window.location.href);
    url.searchParams.set(role === "origin" ? "op" : "dp", encodePlacePin({ lat: place.lat, lng: place.lng, label: shortPlaceLabel(place.name) }));
    window.history.replaceState(null, "", url);
    if (role === "origin") setFrom(nearest.id); else setTo(nearest.id);
    setInvalidLink(false);
  }
  function swap() {
    const url = new URL(window.location.href);
    for (const key of ["op", "dp", "oPlat", "oPlng", "oPlabel", "dPlat", "dPlng", "dPlabel"]) url.searchParams.delete(key);
    if (destPin) url.searchParams.set("op", encodePlacePin(destPin));
    if (originPin) url.searchParams.set("dp", encodePlacePin(originPin));
    window.history.replaceState(null, "", url);
    setFrom(to); setTo(from); setInvalidLink(false);
  }
  const mapParams = new URLSearchParams({ lang });
  if (from) mapParams.set("from", from);
  if (to) mapParams.set("to", to);
  if (hasTimetable) applyTimeParams(mapParams, timeMode, planAtMs !== null ? new Date(planAtMs) : null);
  if (originPin) mapParams.set("op", encodePlacePin(originPin));
  if (destPin) mapParams.set("dp", encodePlacePin(destPin));
  const locateOrigin = async () => {
    setLocating(true); setGpsError(null);
    try {
      const point = await getCurrentPositionTolerant();
      const nearest = [...stations].sort((a, b) => haversineKm(point.lat, point.lng, a.location.lat, a.location.lng) - haversineKm(point.lat, point.lng, b.location.lat, b.location.lng))[0];
      if (nearest) {
        setFrom(nearest.id); setInvalidLink(false);
        const url = new URL(window.location.href); url.searchParams.set("op", encodePlacePin({ ...point, label: t.useMyLocation }));
        window.history.replaceState(null, "", url);
      }
    } catch (error) { setGpsError(classifyGeoError(error)); }
    finally { setLocating(false); }
  };
  const result = route;
  const name = (id: string) => byId.get(id)?.names[lang] ?? id;
  const Container = embedded ? "div" : "main";

  return <>
    {!embedded && <AppSkipLink />}
    <div className="flex size-full min-h-0 flex-col">
    <Container id={embedded ? undefined : "main-content"} tabIndex={-1} data-testid="city-path-preview"
      className="no-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-contain p-4 md:items-center md:p-8 lg:p-10"
      lang={lang} dir={lang === "fa" ? "rtl" : "ltr"}>
      <div className="flex w-full max-w-xl flex-col gap-4 md:max-w-2xl md:gap-5">
        <h1 className="sr-only">{getCityMeta(city)!.name[lang]} · {t.findRoute}</h1>
        {!embedded && <button type="button" className={control} onClick={() => {
          const next = lang === "fa" ? "en" : "fa"; setSelectedLang(next); setLang(next);
        }}>{lang === "fa" ? "English" : "فارسی"}</button>}
        <section aria-label={t.findRoute} className="flex flex-col gap-2.5">
          <RouteFields lang={lang} originId="city-from" destinationId="city-to"
            origin={<CityStationPicker id="city-from" placeSearchCity={city} onPlaceSelect={place => selectPlace(place, "origin")} stations={stations} value={from} lang={lang} placeholder={t.searchStations} accentClass="bg-primary" onChange={id => { setFrom(id); clearPin("origin"); setInvalidLink(false); }} />}
            destination={<CityStationPicker id="city-to" placeSearchCity={city} onPlaceSelect={place => selectPlace(place, "dest")} stations={stations} value={to} lang={lang} placeholder={t.searchStations} accentClass="bg-foreground" onChange={id => { setTo(id); clearPin("dest"); setInvalidLink(false); }} />}
            originAction={<button type="button" aria-label={t.useMyLocation} disabled={locating} onClick={locateOrigin}
              className="flex w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background transition-colors hover:bg-accent disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary">
              {locating ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <LocateFixed aria-hidden="true" className="size-4" />}
            </button>}
            afterOrigin={<>
              {originPin && originStation && <RoutePlaceCard lang={lang} placeName={originPin.label} stationName={originStation.names[lang]}
                distanceKm={haversineKm(originPin.lat, originPin.lng, originStation.location.lat, originStation.location.lng)} walkingRoute={walking.access.route} onClear={() => clearPin("origin")} />}
              {gpsError && <LocationErrorActions lang={lang} kind={gpsError} onRetry={locateOrigin} />}
            </>}
            afterDestination={destPin && destStation && <RoutePlaceCard lang={lang} placeName={destPin.label} stationName={destStation.names[lang]}
              distanceKm={haversineKm(destPin.lat, destPin.lng, destStation.location.lat, destStation.location.lng)} walkingRoute={walking.egress.route} onClear={() => clearPin("dest")} />}
            onSwap={swap} />
          {(originPin || destPin || walkVerdict) && (
            <WalkingRouteInfo lang={lang} loading={walking.access.loading || walking.egress.loading || walking.direct.loading} hasPath={!!(walking.access.route || walking.egress.route || walking.direct.route)} saved={walking.access.saved || walking.egress.saved || walking.direct.saved} />
          )}
          {!invalidLink && !isPastTime && !!route && (!hasTimetable || !!publishedTrip) && (
            <Link href={`/${city}/map?${mapParams}`} className="flex items-center justify-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm font-medium text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary md:py-2.5 md:text-base"><MapIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />{t.viewOnMap}</Link>
          )}
          {hasTimetable && <div ref={timeCardRef} className="scroll-mt-4"><TravelTimeCard lang={lang} timeMode={timeMode} planAtMs={planAtMs} nowMs={nowMs}
            expanded={timeExpanded} onToggle={() => setTimeExpanded(value => !value)} onModeChange={selectTimeMode} onPlanAtMs={setPlanAtMs} /></div>}
          {isPastTime && <PastTimeNotice lang={lang} mode={timeMode === "depart" ? "depart" : "arrive"}
            onUseNow={() => { setTimeMode("now"); setPlanAtMs(null); }} onEditTime={expandTimeCard} />}
          {invalidLink ? <p role="alert" className="mt-3 text-sm">{t.cityPreviewInvalidLink}</p>
            : from && to && from === to ? null
              : from && to && !result ? <p role="alert" className="mt-3 text-sm">{t.noRoute}</p>
                : !result ? <SameStationNotice lang={lang} sameStation={false} fromSelected={!!from} /> : null}
        </section>
        {!isPastTime && !invalidLink && from && to && from === to && <div className="flex flex-col gap-3" data-testid="city-same-station">
          {walkVerdict?.kind === "same-station" && <WalkSuggestCard lang={lang}
            walkMin={walkVerdict.walkMin} distanceKm={walkVerdict.walkKm}
            approximate={!walking.direct.route} sameStation />}
          <SameStationNotice lang={lang} fromSelected sameStation />
        </div>}
        {!isPastTime && result && <section aria-label={t.routeOverview} data-testid="city-route-result">
          {walkVerdict?.kind === "beats-metro" && <div className="mb-3"><WalkSuggestCard lang={lang}
            walkMin={walkVerdict.walkMin} distanceKm={walkVerdict.walkKm}
            approximate={!walking.direct.route || walking.accessApproximate} /></div>}
          {hasTimetable ? (TimetabledJourney ? <TimetabledJourney stationIds={result.stationIds} plannedAt={plannedAt}
            published={published} nowMs={nowMs}
            arriveBy={timeMode === "arrive"} onEditTime={expandTimeCard}
            onUseNow={() => { setTimeMode("now"); setPlanAtMs(null); }}
            lang={lang} stationCount={result.stationIds.length} name={name}
            legs={result.legs.map(leg => ({ line: Number(leg.lineId.split(":").at(-1)), stations: leg.stationIds,
              terminal: planner.getTerminal(leg.lineId, leg.stationIds[0], leg.stationIds.at(-1)!) ?? leg.stationIds.at(-1)!,
              color: planner.lines.find(l => l.id === leg.lineId)!.color, onColor: CITY_LINES.find(l => l.id === leg.lineId)!.onColor }))} />
            : <p role="alert" className="rounded-xl border border-border bg-card px-4 py-5 text-sm">{t.noRoute}</p>)
            : <PathRoutePanel lang={lang} stationCount={result.stationIds.length} name={name}
              legs={result.legs.map(leg => ({ line: Number(leg.lineId.split(":").at(-1)), stations: leg.stationIds,
                terminal: planner.getTerminal(leg.lineId, leg.stationIds[0], leg.stationIds.at(-1)!) ?? leg.stationIds.at(-1)!,
                color: planner.lines.find(l => l.id === leg.lineId)!.color, onColor: CITY_LINES.find(l => l.id === leg.lineId)!.onColor }))} />}
          {(!reviewOnly || hasTimetable) && <div className="mt-3"><RouteActions origin={{ name: byId.get(from)!.names, location: byId.get(from)!.location }} lang={lang} /></div>}
        </section>}
        {city === "mashhad" && <TimetableHelpNotice lang={lang} />}
        <div className="h-16 shrink-0 md:hidden" aria-hidden="true" />
      </div>
    </Container>
    {embedded && hasTimetable && <footer role="contentinfo" className="hidden flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-card/90 px-4 py-2 backdrop-blur md:flex">
      <a href="https://github.com/aliinreallife/metto" target="_blank" rel="noopener noreferrer"
        className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[10px] transition-colors hover:text-foreground">
        <ExternalLink aria-hidden="true" className="size-3 text-primary" />
        <span className="text-muted-foreground">{t.builtBy}</span>
        <span className="font-semibold text-foreground">aliinreallife</span>
        <span className="sr-only"> ({t.opensInNewTab})</span>
      </a>
      <a href={cityDataCredit(city).url} target="_blank" rel="noopener noreferrer"
        className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[10px] transition-colors hover:text-foreground">
        <Database aria-hidden="true" className="size-3 text-primary" />
        <span className="text-muted-foreground">{t.dataBy}</span>
        <span className="font-semibold text-foreground">{cityDataCredit(city).name}</span>
        <span className="sr-only"> ({t.opensInNewTab})</span>
      </a>
      <Link href="/#donate" className="shrink-0 whitespace-nowrap text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground">{t.supportLink}</Link>
    </footer>}
    </div>
  </>;
}
