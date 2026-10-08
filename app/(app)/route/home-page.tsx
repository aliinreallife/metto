"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowUpDown,
  Building2,
  ChevronDown,
  ChevronRight,
  Clock,
  History,
  Loader2,
  ExternalLink,
  Database,
  LocateFixed,
  Map as MapIcon,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { StationCombobox } from "@/components/station-combobox";
import { NoServiceCard, RoutePanel } from "@/components/route-panel";
import { RouteActions } from "@/components/route-actions";
import { StationDetail } from "@/components/station-detail";
import {
  TimePreferenceSheet,
  formatPlanSummary,
} from "@/components/time-preference-sheet";
import { useMetro } from "@/app/providers";
import { TabLink } from "@/app/nav";
import { STATION_MAP, findRoute } from "@/lib/route";
import {
  applyTimeParams,
  parseTimeModeParams,
  planRoute,
  type TimeMode,
} from "@/lib/route-planning";
import { useScheduleData } from "@/lib/use-schedule-data";
import { useHolidayData } from "@/lib/holidays/use-holiday-data";
import { reverseGeocode, shortPlaceLabel } from "@/lib/geocoding";
import {
  nearestStations,
  formatDistance,
  haversineKm,
  estimateWalkMinutes,
  formatWalkTime,
  buildMapHref,
  encodePlacePin,
  parsePlaceParam,
} from "@/lib/geo";
import { STRINGS, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useConnectivity } from "@/lib/offline/use-connectivity";
import {
  classifyGeoError,
  getCurrentPositionTolerant,
  type GeoErrorKind,
} from "@/lib/geolocation";
import { LocationErrorActions } from "@/components/location-error";

export type PlaceInfo = {
  placeName: string;
  stationId: string;
  distanceKm: number;
  lat: number;
  lng: number;
};

function buildPlaceInfo(
  pin: { lat: number; lng: number; label: string },
  stationId: string | null,
): PlaceInfo | null {
  const station = stationId ? STATION_MAP.get(stationId) : null;
  if (!station) return null;
  return {
    placeName: pin.label,
    stationId: station.id,
    distanceKm: haversineKm(pin.lat, pin.lng, station.location.lat, station.location.lng),
    lat: pin.lat,
    lng: pin.lng,
  };
}

function readStoredPlaceInfo(storageKey: string, stationId: string | null): PlaceInfo | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw || !stationId) return null;
    const pin: unknown = JSON.parse(raw);
    if (
      typeof pin !== "object" ||
      pin === null ||
      !Number.isFinite((pin as { lat: number }).lat) ||
      !Number.isFinite((pin as { lng: number }).lng) ||
      typeof (pin as { label: string }).label !== "string" ||
      (pin as { label: string }).label.length === 0
    ) {
      return null;
    }
    return buildPlaceInfo(pin as { lat: number; lng: number; label: string }, stationId);
  } catch {
    return null;
  }
}

