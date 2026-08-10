"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowUpDown,
  Building2,
  Loader2,
  MapPin,
  Share2,
  Check,
  ExternalLink,
  Database,
  LocateFixed,
  X,
} from "lucide-react";
import { useVisitorData } from "@fingerprint/react";
import { StationCombobox } from "@/components/station-combobox";
import { RoutePanel } from "@/components/route-panel";
import { StationDetail } from "@/components/station-detail";
import { useMetro } from "@/app/providers";
import { STATION_MAP, findRoute } from "@/lib/route";
import { useScheduleData } from "@/lib/use-schedule-data";
import { geoUrl, nearestStations, formatDistance, haversineKm } from "@/lib/geo";
import { STRINGS, type Lang } from "@/lib/i18n";

export function HomePage() {
  const loaded = useScheduleData();
  const { getData } = useVisitorData({ immediate: true });
  const { lang, setOriginId: setCtxOrigin, setDestId: setCtxDest } = useMetro();
  const isFa = lang === "fa";
  const t = STRINGS[lang];
  const searchParams = useSearchParams();

  const initialFrom = searchParams.get("from");
  const initialTo = searchParams.get("to");

  const [originId, setOriginId] = useState<string | null>(initialFrom);
  const [destId, setDestId] = useState<string | null>(initialTo);

  // Sync route state to MetroContext so nav can build dynamic map link
  useEffect(() => {
    setCtxOrigin(originId);
    setCtxDest(destId);
  }, [originId, destId, setCtxOrigin, setCtxDest]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placeMarkers, setPlaceMarkers] = useState<Array<{ lat: number; lng: number; label: string; role: "origin" | "dest" }>>([]);
  const [originPlaceInfo, setOriginPlaceInfo] = useState<{
    placeName: string;
    stationName: string;
    distanceKm: number;
  } | null>(null);
  const [destPlaceInfo, setDestPlaceInfo] = useState<{
    placeName: string;
    stationName: string;
    distanceKm: number;
  } | null>(null);

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
    const qs = params.toString();
    const url = qs ? `?${qs}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [originId, destId]);

  const route = useMemo(() => {
    if (!originId || !destId || originId === destId) return null;
    return findRoute(originId, destId);
  }, [originId, destId, loaded]);

  function swap() {
    setOriginId(destId);
    setDestId(originId);
    setOriginPlaceInfo(destPlaceInfo);
    setDestPlaceInfo(originPlaceInfo);
    setPlaceMarkers((prev) =>
      prev.map((m) => ({ ...m, role: m.role === "origin" ? "dest" : "origin" })),
    );
  }

  function handlePlaceSelect(place: { lat: number; lng: number; name: string }, asOrigin: boolean) {
    const nearest = nearestStations(place.lat, place.lng, { limit: 1 });
    if (nearest.length === 0) return;

    const station = nearest[0].station;
    const km = haversineKm(place.lat, place.lng, station.lat, station.lng);
    const info = {
      placeName: place.name,
      stationName: isFa ? station.fa : station.name,
      distanceKm: km,
    };

    if (asOrigin) {
      setOriginId(station.id);
      setOriginPlaceInfo(info);
    } else {
      setDestId(station.id);
      setDestPlaceInfo(info);
    }

    setPlaceMarkers((prev) => [
      ...prev.filter((m) => m.role !== (asOrigin ? "origin" : "dest")),
      { lat: place.lat, lng: place.lng, label: place.name, role: asOrigin ? "origin" : "dest" },
    ]);
  }

  function clearOriginPlace() {
    setOriginPlaceInfo(null);
    setPlaceMarkers((prev) => prev.filter((m) => m.role !== "origin"));
  }

  function clearDestPlace() {
    setDestPlaceInfo(null);
    setPlaceMarkers((prev) => prev.filter((m) => m.role !== "dest"));
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
  originPlaceInfo: { placeName: string; stationName: string; distanceKm: number } | null;
  destPlaceInfo: { placeName: string; stationName: string; distanceKm: number } | null;
  onPlaceSelect: (place: { lat: number; lng: number; name: string }, asOrigin: boolean) => void;
  clearOriginPlace: () => void;
  clearDestPlace: () => void;
  swap: () => void;
}) {
  const t = STRINGS[lang];
  const isFa = lang === "fa";
  const selected = selectedId ? STATION_MAP.get(selectedId) : null;
  const [locating, setLocating] = useState(false);
  const [copied, setCopied] = useState(false);

  function locateOrigin() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const nearest = nearestStations(
          pos.coords.latitude,
          pos.coords.longitude,
          { limit: 1 },
        );
        if (nearest.length > 0) setOriginId(nearest[0].station.id);
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

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
              aria-label="Use my location"
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
            <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm md:gap-3 md:px-4 md:py-2.5 md:text-base">
              <Building2 className="size-4 shrink-0 text-primary md:size-5" />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{originPlaceInfo.placeName}</span>
                <span className="mx-1.5 text-muted-foreground">→</span>
                <span>{t.nearestStation}: <span className="font-medium">{originPlaceInfo.stationName}</span></span>
                <span className="ml-1.5 text-muted-foreground">
                  ({formatDistance(originPlaceInfo.distanceKm, lang)} {t.walkDistance})
                </span>
              </span>
              <button
                type="button"
                onClick={() => clearOriginPlace()}
                className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>
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
            <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm md:gap-3 md:px-4 md:py-2.5 md:text-base">
              <Building2 className="size-4 shrink-0 text-primary md:size-5" />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{destPlaceInfo.placeName}</span>
                <span className="mx-1.5 text-muted-foreground">→</span>
                <span>{t.nearestStation}: <span className="font-medium">{destPlaceInfo.stationName}</span></span>
                <span className="ml-1.5 text-muted-foreground">
                  ({formatDistance(destPlaceInfo.distanceKm, lang)} {t.walkDistance})
                </span>
              </span>
              <button
                type="button"
                onClick={() => clearDestPlace()}
                className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>
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
              return (
                <div className="grid grid-cols-4 gap-2 md:gap-3">
                  <a
                    href={geoUrl(
                      { lat: origin.lat, lng: origin.lng },
                      isFa ? origin.fa : origin.name,
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="col-span-1 flex items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-2 py-3 text-xs font-medium transition-colors hover:bg-accent md:gap-2 md:py-3.5 md:text-sm"
                  >
                    <MapPin className="size-3.5 shrink-0 md:size-4" />
                    <span className="truncate">{isFa ? "بریم به ایستگاه مبدا" : "Go to start"}</span>
                  </a>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(window.location.href);
                      } catch {
                        if (navigator.share) await navigator.share({ url: window.location.href });
                        return;
                      }
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2500);
                    }}
                    className="col-span-3 flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium transition-colors hover:bg-accent md:gap-3 md:py-3.5 md:text-base"
                  >
                    {copied ? (
                      <>
                        <Check className="size-4 text-green-500 md:size-5" />
                        <span className="text-green-600">{t.copied}</span>
                      </>
                    ) : (
                      <>
                        <Share2 className="size-4 md:size-5" />
                        <span>{t.shareRoute}</span>
                      </>
                    )}
                  </button>
                </div>
              );
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
