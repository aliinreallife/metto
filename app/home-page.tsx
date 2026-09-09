"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowUpDown,
  Building2,
  Loader2,
  ExternalLink,
  Database,
  LocateFixed,
  Map as MapIcon,
  X,
} from "lucide-react";
import { useVisitorData } from "@fingerprint/react";
import { StationCombobox } from "@/components/station-combobox";
import { RoutePanel } from "@/components/route-panel";
import { RouteActions } from "@/components/route-actions";
import { StationDetail } from "@/components/station-detail";
import { useMetro } from "@/app/providers";
import { STATION_MAP, findRoute } from "@/lib/route";
import { useScheduleData } from "@/lib/use-schedule-data";
import { reverseGeocode } from "@/lib/geocoding";
import {
  nearestStations,
  formatDistance,
  haversineKm,
  estimateWalkMinutes,
  formatWalkTime,
  buildMapHref,
} from "@/lib/geo";
import { STRINGS, type Lang } from "@/lib/i18n";

export type PlaceInfo = {
  placeName: string;
  stationId: string;
  distanceKm: number;
  lat: number;
  lng: number;
};

function parsePlaceParam(
  searchParams: URLSearchParams,
  prefix: "oP" | "dP",
): { lat: number; lng: number; label: string } | null {
  const lat = Number(searchParams.get(`${prefix}lat`));
  const lng = Number(searchParams.get(`${prefix}lng`));
  const label = searchParams.get(`${prefix}label`);
  if (!label || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, label };
}

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
  const { getData } = useVisitorData({ immediate: true });
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

  const initialFrom = searchParams.get("from");
  const initialTo = searchParams.get("to");

  const [originId, setOriginId] = useState<string | null>(initialFrom);
  const [destId, setDestId] = useState<string | null>(initialTo);

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
    const title = isFa ? "مسیریابی مترو تهران" : "Tehran Metro Route Planner";
    const suffix = isFa ? " | متو" : " | Metto";
    document.title = title + suffix;
  }, [isFa]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (originId) params.set("from", originId);
    if (destId) params.set("to", destId);
    if (originPlaceInfo) {
      params.set("oPlat", String(originPlaceInfo.lat));
      params.set("oPlng", String(originPlaceInfo.lng));
      params.set("oPlabel", originPlaceInfo.placeName);
    }
    if (destPlaceInfo) {
      params.set("dPlat", String(destPlaceInfo.lat));
      params.set("dPlng", String(destPlaceInfo.lng));
      params.set("dPlabel", destPlaceInfo.placeName);
    }
    const qs = params.toString();
    const url = qs ? `?${qs}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [originId, destId, originPlaceInfo, destPlaceInfo]);

  const route = useMemo(() => {
    if (!originId || !destId || originId === destId) return null;
    return findRoute(originId, destId);
  }, [originId, destId, loaded]);

  function swap() {
    setOriginId(destId);
    setDestId(originId);
    setOriginPlaceInfo(destPlaceInfo);
    setDestPlaceInfo(originPlaceInfo);
  }

  function handlePlaceSelect(place: { lat: number; lng: number; name: string }, asOrigin: boolean) {
    const nearest = nearestStations(place.lat, place.lng, { limit: 1 });
    if (nearest.length === 0) return;

    const station = nearest[0].station;
    const km = haversineKm(place.lat, place.lng, station.location.lat, station.location.lng);
    const info: PlaceInfo = {
      placeName: place.name,
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

      <div className="z-20 flex items-center justify-start gap-4 border-t border-border bg-card/90 px-4 py-2 backdrop-blur">
        <a
          href="https://github.com/aliinreallife"
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
  const [locating, setLocating] = useState(false);
  const gpsLangRef = useRef(lang);
  gpsLangRef.current = lang;

  function locateOrigin() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
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
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
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
    <div className="flex size-full flex-col overflow-y-auto p-4 md:items-center md:p-8 lg:p-10">
      <div className="flex w-full max-w-xl flex-col gap-4 md:max-w-2xl md:gap-5">
        <div className="flex flex-col gap-2.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground md:text-sm">
            {t.from}
          </label>
          <div className="flex gap-2">
            <div className="flex-1">
              <StationCombobox
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
              className="flex w-9 shrink-0 self-stretch items-center justify-center rounded-lg border border-border bg-background transition-colors hover:bg-accent disabled:opacity-50"
            >
              {locating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <LocateFixed className="size-4" />
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
          <label className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:text-sm">
            {t.to}
          </label>
          <div className="flex gap-2">
            <div className="flex-1">
              <StationCombobox
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
              className="flex w-9 shrink-0 self-stretch items-center justify-center rounded-lg border border-border bg-background transition-colors hover:bg-accent"
            >
              <ArrowUpDown className="size-4" />
            </button>
          </div>
          {destPlaceInfo && (
            <PlaceCard
              lang={lang}
              info={destPlaceInfo}
              onClear={clearDestPlace}
            />
          )}
          {showViewOnMap && (
            <Link
              href={mapHref}
              className="flex items-center justify-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent md:py-2.5 md:text-base"
            >
              <MapIcon className="size-4 shrink-0 text-primary" />
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

        {route ? (
          <>
            <RoutePanel route={route} lang={lang} />
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
                <LocateFixed className="inline size-3.5 shrink-0" />
                {isFa
                  ? "ضربه بزنید تا نزدیک‌ترین ایستگاه مبدأ شود"
                  : "to set your nearest station as origin"}
              </p>
            )}
          </div>
        ) : null}

        {originId && destId && originId !== destId && !route && (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
            {t.noRoute}
          </p>
        )}
      </div>
    </div>
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
      <Building2 className="size-4 shrink-0 text-primary md:size-5" />
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium">{info.placeName}</span>
        <span className="mx-1.5 text-muted-foreground">→</span>
        <span>
          {t.nearestStation}: <span className="font-medium">{stationName}</span>
        </span>
        <span className="ml-1.5 text-muted-foreground">
          ({formatDistance(info.distanceKm, lang)} · ~{formatWalkTime(walkMin, lang)} {t.walkTime})
        </span>
      </span>
      <button
        type="button"
        onClick={onClear}
        aria-label={t.clear}
        className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
