"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Loader2, Layers, Satellite, Building2, AlertTriangle, X, WifiOff } from "lucide-react";
import { useMetro } from "@/app/providers";
import { STATION_MAP, findRoute } from "@/lib/route";
import { useHolidayData } from "@/lib/holidays/use-holiday-data";
import { useConnectivity } from "@/lib/offline/use-connectivity";
import { STRINGS } from "@/lib/i18n";
import {
  haversineKm,
  formatDistance,
  estimateWalkMinutes,
  formatWalkTime,
  isTooFarToWalk,
  parsePlaceParam,
} from "@/lib/geo";
import { shortPlaceLabel } from "@/lib/geocoding";
import { StationDetail } from "@/components/station-detail";
import { cn } from "@/lib/utils";

// Feature flag: dismiss buttons on the map place info/warning cards.
// Disabled for now — set to true to re-enable. Dismiss logic below is kept intact.
const ENABLE_PLACE_CARD_DISMISS = false;

const RealMap = dynamic(
  () => import("@/components/real-map").then((m) => m.RealMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex size-full items-center justify-center text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
      </div>
    ),
  },
);

export function MapPage() {
  const searchParams = useSearchParams();
  const { lang, mapMode, setMapMode, originPlace: ctxOriginPlace, destPlace: ctxDestPlace } = useMetro();
  const { isHolidayDate } = useHolidayData();
  const t = STRINGS[lang];
  const isFa = lang === "fa";

  useEffect(() => {
    const title = isFa ? "نقشه مترو تهران" : "Tehran Metro Map";
    const suffix = isFa ? " | متو" : " | Metto";
    document.title = title + suffix;
  }, [isFa]);

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
    // fall back to in-session context (SPA nav).
    const originPin = parsePlaceParam(searchParams, "oP") ?? ctxOriginPlace;
    const destPin = parsePlaceParam(searchParams, "dP") ?? ctxDestPlace;
    return { center, zoom, station, from, to, originPin, destPlace: destPin };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const route = useMemo(() => {
    if (!initialParams.from || !initialParams.to || initialParams.from === initialParams.to) return null;
    return findRoute(initialParams.from, initialParams.to, { isHolidayDate });
  }, [initialParams.from, initialParams.to, isHolidayDate]);

  const placeMarkers = useMemo(() => {
    const markers: Array<{ lat: number; lng: number; label: string; role: "origin" | "dest"; stationId: string | null }> = [];
    if (initialParams.originPin) {
      markers.push({ ...initialParams.originPin, label: shortPlaceLabel(initialParams.originPin.label), role: "origin", stationId: initialParams.from });
    }
    if (initialParams.destPlace) {
      markers.push({ ...initialParams.destPlace, label: shortPlaceLabel(initialParams.destPlace.label), role: "dest", stationId: initialParams.to });
    }
    return markers;
  }, [initialParams]);

  const placeInfos = useMemo(() => {
    return placeMarkers
      .map((m) => {
        const station = m.stationId ? STATION_MAP.get(m.stationId) : null;
        if (!station) return null;
        const km = haversineKm(m.lat, m.lng, station.location.lat, station.location.lng);
        const walkMin = estimateWalkMinutes(km);
        return {
          role: m.role,
          label: m.label,
          stationName: isFa ? station.name.fa : station.name.en,
          distanceText: formatDistance(km, lang),
          walkText: formatWalkTime(walkMin, lang),
          tooFar: isTooFarToWalk(km),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [placeMarkers, isFa, lang]);

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
  const [saveNoticeSeen, setSaveNoticeSeen] = useState<boolean>(() => {
    try {
      return localStorage.getItem("metto.mapSaveNoticeSeen") === "1";
    } catch {
      return true;
    }
  });
  const [saveNoticeDismissed, setSaveNoticeDismissed] = useState(false);
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
  useEffect(() => {
    setDismissedKeys(new Set());
  }, [searchParams]);

  const visiblePlaceInfos = ENABLE_PLACE_CARD_DISMISS
    ? placeInfos.filter((p) => !dismissedKeys.has(`${p.role}:${p.label}`))
    : placeInfos;
  const [mapView, setMapView] = useState<{ center: [number, number]; zoom: number }>({
    center: initialParams.center,
    zoom: initialParams.zoom,
  });

  const selected = selectedId ? STATION_MAP.get(selectedId) : null;

  const handleViewChange = useCallback((center: [number, number], zoom: number) => {
    setMapView({ center, zoom });
  }, []);

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      <RealMap
        lang={lang}
        mapMode={mapMode}
        route={route}
        originId={initialParams.from}
        destId={initialParams.to}
        selectedId={selectedId}
        onSelect={setSelectedId}
        initialCenter={mapView.center}
        initialZoom={mapView.zoom}
        onViewChange={handleViewChange}
        placeMarkers={placeMarkers}
      />

      {/* Offline notice: purely connectivity-driven (never tile-error
          state), so it shows even when cached tiles render fine, hides on
          reconnect, and never flickers per tile. */}
      {isOffline && (
        <div className="absolute inset-x-3 top-14 z-[500] mx-auto flex max-w-md items-start gap-2 rounded-lg border border-border bg-background/95 px-3 py-2 text-xs shadow-sm backdrop-blur">
          <WifiOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground">{t.mapOfflineTitle}</p>
            <p className="mt-0.5 text-muted-foreground">{t.mapOfflineBody}</p>
          </div>
        </div>
      )}

      {/* One-time save notice: informational only, online only, never
          stacked with the offline banner. */}
      {showSaveNotice && (
        <div className="absolute inset-x-3 top-14 z-[500] mx-auto flex max-w-md items-start gap-2 rounded-lg border border-border bg-background/90 px-3 py-2 text-xs shadow-sm backdrop-blur">
          <Building2 className="mt-0.5 size-4 shrink-0 text-primary" />
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

      {visiblePlaceInfos.length > 0 && (
        <div
          className={cn(
            "absolute inset-x-3 z-[500] mx-auto flex max-w-md flex-col gap-1.5",
            isOffline ? "top-28" : "top-14",
          )}
        >
          {visiblePlaceInfos.map((p) => (
            <div
              key={`${p.role}:${p.label}`}
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
                <p className="truncate font-medium">{p.label}</p>
                <p className="mt-0.5 text-muted-foreground">
                  {t.nearestStation}: {p.stationName} · {p.distanceText} · ~{p.walkText} {t.walkTime}
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
      )}

      {/* Map mode toggle */}
      <div className="absolute top-3 left-3 z-[500] flex overflow-hidden rounded-lg border border-border bg-background/90 shadow-sm backdrop-blur">
        <button
          type="button"
          onClick={() => setMapMode("satellite")}
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
        <div className="absolute inset-x-3 bottom-3 z-[500] mx-auto max-w-md">
          <StationDetail
            station={selected}
            lang={lang}
            onClose={() => setSelectedId(null)}
          />
        </div>
      )}
    </div>
  );
}
