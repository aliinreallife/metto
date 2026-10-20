"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2, Layers, Satellite, Building2, AlertTriangle, Footprints, X, WifiOff } from "lucide-react";
import { useMetro } from "@/app/providers";
import { STATION_MAP, findRoute } from "@/lib/route";
import { useHolidayData } from "@/lib/holidays/use-holiday-data";
import { useScheduleData } from "@/lib/use-schedule-data";
import { useTripWalking } from "@/lib/walking/use-walking-route";
import { useRouteClock } from "@/lib/use-route-clock";
import { WalkingRouteInfo } from "@/components/walking-route-info";
import { useConnectivity } from "@/lib/offline/use-connectivity";
import { STRINGS } from "@/lib/i18n";
import {
  haversineKm,
  formatDistance,
  estimateWalkMinutes,
  formatWalkTime,
  isTooFarToWalk,
  parsePlaceParam,
  encodePlacePin,
  nearestStations,
} from "@/lib/geo";
import { displayPlaceLabel, reverseGeocode } from "@/lib/geocoding";
import { StationDetail } from "@/components/station-detail";
import { MapPickCard } from "@/components/map-pick-card";
import { WalkSuggestCard } from "@/components/route-panel";
import { directWalkVerdict } from "@/lib/route-planning";
import { cn } from "@/lib/utils";

// Feature flag: dismiss buttons on the map place info/warning cards.
// Disabled for now — set to true to re-enable. Dismiss logic below is kept intact.
const ENABLE_PLACE_CARD_DISMISS = false;

const RealMap = dynamic(
  () => import("@/components/real-map").then((m) => m.RealMap),
  {
    ssr: false,
    loading: () => (
      // Matches MINIMALIST_BG in real-map (literal to avoid importing leaflet on SSR).
      <div
        className="flex size-full items-center justify-center text-muted-foreground"
        style={{ backgroundColor: "#151515" }}
      >
        <Loader2 className="size-6 animate-spin" />
      </div>
    ),
  },
);