export function HomePage() {
  const loaded = useScheduleData();
  const { isHolidayDate } = useHolidayData();
  const {
    lang,
    setOriginId: setCtxOrigin,
    setDestId: setCtxDest,
    setOriginPlace: setCtxOriginPlace,
    setDestPlace: setCtxDestPlace,
  } = useMetro();
  const isFa = lang === "fa";
  const t = STRINGS[lang];
  const searchParams = useSearchParams();
  // Shared connectivity state for the offline-safe footer tab links.
  const { state: connectivity } = useConnectivity();

  const initialFrom = searchParams.get("from");
  const initialTo = searchParams.get("to");

  const [originId, setOriginId] = useState<string | null>(initialFrom);
  const [destId, setDestId] = useState<string | null>(initialTo);

  // Advanced time planning (?timeMode=now|depart|arrive&at=ISO). Old links
  // without time params keep meaning "now".
  const [timeMode, setTimeMode] = useState<TimeMode>(
    () => parseTimeModeParams(searchParams).mode,
  );
  const [planAtMs, setPlanAtMs] = useState<number | null>(
    () => parseTimeModeParams(searchParams).at?.getTime() ?? null,
  );
  // Refreshing clock so a selected time visibly passes (past-time states).
  // Only wired into advanced-mode routing; "now" never re-routes on a tick.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (timeMode === "now") return;
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [timeMode]);

  // Restore place pins from shareable URL params (?oPlat/oPlng/oPlabel…).
  const [originPlaceInfo, setOriginPlaceInfo] = useState<PlaceInfo | null>(() => {
    const pin = parsePlaceParam(searchParams, "oP");
    return pin ? buildPlaceInfo(pin, initialFrom) : null;
  });
  const [destPlaceInfo, setDestPlaceInfo] = useState<PlaceInfo | null>(() => {
    const pin = parsePlaceParam(searchParams, "dP");
    return pin ? buildPlaceInfo(pin, initialTo) : null;
  });

  // Merge persisted selections (localStorage) for anything the URL didn't
  // provide — covers reloads and links shared without place params.
  // (Runs on mount only; URL always wins.)
  useEffect(() => {
    try {
      // Remember that this browser has used the planner: the landing page
      // fast-paths returning visitors straight back here (see welcome-page).
      localStorage.setItem("route.seen", "1");
      if (!searchParams.get("from")) {
        const saved = localStorage.getItem("route.from");
        if (saved) setOriginId(saved);
      }
      if (!searchParams.get("to")) {
        const saved = localStorage.getItem("route.to");
        if (saved) setDestId(saved);
      }
      if (!parsePlaceParam(searchParams, "oP")) {
        const info = readStoredPlaceInfo("route.originPlace", searchParams.get("from") ?? localStorage.getItem("route.from"));
        if (info) setOriginPlaceInfo(info);
      }
      if (!parsePlaceParam(searchParams, "dP")) {
        const info = readStoredPlaceInfo("route.destPlace", searchParams.get("to") ?? localStorage.getItem("route.to"));
        if (info) setDestPlaceInfo(info);
      }
    } catch {
      // Corrupted storage — ignore and start fresh.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync route + place state to MetroContext so nav can build dynamic map link
  useEffect(() => {
    setCtxOrigin(originId);
    setCtxDest(destId);
  }, [originId, destId, setCtxOrigin, setCtxDest]);
  useEffect(() => {
    setCtxOriginPlace(
      originPlaceInfo
        ? { lat: originPlaceInfo.lat, lng: originPlaceInfo.lng, label: originPlaceInfo.placeName }
        : null,
    );
  }, [originPlaceInfo, setCtxOriginPlace]);
  useEffect(() => {
    setCtxDestPlace(
      destPlaceInfo
        ? { lat: destPlaceInfo.lat, lng: destPlaceInfo.lng, label: destPlaceInfo.placeName }
        : null,
    );
  }, [destPlaceInfo, setCtxDestPlace]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.lang = isFa ? "fa" : "en";
    document.documentElement.dir = isFa ? "rtl" : "ltr";
  }, [isFa]);

  useEffect(() => {
    const title = isFa ? "مسیریابی مترو" : "Metro Route Planner";
    const suffix = isFa ? " | متو" : " | metto";
    document.title = title + suffix;
  }, [isFa]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (originId) params.set("from", originId);
    if (destId) params.set("to", destId);
    if (originPlaceInfo) {
      params.set("op", encodePlacePin({ lat: originPlaceInfo.lat, lng: originPlaceInfo.lng, label: originPlaceInfo.placeName }));
    }
    if (destPlaceInfo) {
      params.set("dp", encodePlacePin({ lat: destPlaceInfo.lat, lng: destPlaceInfo.lng, label: destPlaceInfo.placeName }));
    }
    applyTimeParams(params, timeMode, planAtMs !== null ? new Date(planAtMs) : null);
    const qs = params.toString();
    const url = qs ? `?${qs}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [originId, destId, originPlaceInfo, destPlaceInfo, timeMode, planAtMs]);

  // Tick only invalidates advanced-mode routing (past transitions + plan
  // freshness); "now" keeps its historical compute-once behavior.
  const planTick = timeMode === "now" ? 0 : nowMs;
  // A selected time in the past is never silently clamped: the UI shows an
  // explicit "time has passed" state instead of routing from a moved instant.
  const isPastTime =
    timeMode !== "now" && planAtMs !== null && planAtMs < nowMs;

  const route = useMemo(() => {
    if (!originId || !destId || originId === destId) return null;
    if (isPastTime) return null;
    if (timeMode !== "now") {
      if (planAtMs === null) return null;
      const at = new Date(planAtMs);
      // Holiday-aware: same local resolver the server uses (offline dataset,
      // never a network request inside routing).
      return planRoute(
        originId,
        destId,
        timeMode === "depart" ? { mode: "depart-at", at } : { mode: "arrive-by", at },
        { isHolidayDate },
      );
    }
    // Holiday-aware: same local resolver the server uses (offline dataset,
    // never a network request inside routing).
    return findRoute(originId, destId, { isHolidayDate });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originId, destId, loaded, isHolidayDate, timeMode, planAtMs, planTick]);

  function swap() {
    setOriginId(destId);
    setDestId(originId);
    setOriginPlaceInfo(destPlaceInfo);
    setDestPlaceInfo(originPlaceInfo);
  }

  function useNow() {
    setTimeMode("now");
    setPlanAtMs(null);
  }

  function handlePlaceSelect(place: { lat: number; lng: number; name: string }, asOrigin: boolean) {
    const nearest = nearestStations(place.lat, place.lng, { limit: 1 });
    if (nearest.length === 0) return;

    const station = nearest[0].station;
    const km = haversineKm(place.lat, place.lng, station.location.lat, station.location.lng);
    // Short names keep shared links small; the map shortens them anyway.
    const info: PlaceInfo = {
      placeName: shortPlaceLabel(place.name),
      stationId: station.id,
      distanceKm: km,
      lat: place.lat,
      lng: place.lng,
    };

    if (asOrigin) {
      setOriginId(station.id);
      setOriginPlaceInfo(info);
    } else {
      setDestId(station.id);
      setDestPlaceInfo(info);
    }
  }

  function clearOriginPlace() {
    setOriginPlaceInfo(null);
  }

  function clearDestPlace() {
    setDestPlaceInfo(null);
  }

  return (
    <div className="flex size-full flex-col bg-background text-foreground">
      <div className="relative min-h-0 flex-1">
        <RouteView
          lang={lang}
          originId={originId}
          destId={destId}
          selectedId={selectedId}
          route={route}
          timeMode={timeMode}
          planAtMs={planAtMs}
          nowMs={nowMs}
          isPastTime={isPastTime}
          setTimeMode={setTimeMode}
          setPlanAtMs={setPlanAtMs}
          onUseNow={useNow}
          setOriginId={setOriginId}
          setDestId={setDestId}
          setSelectedId={setSelectedId}
          originPlaceInfo={originPlaceInfo}
          destPlaceInfo={destPlaceInfo}
          onPlaceSelect={handlePlaceSelect}
          clearOriginPlace={clearOriginPlace}
          clearDestPlace={clearDestPlace}
          onGpsOrigin={(info, onlyIfSameCoords) =>
            setOriginPlaceInfo((prev) => {
              if (!onlyIfSameCoords) return info;
              return prev && prev.lat === info.lat && prev.lng === info.lng ? info : prev;
            })
          }
          swap={swap}
        />
      </div>

      <div className="z-20 hidden flex-wrap items-center justify-start gap-x-4 gap-y-1 border-t border-border bg-card/90 px-4 py-2 backdrop-blur md:flex">
        <a
          href="https://github.com/aliinreallife/metto"
          target="_blank"
          rel="noopener noreferrer"
          className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[10px] transition-colors hover:text-foreground"
        >
          <ExternalLink className="size-3 text-primary" />
          <span className="text-muted-foreground">{t.builtBy}</span>
          <span className="font-semibold text-foreground">aliinreallife</span>
          <span className="sr-only"> ({t.opensInNewTab})</span>
        </a>
        <a
          href="https://github.com/mostafa-kheibary/tehran-metro-data"
          target="_blank"
          rel="noopener noreferrer"
          className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[10px] transition-colors hover:text-foreground"
        >
          <Database className="size-3 text-primary" />
          <span className="text-muted-foreground">{t.dataBy}</span>
          <span className="font-semibold text-foreground">
            mostafa-kheibary
          </span>
          <span className="sr-only"> ({t.opensInNewTab})</span>
        </a>
        {/* Offline-safe tab links: client navigation online, full-document
            navigation from precache offline (same TabLink as the nav). */}
        <TabLink
          href="/#donate"
          connectivity={connectivity}
          className="shrink-0 whitespace-nowrap text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {t.supportLink}
        </TabLink>
      </div>
    </div>
  );
}

function RouteView({
  lang,
  originId,
  destId,
  selectedId,
  route,
  timeMode,
  planAtMs,
  nowMs,
  isPastTime,
  setTimeMode,
  setPlanAtMs,
  onUseNow,
  setOriginId,
  setDestId,
  setSelectedId,
  originPlaceInfo,
  destPlaceInfo,
  onPlaceSelect,
  clearOriginPlace,
  clearDestPlace,
  onGpsOrigin,
  swap,
}: {
  lang: Lang;
  originId: string | null;
  destId: string | null;
  selectedId: string | null;
  route: ReturnType<typeof findRoute>;
  timeMode: TimeMode;
  planAtMs: number | null;
  nowMs: number;
  isPastTime: boolean;
  setTimeMode: (mode: TimeMode) => void;
  setPlanAtMs: (ms: number | null) => void;
  onUseNow: () => void;
  setOriginId: (id: string | null) => void;
  setDestId: (id: string | null) => void;
  setSelectedId: (id: string | null) => void;
  originPlaceInfo: PlaceInfo | null;
  destPlaceInfo: PlaceInfo | null;
  onPlaceSelect: (place: { lat: number; lng: number; name: string }, asOrigin: boolean) => void;
  clearOriginPlace: () => void;
  clearDestPlace: () => void;
  onGpsOrigin: (info: PlaceInfo, onlyIfSameCoords?: boolean) => void;
  swap: () => void;
}) {
  const t = STRINGS[lang];
  const isFa = lang === "fa";
  const selected = selectedId ? STATION_MAP.get(selectedId) : null;
  const stationDisplayName = (id: string) => {
    const s = STATION_MAP.get(id);
    return s ? (isFa ? s.name.fa : s.name.en) : id;
  };
  const [locating, setLocating] = useState(false);
  const [gpsError, setGpsError] = useState<GeoErrorKind | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const gpsLangRef = useRef(lang);
  gpsLangRef.current = lang;

  async function locateOrigin() {
    if (!navigator.geolocation) {
      setGpsError("unsupported");
      return;
    }
    setLocating(true);
    setGpsError(null);
    try {
      const { lat: latitude, lng: longitude } =
        await getCurrentPositionTolerant();
      const nearest = nearestStations(latitude, longitude, { limit: 1 });
      if (nearest.length === 0) {
        setLocating(false);
        return;
      }
      const station = nearest[0].station;
      // GPS origin becomes a place-style card (like Iran Mall) so it
      // sticks across tabs/reloads via the same place persistence.
      onGpsOrigin({
        placeName: t.yourLocation,
        stationId: station.id,
        distanceKm: haversineKm(latitude, longitude, station.location.lat, station.location.lng),
        lat: latitude,
        lng: longitude,
      });
      setOriginId(station.id);
      setLocating(false);
      // Upgrade the generic label to the neighborhood name when available.
      // Guarded by coords so a newer selection is never overwritten.
      const requestLang = gpsLangRef.current;
      reverseGeocode(latitude, longitude, requestLang).then((name) => {
        if (!name) return;
        onGpsOrigin(
          {
            placeName: name,
            stationId: station.id,
            distanceKm: haversineKm(latitude, longitude, station.location.lat, station.location.lng),
            lat: latitude,
            lng: longitude,
          },
          true,
        );
      });
    } catch (err) {
      setGpsError(classifyGeoError(err));
      setLocating(false);
    }
  }

  const mapHref = buildMapHref({
    from: originId,
    to: destId,
    originPlace: originPlaceInfo
      ? { lat: originPlaceInfo.lat, lng: originPlaceInfo.lng, label: originPlaceInfo.placeName }
      : null,
    destPlace: destPlaceInfo
      ? { lat: destPlaceInfo.lat, lng: destPlaceInfo.lng, label: destPlaceInfo.placeName }
      : null,
  });
  const showViewOnMap = originPlaceInfo !== null || destPlaceInfo !== null;

  return (
    <div className="no-scrollbar flex size-full flex-col overflow-y-auto overflow-x-hidden overscroll-contain p-4 md:items-center md:p-8 lg:p-10">
      <div className="flex w-full max-w-xl flex-col gap-4 md:max-w-2xl md:gap-5">
        <div className="flex flex-col gap-2.5">
          <label htmlFor="origin-combobox" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground md:text-sm">
            {t.from}
          </label>
          <div className="flex gap-2">
            <div className="flex-1">
              <StationCombobox
                id="origin-combobox"
                value={originId}
                onChange={(id) => {
                  setOriginId(id);
                  clearOriginPlace();
                }}
                onPlaceSelect={(p) => onPlaceSelect(p, true)}
                placeholder={t.origin}
                lang={lang}
                accentClass="bg-primary"
              />
            </div>
            <button
              type="button"
              onClick={locateOrigin}
              disabled={locating}
              aria-label={t.useMyLocation}
              className="flex w-9 shrink-0 self-stretch items-center justify-center rounded-lg border border-border bg-background transition-colors hover:bg-accent disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {locating ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <LocateFixed aria-hidden="true" className="size-4" />
              )}
            </button>
          </div>
          {originPlaceInfo && (
            <PlaceCard
              lang={lang}
              info={originPlaceInfo}
              onClear={clearOriginPlace}
            />
          )}
          {gpsError && (
            <LocationErrorActions
              lang={lang}
              kind={gpsError}
              onRetry={locateOrigin}
            />
          )}
          <label htmlFor="dest-combobox" className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:text-sm">
            {t.to}
          </label>
          <div className="flex gap-2">
            <div className="flex-1">
              <StationCombobox
                id="dest-combobox"
                value={destId}
                onChange={(id) => {
                  setDestId(id);
                  clearDestPlace();
                }}
                onPlaceSelect={(p) => onPlaceSelect(p, false)}
                placeholder={t.destination}
                lang={lang}
                accentClass="bg-foreground"
              />
            </div>
            <button
              type="button"
              onClick={() => swap()}
              aria-label={t.swap}
              className="flex w-9 shrink-0 self-stretch items-center justify-center rounded-lg border border-border bg-background transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <ArrowUpDown aria-hidden="true" className="size-4" />
            </button>
          </div>
          {destPlaceInfo && (
            <PlaceCard
              lang={lang}
              info={destPlaceInfo}
              onClear={clearDestPlace}
            />
          )}
          <AdvancedRoutingSection
            lang={lang}
            timeMode={timeMode}
            planAtMs={planAtMs}
            nowMs={nowMs}
            onOpen={() => setSheetOpen(true)}
          />
          {showViewOnMap && (
            <Link
              href={mapHref}
              className="flex items-center justify-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:py-2.5 md:text-base"
            >
              <MapIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
              {t.viewOnMap}
            </Link>
          )}
        </div>

        {selected ? (
          <StationDetail
            station={selected}
            lang={lang}
            onClose={() => setSelectedId(null)}
          />
        ) : null}

        {isPastTime ? (
          <div
            role="alert"
            className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 md:px-4"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
              <History aria-hidden="true" className="size-4 text-muted-foreground" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">
                {timeMode === "depart" ? t.timePassedTitle : t.arrivalPassedTitle}
              </p>
              <p className="text-xs text-muted-foreground">
                {timeMode === "depart" ? t.timePassedBody : t.arrivalPassedBody}
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-1.5">
              <button
                type="button"
                onClick={onUseNow}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t.useNow}
              </button>
              <button
                type="button"
                onClick={() => setSheetOpen(true)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t.editTime}
              </button>
            </div>
          </div>
        ) : route && route.status === "no_service" ? (
          <>
            <NoServiceCard
              lang={lang}
              stationName={stationDisplayName(route.reachableUntilStationId)}
              reachableUntil={route.reachableUntil}
              isOrigin={route.reachableUntilStationId === originId}
              onPlanAnotherTime={() => setSheetOpen(true)}
            />
            {originId && (() => {
              const origin = STATION_MAP.get(originId);
              if (!origin) return null;
              return <RouteActions origin={origin} lang={lang} />;
            })()}
          </>
        ) : route ? (
          <>
            <RoutePanel
              route={route}
              lang={lang}
              plan={
                timeMode !== "now" && planAtMs !== null
                  ? { mode: timeMode, atMs: planAtMs }
                  : undefined
              }
            />
            {originId && (() => {
              const origin = STATION_MAP.get(originId);
              if (!origin) return null;
              return <RouteActions origin={origin} lang={lang} />;
            })()}
          </>
        ) : !selected ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground md:px-5 md:py-8 md:text-base">
            <p>
              {originId && destId && originId === destId
                ? t.sameStation
                : t.pickBoth}
            </p>
            {!originId && (
              <p className="mt-2 flex flex-wrap items-center justify-center gap-1 text-xs">
                {isFa ? "یا روی" : "or tap"}
                <LocateFixed aria-hidden="true" className="inline size-3.5 shrink-0" />
                {isFa
                  ? "ضربه بزنید تا نزدیک‌ترین ایستگاه مبدأ شود"
                  : "to set your nearest station as origin"}
              </p>
            )}
          </div>
        ) : null}

        {originId && destId && originId !== destId && !route && !isPastTime && (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
            {timeMode === "arrive" ? t.noJourneyBy : t.noRoute}
          </p>
        )}

        {/* clearance so scrolled-to-bottom content isn't hidden behind the fixed mobile credits */}
        <div aria-hidden className="h-7 shrink-0 md:hidden" />
      </div>
      {sheetOpen && (
        <TimePreferenceSheet
          lang={lang}
          mode={timeMode}
          atMs={planAtMs}
          onClose={() => setSheetOpen(false)}
          onApply={(mode, nextAtMs) => {
            setTimeMode(mode);
            setPlanAtMs(nextAtMs);
            setSheetOpen(false);
          }}
        />
      )}
    </div>
  );
}

function AdvancedRoutingSection({
  lang,
  timeMode,
  planAtMs,
  nowMs,
  onOpen,
}: {
  lang: Lang;
  timeMode: TimeMode;
  planAtMs: number | null;
  nowMs: number;
  onOpen: () => void;
}) {
  const t = STRINGS[lang];
  // An active shared/reloaded plan starts expanded so it stays visible.
  const [open, setOpen] = useState(() => timeMode !== "now");
  const active =
    timeMode !== "now" && planAtMs !== null
      ? formatPlanSummary(lang, planAtMs, nowMs)
      : null;
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="advanced-routing-panel"
        className="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:py-2.5 md:text-base"
      >
        <SlidersHorizontal
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground"
        />
        <span className="font-medium">{t.advancedRouting}</span>
        {active && (
          <span className="tnum min-w-0 flex-1 truncate text-start text-xs text-muted-foreground">
            {active.dateLabel} · {active.timeLabel}
          </span>
        )}
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "ms-auto size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div id="advanced-routing-panel" className="border-t border-border p-2">
          <TimeControlButton
            lang={lang}
            timeMode={timeMode}
            planAtMs={planAtMs}
            nowMs={nowMs}
            onOpen={onOpen}
          />
        </div>
      )}
    </div>
  );
}

function TimeControlButton({
  lang,
  timeMode,
  planAtMs,
  nowMs,
  onOpen,
}: {
  lang: Lang;
  timeMode: TimeMode;
  planAtMs: number | null;
  nowMs: number;
  onOpen: () => void;
}) {
  const t = STRINGS[lang];
  const summary =
    timeMode === "now" || planAtMs === null ? (
      <span className="font-semibold">{t.timeNow}</span>
    ) : (
      <span className="min-w-0 flex-1 truncate">
        <span className="font-semibold">
          {timeMode === "depart" ? t.timeDepartChoice : t.timeArriveChoice}
        </span>{" "}
        <span className="tnum text-muted-foreground">
          {formatPlanSummary(lang, planAtMs, nowMs).dateLabel} ·{" "}
          {formatPlanSummary(lang, planAtMs, nowMs).timeLabel}
        </span>
      </span>
    );
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t.when}
      className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:py-2.5 md:text-base"
    >
      <Clock aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      {summary}
      <ChevronRight
        aria-hidden="true"
        className="ms-auto size-4 shrink-0 text-muted-foreground rtl:rotate-180"
      />
    </button>
  );
}

function PlaceCard({
  lang,
  info,
  onClear,
}: {
  lang: Lang;
  info: PlaceInfo;
  onClear: () => void;
}) {
  const t = STRINGS[lang];
  const isFa = lang === "fa";
  const station = STATION_MAP.get(info.stationId);
  const stationName = station ? (isFa ? station.name.fa : station.name.en) : info.stationId;
  const walkMin = estimateWalkMinutes(info.distanceKm);

  // Warnings live on the /map page only — this card stays a single line.
  return (
    <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm md:gap-3 md:px-4 md:py-2.5 md:text-base">
      <Building2 aria-hidden="true" className="size-4 shrink-0 text-primary md:size-5" />
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium">{info.placeName}</span>
        <span aria-hidden="true" className="mx-1.5 text-muted-foreground">→</span>
        <span>
          {t.nearestStation}: <span className="font-medium">{stationName}</span>
        </span>
        <span className="ms-1.5 text-muted-foreground">
          {" "}({formatDistance(info.distanceKm, lang)} · ~{formatWalkTime(walkMin, lang)} {t.walkTime})
        </span>
      </span>
      <button
        type="button"
        onClick={onClear}
        aria-label={t.clear}
        className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <X aria-hidden="true" className="size-3.5" />
      </button>
    </div>
  );
}
