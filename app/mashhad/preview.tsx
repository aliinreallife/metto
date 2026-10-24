"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMetro } from "@/app/providers";
import { mashhadPreview } from "@/lib/mashhad-preview";
import { shortPlaceLabel } from "@/lib/geocoding";
import { STRINGS, type Lang } from "@/lib/i18n";
import { AppSkipLink } from "../(app)/skip-link";
import { useSearchParams } from "next/navigation";
import { LocateFixed, Loader2, Map as MapIcon } from "lucide-react";
import { RoutePlaceCard } from "@/components/route-place-card";
import { useTripWalking } from "@/lib/walking/use-walking-route";
import { WalkingRouteInfo } from "@/components/walking-route-info";
import { RouteFields } from "@/components/route-fields";
import { TimetableHelpNotice } from "@/components/timetable-help-notice";
import { RouteActions } from "@/components/route-actions";
import { PathRoutePanel } from "@/components/route-panel";
import { getCurrentPositionTolerant, classifyGeoError, type GeoErrorKind } from "@/lib/geolocation";
import { haversineKm, parsePlaceParam, encodePlacePin } from "@/lib/geo";
import { LocationErrorActions } from "@/components/location-error";
import { CityStationPicker } from "@/components/city-station-picker";
import { catalogStations } from "@/lib/city-catalog";

const byId = new Map(mashhadPreview.stations.map(s => [s.id, s]));
const stations = catalogStations(["mashhad"]);
const control = "min-h-[44px] rounded-lg border bg-background px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export function MashhadPreview({ initialFrom: fromProp, initialTo: toProp, initialLang: langProp, embedded = false }: {
  initialFrom?: string; initialTo?: string; initialLang?: Lang; embedded?: boolean;
}) {
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
      const savedFrom = localStorage.getItem("mashhad.route.from");
      const savedTo = localStorage.getItem("mashhad.route.to");
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
    if (url.href !== window.location.href) window.history.replaceState(null, "", url);
    try {
      if (from) localStorage.setItem("mashhad.route.from", from);
      if (to) localStorage.setItem("mashhad.route.to", to);
    } catch { /* storage optional */ }
  }, [from, to, lang, initialLang, preferredLang]);
  const originPin = useMemo(() => from ? parsePlaceParam(params, "oP") : null, [from, params]);
  const destPin = useMemo(() => to ? parsePlaceParam(params, "dP") : null, [to, params]);
  const originStation = byId.get(from), destStation = byId.get(to);
  const walking = useTripWalking(originPin ?? originStation?.location, destPin ?? destStation?.location,
    originStation?.location, destStation?.location, null);
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
  const mapParams = new URLSearchParams({ from, to, lang });
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
  const result = useMemo(() => mashhadPreview.findPath(from, to), [from, to]);
  const name = (id: string) => byId.get(id)?.names[lang] ?? id;
  const Container = embedded ? "div" : "main";

  return <>
    {!embedded && <AppSkipLink />}
    <Container id={embedded ? undefined : "main-content"} tabIndex={-1} data-testid="city-path-preview"
      className="no-scrollbar flex size-full flex-col overflow-y-auto overflow-x-hidden overscroll-contain p-4 md:items-center md:p-8 lg:p-10"
      lang={lang} dir={lang === "fa" ? "rtl" : "ltr"}>
      <div className="flex w-full max-w-xl flex-col gap-4 md:max-w-2xl md:gap-5">
        <h1 className="sr-only">{t.cityPreviewTitle}</h1>
        {!embedded && <button type="button" className={control} onClick={() => {
          const next = lang === "fa" ? "en" : "fa"; setSelectedLang(next); setLang(next);
        }}>{lang === "fa" ? "English" : "فارسی"}</button>}
        <section aria-label={t.findRoute} className="flex flex-col gap-2.5">
          <RouteFields lang={lang} originId="city-from" destinationId="city-to"
            origin={<CityStationPicker id="city-from" placeSearchCity="mashhad" onPlaceSelect={place => selectPlace(place, "origin")} stations={stations} value={from} lang={lang} placeholder={t.searchStations} accentClass="bg-primary" onChange={id => { setFrom(id); clearPin("origin"); setInvalidLink(false); }} />}
            destination={<CityStationPicker id="city-to" placeSearchCity="mashhad" onPlaceSelect={place => selectPlace(place, "dest")} stations={stations} value={to} lang={lang} placeholder={t.searchStations} accentClass="bg-foreground" onChange={id => { setTo(id); clearPin("dest"); setInvalidLink(false); }} />}
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
          {(originPin || destPin) && <>
            <WalkingRouteInfo lang={lang} loading={walking.access.loading || walking.egress.loading || walking.direct.loading} hasPath={!!(walking.access.route || walking.egress.route || walking.direct.route)} saved={walking.access.saved || walking.egress.saved || walking.direct.saved} />
            <Link href={`/mashhad/map?${mapParams}`} className="flex items-center justify-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm font-medium text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary md:py-2.5 md:text-base"><MapIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />{t.viewOnMap}</Link>
          </>}
          {invalidLink ? <p role="alert" className="mt-3 text-sm">{t.cityPreviewInvalidLink}</p>
            : from && to && from === to ? <p role="alert" className="mt-3 text-sm">{t.sameStation}</p>
              : from && to && !result ? <p role="alert" className="mt-3 text-sm">{t.noRoute}</p>
                : !result ? <p className="mt-4 rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">{t.pickBoth}</p> : null}
        </section>
        {result && <section aria-label={t.routeOverview} data-testid="city-route-result">
          <PathRoutePanel lang={lang} stationCount={result.stationIds.length} name={name}
            legs={result.legs.map(leg => ({ line: Number(leg.lineId.split(":").at(-1)), stations: leg.stationIds,
              terminal: mashhadPreview.getTerminal(leg.lineId, leg.stationIds[0], leg.stationIds.at(-1)!) ?? leg.stationIds.at(-1)!,
              color: mashhadPreview.lines.find(l => l.id === leg.lineId)!.color, onColor: "#18181b" }))} />
          <div className="mt-3"><RouteActions origin={{ name: byId.get(from)!.names, location: byId.get(from)!.location }} lang={lang} /></div>
        </section>}
        <TimetableHelpNotice lang={lang} />
        <div className="h-16 shrink-0 md:hidden" aria-hidden="true" />
      </div>
    </Container>
  </>;
}