export function MapPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const {
    lang,
    mapMode,
    setMapMode,
    originPlace: ctxOriginPlace,
    destPlace: ctxDestPlace,
    setOriginId: setCtxOriginId,
    setDestId: setCtxDestId,
    setOriginPlace: setCtxOriginPlace,
    setDestPlace: setCtxDestPlace,
  } = useMetro();
  const { isHolidayDate } = useHolidayData();
  const t = STRINGS[lang];
  const isFa = lang === "fa";

  useEffect(() => {
    const title = isFa ? "نقشه مترو" : "Metro Map";
    const suffix = isFa ? " | متو" : " | metto";
    document.title = title + suffix;
  }, [isFa]);

  // Map-local clear gate: after an explicit clear, context place pins must
  // not resurrect as ghost pins. Context itself is never nulled here — that
  // would wipe the planner's persisted route state via provider effects.
  const [routeCleared, setRouteCleared] = useState(false);
  // Pending arbitrary pick (exact coordinates) + async resolved label.
  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(null);
  const [resolved, setResolved] = useState<{ lat: number; lng: number; label: string } | null>(null);

  // Reverse-geocode the pending pick (a localized place label until it resolves).
  // Only the async callback writes state, guarded by coordinate identity so
  // a late result can never overwrite a newer pick.
  useEffect(() => {
    if (!picked) return;
    const { lat, lng } = picked;
    let cancelled = false;
    reverseGeocode(lat, lng, lang).then((name) => {
      if (!cancelled && name) setResolved({ lat, lng, label: name });
    });
    return () => {
      cancelled = true;
    };
  }, [picked, lang]);

  const initialParams = useMemo(() => {
    const mapParam = searchParams.get("map");
    let center: [number, number] = [35.7, 51.38];
    let zoom = 11;
    if (mapParam) {
      const parts = mapParam.split(",").map(Number);
      if (parts.length === 3 && parts.every(Number.isFinite)) {
        center = [parts[0], parts[1]];
        zoom = parts[2];
      }
    }
    const station = searchParams.get("station");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    // Prefer shareable URL params (compact op/dp, legacy oPlat… fallback);
    // fall back to in-session context (SPA nav) unless the user explicitly
    // cleared this map view (routeCleared gate against ghost pins).
    const originPin = parsePlaceParam(searchParams, "oP") ?? (routeCleared ? null : ctxOriginPlace);
    const destPin = parsePlaceParam(searchParams, "dP") ?? (routeCleared ? null : ctxDestPlace);
    return { center, zoom, station, from, to, originPin, destPlace: destPin };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const scheduleLoaded = useScheduleData();
  const nowMs = useRouteClock();
  const route = useMemo(() => {
    if (!scheduleLoaded || !initialParams.from || !initialParams.to || initialParams.from === initialParams.to) return null;
    return findRoute(initialParams.from, initialParams.to, { isHolidayDate });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialParams.from, initialParams.to, isHolidayDate, scheduleLoaded, nowMs]);

  const placeMarkers = useMemo(() => {
    const markers: Array<{ lat: number; lng: number; label: string; role: "origin" | "dest"; stationId: string | null }> = [];
    if (initialParams.originPin) {
      markers.push({ ...initialParams.originPin, label: displayPlaceLabel(initialParams.originPin.label, lang), role: "origin", stationId: initialParams.from });
    }
    if (initialParams.destPlace) {
      markers.push({ ...initialParams.destPlace, label: displayPlaceLabel(initialParams.destPlace.label, lang), role: "dest", stationId: initialParams.to });
    }
    return markers;
  }, [initialParams, lang]);

  const originStation = initialParams.from ? STATION_MAP.get(initialParams.from)?.location : null;
  const destStation = initialParams.to ? STATION_MAP.get(initialParams.to)?.location : null;
  const walkOrigin = placeMarkers.find((point) => point.role === "origin") ?? originStation;
  const walkDest = placeMarkers.find((point) => point.role === "dest") ?? destStation;
  const walking = useTripWalking(walkOrigin, walkDest, originStation, destStation, route);
  const walkingPaths = useMemo(() => ({
    origin: walking.access.route?.coordinates,
    dest: walking.egress.route?.coordinates,
  }), [walking.access.route, walking.egress.route]);

  const placeInfos = useMemo(() => {
    return placeMarkers
      .map((m) => {
        const station = m.stationId ? STATION_MAP.get(m.stationId) : null;
        if (!station) return null;
        const street = m.role === "origin" ? walking.access.route : walking.egress.route;
        const km = street ? street.distanceMeters / 1000 : haversineKm(m.lat, m.lng, station.location.lat, station.location.lng);
        const walkMin = street ? street.durationSeconds / 60 : estimateWalkMinutes(km);
        return {
          role: m.role,
          label: m.label,
          stationName: isFa ? station.name.fa : station.name.en,
          distanceText: formatDistance(km, lang),
          walkText: formatWalkTime(walkMin, lang),
          approximate: !street,
          saved: m.role === "origin" ? walking.access.saved : walking.egress.saved,
          tooFar: isTooFarToWalk(km),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [placeMarkers, isFa, lang, walking.access.route, walking.egress.route, walking.access.saved, walking.egress.saved]);

  // Walking context for the pending pick (nearest station only informs the
  // card + route endpoints; the exact point stays the visible endpoint).
  const pickedInfo = useMemo(() => {
    if (!picked) return null;
    const nearest = nearestStations(picked.lat, picked.lng, { limit: 1 })[0];
    if (!nearest) return null;
    const km = haversineKm(picked.lat, picked.lng, nearest.station.location.lat, nearest.station.location.lng);
    const walkMin = estimateWalkMinutes(km);
    return {
      station: nearest.station,
      stationName: isFa ? nearest.station.name.fa : nearest.station.name.en,
      distanceText: formatDistance(km, lang),
      walkText: formatWalkTime(walkMin, lang),
    };
  }, [picked, isFa, lang]);

  const pickedLabel =
    picked && resolved && resolved.lat === picked.lat && resolved.lng === picked.lng
      ? displayPlaceLabel(resolved.label, lang)
      : picked
        ? t.selectedMapPoint
        : null;

  const [selectedId, setSelectedId] = useState<string | null>(initialParams.station);
  const [dismissedKeys, setDismissedKeys] = useState<ReadonlySet<string>>(new Set());
  // Effective connectivity (verified reachability, not just link state):
  // the banner shows only on confirmed offline — never during checking,
  // so a normal launch waiting ~ms for verification never flashes it.
  const { state: connectivity } = useConnectivity();
  const isOffline = connectivity === "offline";

  // One-time informational save notice: shown once per device while online,
  // remembered locally. Never stacked with the offline banner, never a
  // warning, no retention promises or implementation details.
  // Hydration-safe: deterministic hidden initial on SSR AND first client
  // render; localStorage is read only post-hydration. First-visit notice
  // appearing after mount is intended; SSR/client markup must agree.
  const [saveNoticeSeen, setSaveNoticeSeen] = useState<boolean>(true);
  const [saveNoticeDismissed, setSaveNoticeDismissed] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem("metto.mapSaveNoticeSeen") !== "1") {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- post-hydration localStorage read; the `true` initializer above keeps SSR/client markup identical.
        setSaveNoticeSeen(false);
      }
    } catch {
      // Storage unreadable — stay hidden (safe, no flash).
    }
  }, []);
  useEffect(() => {
    if (connectivity === "online" && !saveNoticeSeen) {
      try {
        localStorage.setItem("metto.mapSaveNoticeSeen", "1");
      } catch {
        // Private mode etc. — notice simply shows again next visit.
      }
    }
  }, [connectivity, saveNoticeSeen]);
  const showSaveNotice =
    connectivity === "online" && !saveNoticeSeen && !saveNoticeDismissed;
  function dismissSaveNotice() {
    setSaveNoticeDismissed(true);
    try {
      localStorage.setItem("metto.mapSaveNoticeSeen", "1");
    } catch {
      // Ignore.
    }
  }

  // A dismissed card stays dismissed for this search; a new search (URL change) brings cards back.
  // Render-adjust (not an effect) so the reset applies before paint.
  const [prevSearchParams, setPrevSearchParams] = useState(searchParams);
  if (prevSearchParams !== searchParams) {
    setPrevSearchParams(searchParams);
    setDismissedKeys(new Set());
  }

  const visiblePlaceInfos = ENABLE_PLACE_CARD_DISMISS
    ? placeInfos.filter((p) => !dismissedKeys.has(`${p.role}:${p.label}`))
    : placeInfos;

  // Same-station pins share one nearest station: merge the two cards into
  // one (both labels, station once, direct pin-to-pin walk) so the stack
  // never repeats itself.
  const mergedPlaceInfo = useMemo(() => {
    const origin = placeMarkers.find((m) => m.role === "origin");
    const dest = placeMarkers.find((m) => m.role === "dest");
    if (!origin || !dest) return null;
    const originStation = origin.stationId ? STATION_MAP.get(origin.stationId) : null;
    const destStation = dest.stationId ? STATION_MAP.get(dest.stationId) : null;
    if (!originStation || originStation.id !== destStation?.id) return null;
    const walkKm = walking.direct.route ? walking.direct.route.distanceMeters / 1000 : haversineKm(origin.lat, origin.lng, dest.lat, dest.lng);
    const walkMin = walking.direct.route ? walking.direct.route.durationSeconds / 60 : estimateWalkMinutes(walkKm);
    return {
      originLabel: origin.label,
      destLabel: dest.label,
      stationName: isFa ? originStation.name.fa : originStation.name.en,
      distanceText: formatDistance(walkKm, lang),
      walkText: formatWalkTime(walkMin, lang),
      approximate: !walking.direct.route,
      saved: walking.direct.saved,
      tooFar: isTooFarToWalk(walkKm),
    };
  }, [placeMarkers, isFa, lang, walking.direct.route, walking.direct.saved]);
  const [mapView, setMapView] = useState<{ center: [number, number]; zoom: number }>({
    center: initialParams.center,
    zoom: initialParams.zoom,
  });

  const selected = selectedId ? STATION_MAP.get(selectedId) : null;

  const handleViewChange = useCallback((center: [number, number], zoom: number) => {
    setMapView({ center, zoom });
  }, []);

  // Arbitrary-point pick: keep exact coords, drop station selection so only
  // one bottom card shows. Event-handler writes (no lint hazard).
  function handlePick(lat: number, lng: number) {
    setPicked({ lat, lng });
    setResolved(null);
    setSelectedId(null);
  }

  function handleSelect(id: string | null) {
    setSelectedId(id);
    if (id) setPicked(null);
  }

  // Legacy + compact route/selection params cleared by map-local clear.
  // `map` (viewport) is intentionally preserved.
  function clearedParams(): URLSearchParams {
    const params = new URLSearchParams(searchParams.toString());
    for (const k of [
      "from", "to", "op", "dp",
      "oPlat", "oPlng", "oPlabel",
      "dPlat", "dPlng", "dPlabel",
      "station",
    ]) {
      params.delete(k);
    }
    return params;
  }

  // Map-local clear: route overlay, pins, selection and URL params go away.
  // Context + localStorage are untouched, so the planner keeps its state.
  function clearRoute() {
    setPicked(null);
    setResolved(null);
    setSelectedId(null);
    setRouteCleared(true);
    const params = clearedParams();
    const qs = params.toString();
    router.replace(qs ? `/map?${qs}` : "/map");
  }

  // Set the pending exact point as an endpoint: nearest station drives the
  // metro route, the exact coordinate rides along as the place pin.
  function chooseEndpoint(role: "origin" | "dest") {
    if (!picked || !pickedLabel) return;
    const nearest = nearestStations(picked.lat, picked.lng, { limit: 1 })[0];
    if (!nearest) return;
    const pin = { lat: picked.lat, lng: picked.lng, label: pickedLabel };
    const params = new URLSearchParams(searchParams.toString());
    if (role === "origin") {
      params.set("from", nearest.station.id);
      params.set("op", encodePlacePin(pin));
      for (const k of ["oPlat", "oPlng", "oPlabel"]) params.delete(k);
      setCtxOriginId(nearest.station.id);
      setCtxOriginPlace(pin);
    } else {
      params.set("to", nearest.station.id);
      params.set("dp", encodePlacePin(pin));
      for (const k of ["dPlat", "dPlng", "dPlabel"]) params.delete(k);
      setCtxDestId(nearest.station.id);
      setCtxDestPlace(pin);
    }
    setRouteCleared(false);
    setPicked(null);
    setResolved(null);
    router.replace(`/map?${params.toString()}`);
  }

  const hasRouteState = !!(
    initialParams.from ||
    initialParams.to ||
    initialParams.originPin ||
    initialParams.destPlace ||
    selectedId ||
    picked
  );

  // Shared walk verdict (same helper as the planner): when walking directly
  // between the pins beats the metro, the map draws the walk line and shows
  // one toast saying so. The merged same-station card already carries that
  // message, so the toast only appears for the beats-metro case.
  const walkGuide = useMemo(() => {
    const origin = walkOrigin;
    const dest = walkDest;
    if (!origin || !dest) return null;
    const verdict = directWalkVerdict({
      origin: { lat: origin.lat, lng: origin.lng },
      dest: { lat: dest.lat, lng: dest.lng },
      sameStation:
        initialParams.from !== null && initialParams.from === initialParams.to,
      // A partial/no-service route is not a completed metro journey that
      // can support a "walking is faster" comparison.
      metroTotalSeconds: route?.status === "complete" ? route.totalSeconds : null,
      initialWaitSeconds: route?.initialWaitSeconds,
      accessMinutes: walking.accessMinutes,
      walkingRoute: walking.direct.route,
    });
    if (!verdict) return null;
    return {
      verdict,
      line: {
        from: { lat: origin.lat, lng: origin.lng },
        to: { lat: dest.lat, lng: dest.lng },
        coordinates: walking.direct.route?.coordinates,
      },
    };
  }, [walkOrigin, walkDest, initialParams.from, initialParams.to, route, walking.accessMinutes, walking.direct.route]);

  return (
    <div data-testid="map-route-state" data-route-start={route?.departedAtMs} className="relative isolate z-0 flex flex-1 min-h-0 flex-col overflow-hidden">
      <RealMap
        lang={lang}
        mapMode={mapMode}
        route={route}
        deemphasizeMetro={false}
        originId={initialParams.from}
        destId={initialParams.to}
        selectedId={selectedId}
        onSelect={handleSelect}
        onPickPoint={handlePick}
        onClearRoute={clearRoute}
        showClearRoute={hasRouteState}
        initialCenter={mapView.center}
        initialZoom={mapView.zoom}
        onViewChange={handleViewChange}
        placeMarkers={placeMarkers}
        pendingPick={picked && pickedLabel ? { ...picked, label: pickedLabel } : null}
        directWalk={walkGuide?.line ?? null}
        walkingPaths={walkingPaths}
      />

      {/* Top overlay stack: banner/notice/place cards lay out in normal
          flow inside ONE absolute container, so variable card heights
          (fa/en copy, font size, screen width) can never overlap. */}
      <div className="absolute inset-x-3 top-14 z-[500] mx-auto flex max-w-md flex-col gap-1.5">
        {/* Offline notice: purely connectivity-driven (never tile-error
            state), so it shows even when cached tiles render fine, hides on
            reconnect, and never flickers per tile. */}
        {isOffline && (
          <div
            data-testid="map-offline-banner"
            className="flex items-start gap-2 rounded-lg border border-border bg-background/95 px-3 py-2 text-xs shadow-sm backdrop-blur"
          >
            <WifiOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground">{t.mapOfflineTitle}</p>
              <p className="mt-0.5 text-muted-foreground">{t.mapOfflineBody}</p>
            </div>
          </div>
        )}

        {walkGuide?.verdict.kind === "beats-metro" && !mergedPlaceInfo && (
          <WalkSuggestCard
            lang={lang}
            walkMin={walkGuide.verdict.walkMin}
            distanceKm={walkGuide.verdict.walkKm}
            approximate={!walking.direct.route || walking.accessApproximate}
          />
        )}
        {(walkGuide || placeMarkers.length > 0) && (
          <WalkingRouteInfo lang={lang} onMap
            loading={walking.direct.loading || walking.access.loading || walking.egress.loading}
            hasPath={!!(walking.direct.route || walking.access.route || walking.egress.route)}
            saved={walking.direct.saved || walking.access.saved || walking.egress.saved} />
        )}

        {/* One-time save notice: informational only, online only, never
            stacked with the offline banner. */}
        {showSaveNotice && (
          <div className="flex items-start gap-2 rounded-lg border border-border bg-background/90 px-3 py-2 text-xs shadow-sm backdrop-blur">
            <Building2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground">{t.mapSaveTitle}</p>
              <p className="mt-0.5 text-muted-foreground">{t.mapSaveBody}</p>
            </div>
            <button
              type="button"
              onClick={dismissSaveNotice}
              aria-label={t.close}
              className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}

        {mergedPlaceInfo ? (
          <div
            key={`merged:${mergedPlaceInfo.originLabel}:${mergedPlaceInfo.destLabel}`}
            data-testid="map-place-card"
            className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15">
              <Footprints aria-hidden="true" className="size-5 text-primary" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold md:text-base">{t.walkBetweenPlaces}</p>
                {(mergedPlaceInfo.approximate || mergedPlaceInfo.saved) && (
                  <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
                    {mergedPlaceInfo.approximate ? t.walkRouteApproximateLabel : t.walkRouteSavedLabel}
                  </span>
                )}
              </div>
              <p className="tnum mt-0.5 truncate text-xs text-muted-foreground md:text-sm">
                {mergedPlaceInfo.originLabel}
                <span aria-hidden="true" className="mx-1.5">→</span>
                {mergedPlaceInfo.destLabel}
                {" · "}{mergedPlaceInfo.distanceText} · {mergedPlaceInfo.approximate ? "~" : ""}{mergedPlaceInfo.walkText} {t.walkTime}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t.nearestStation}: {mergedPlaceInfo.stationName}
              </p>
              {mergedPlaceInfo.tooFar && (
                <p className="mt-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                  {t.tooFarFromStation} (~{mergedPlaceInfo.walkText})
                </p>
              )}
            </div>
          </div>
        ) : visiblePlaceInfos.map((p) => (
          <div
            key={`${p.role}:${p.label}`}
            data-testid="map-place-card"
            className={cn(
              "flex items-start gap-2 rounded-lg border px-3 py-2 text-xs shadow-sm backdrop-blur",
              p.tooFar
                ? "border-amber-500/40 bg-background/95 text-foreground"
                : "border-border bg-background/90 text-foreground",
            )}
          >
            {p.tooFar ? (
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
            ) : (
              <Building2 className="mt-0.5 size-4 shrink-0 text-primary" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate font-medium">{p.label}</p>
                {(p.approximate || p.saved) && (
                  <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
                    {p.approximate ? t.walkRouteApproximateLabel : t.walkRouteSavedLabel}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-muted-foreground">
                {t.nearestStation}: {p.stationName} · {p.distanceText} · {p.approximate ? "~" : ""}{p.walkText} {t.walkTime}
              </p>
              {p.tooFar && (
                <p className="mt-0.5 font-medium text-amber-600 dark:text-amber-400">
                  {t.tooFarFromStation} (~{p.walkText})
                </p>
              )}
            </div>
            {ENABLE_PLACE_CARD_DISMISS && (
              <button
                type="button"
                onClick={() =>
                  setDismissedKeys((prev) => new Set(prev).add(`${p.role}:${p.label}`))
                }
                aria-label={t.close}
                className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Map mode toggle */}
      <div className="absolute top-3 left-3 z-[500] flex overflow-hidden rounded-lg border border-border bg-background/90 shadow-sm backdrop-blur" role="group" aria-label={t.mapMode}>
        <button
          type="button"
          onClick={() => setMapMode("satellite")}
          aria-pressed={mapMode === "satellite"}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors",
            mapMode === "satellite"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent",
          )}
        >
          <Satellite className="size-3.5" />
          {t.satellite}
        </button>
        <button
          type="button"
          onClick={() => setMapMode("minimalist")}
          aria-pressed={mapMode === "minimalist"}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors",
            mapMode === "minimalist"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent",
          )}
        >
          <Layers className="size-3.5" />
          {t.minimalist}
        </button>
      </div>

      {selected && (
        <div data-testid="map-station-card" className="absolute inset-x-3 bottom-3 z-[500] mx-auto max-w-md">
          <StationDetail
            station={selected}
            lang={lang}
            onClose={() => setSelectedId(null)}
          />
        </div>
      )}
      {picked && pickedInfo && pickedLabel && (
        <div className="absolute inset-x-3 bottom-3 z-[500] mx-auto max-w-md">
          <MapPickCard
            lang={lang}
            title={pickedLabel}
            stationName={pickedInfo.stationName}
            distanceText={pickedInfo.distanceText}
            walkText={pickedInfo.walkText}
            destPrimary={!!initialParams.from}
            onChooseOrigin={() => chooseEndpoint("origin")}
            onChooseDest={() => chooseEndpoint("dest")}
            onClose={() => {
              setPicked(null);
              setResolved(null);
            }}
          />
        </div>
      )}
    </div>
  );
}
