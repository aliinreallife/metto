"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  ArrowUpDown,
  Building2,
  TrainFront,
  Globe,
  Map as MapIcon,
  ListTree,
  Route as RouteIcon,
  LocateFixed,
  ExternalLink,
  Database,
  Loader2,
  MapPin,
  Layers,
  Satellite,
  X,
} from "lucide-react";
import { StationCombobox } from "@/components/station-combobox";
import { RoutePanel } from "@/components/route-panel";
import { StationDetail } from "@/components/station-detail";
import { StationsTab } from "@/components/stations-tab";
import { NearbyTab } from "@/components/nearby-tab";
import { InstallButton } from "@/components/pwa";
import { STATION_MAP, findRoute } from "@/lib/route";
import { geoUrl, nearestStations, formatDistance, haversineKm } from "@/lib/geo";
import { STRINGS, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

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

type Tab = "route" | "stations" | "nearby" | "map";

export default function Page() {
  const [lang, setLang] = useState<Lang>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("lang");
      if (saved === "en" || saved === "fa") return saved;
    }
    return "fa";
  });
  const [tab, setTab] = useState<Tab>("route");
  const [originId, setOriginId] = useState<string | null>(null);
  const [destId, setDestId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapMode, setMapMode] = useState<"satellite" | "schematic">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("mapMode");
      if (saved === "satellite" || saved === "schematic") return saved;
    }
    return "satellite";
  });
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

  // View state for map sync
  const [mapView, setMapView] = useState<{ center: [number, number]; zoom: number }>({
    center: [35.7, 51.38],
    zoom: 11,
  });

  const t = STRINGS[lang];
  const isFa = lang === "fa";

  const route = useMemo(() => {
    if (!originId || !destId || originId === destId) return null;
    return findRoute(originId, destId);
  }, [originId, destId]);

  useEffect(() => {
    document.documentElement.lang = isFa ? "fa" : "en";
    document.documentElement.dir = isFa ? "rtl" : "ltr";
  }, [isFa]);

  useEffect(() => {
    const tabTitles: Record<Tab, { fa: string; en: string }> = {
      route: { fa: "مسیریاب مترو تهران", en: "Tehran Metro Route Planner" },
      stations: { fa: "ایستگاه‌های مترو تهران", en: "Tehran Metro Stations" },
      nearby: { fa: "نزدیک‌ترین ایستگاه مترو", en: "Nearby Metro Stations" },
      map: { fa: "نقشه مترو تهران", en: "Tehran Metro Map" },
    };
    const suffix = isFa ? " | مترو تهران" : " | Tehran Metro";
    document.title = tabTitles[tab][lang] + suffix;
  }, [tab, lang, isFa]);

  useEffect(() => {
    localStorage.setItem("lang", lang);
  }, [lang]);

  useEffect(() => {
    localStorage.setItem("mapMode", mapMode);
  }, [mapMode]);

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

  const selected = selectedId ? STATION_MAP.get(selectedId) : null;

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "route", label: t.tabRoute, icon: <RouteIcon className="size-5" /> },
    {
      id: "stations",
      label: t.tabStations,
      icon: <ListTree className="size-5" />,
    },
    {
      id: "nearby",
      label: t.tabNearby,
      icon: <LocateFixed className="size-5" />,
    },
    { id: "map", label: t.tabMap, icon: <MapIcon className="size-5" /> },
  ];

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="z-20 flex items-center justify-between gap-3 border-b border-border bg-card/80 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <TrainFront className="size-5" />
          </span>
          <div className="leading-tight">
            <h1 className="text-base font-bold">{t.appTitle}</h1>
            <p className="text-xs text-muted-foreground">{t.appSubtitle}</p>
          </div>
        </div>

        {/* desktop tabs */}
        <nav className="hidden items-center gap-1 md:flex">
          {tabs.map((tb) => (
            <TabButton
              key={tb.id}
              active={tab === tb.id}
              onClick={() => setTab(tb.id)}
              icon={tb.icon}
            >
              {tb.label}
            </TabButton>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <InstallButton label={t.install} />
          <button
            type="button"
            onClick={() => setLang((l) => (l === "en" ? "fa" : "en"))}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-2 text-sm font-medium transition-colors hover:bg-accent"
            aria-label="Toggle language"
          >
            <Globe className="size-4" />
            {lang === "en" ? "فارسی" : "EN"}
          </button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        {tab === "route" && (
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
        )}

        {tab === "stations" && (
          <StationsTab
            lang={lang}
            onSetOrigin={(id) => {
              setOriginId(id);
              setTab("route");
            }}
            onSetDest={(id) => {
              setDestId(id);
              setTab("route");
            }}
          />
        )}

        {tab === "nearby" && (
          <NearbyTab
            lang={lang}
            onSetOrigin={(id) => {
              setOriginId(id);
              setTab("route");
            }}
            onSetDest={(id) => {
              setDestId(id);
              setTab("route");
            }}
          />
        )}

        {tab === "map" && (
          <div className="relative size-full">
            <RealMap
              lang={lang}
              mapMode={mapMode}
              route={route}
              originId={originId}
              destId={destId}
              selectedId={selectedId}
              onSelect={setSelectedId}
              initialCenter={mapView.center}
              initialZoom={mapView.zoom}
              onViewChange={(center, zoom) => setMapView({ center, zoom })}
              placeMarkers={placeMarkers}
            />

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
                {t.geographic}
              </button>
              <button
                type="button"
                onClick={() => setMapMode("schematic")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors",
                  mapMode === "schematic"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent",
                )}
              >
                <Layers className="size-3.5" />
                {t.schematic}
              </button>
            </div>

            {selected && (
              <div className="absolute inset-x-3 bottom-3 z-[500] mx-auto max-w-md">
                <StationDetail
                  station={selected}
                  lang={lang}
                  onClose={() => setSelectedId(null)}
                  onSetDest={() => {
                    setDestId(selected.id);
                    setSelectedId(null);
                    setTab("route");
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* credits – pinned above tab bar, route tab only, mobile only */}
      {tab === "route" && (
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
      )}

      {/* mobile bottom tab bar */}
      <nav className="z-20 grid grid-cols-4 border-t border-border bg-card/90 backdrop-blur md:hidden">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            type="button"
            onClick={() => setTab(tb.id)}
            className={cn(
              "flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors",
              tab === tb.id ? "text-primary" : "text-muted-foreground",
            )}
            aria-current={tab === tb.id}
          >
            {tb.icon}
            {tb.label}
          </button>
        ))}
      </nav>
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
    <div className="flex size-full flex-col overflow-y-auto p-4 md:items-center md:p-6">
      <div className="flex w-full max-w-lg flex-col gap-3">
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
            <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
              <Building2 className="size-4 shrink-0 text-primary" />
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
          <label className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
            <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
              <Building2 className="size-4 shrink-0 text-primary" />
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
            onSetDest={() => {
              setDestId(selected.id);
              setSelectedId(null);
            }}
          />
        ) : null}

        {route &&
          originId &&
          (() => {
            const origin = STATION_MAP.get(originId);
            if (!origin) return null;
            return (
              <a
                href={geoUrl(
                  { lat: origin.lat, lng: origin.lng },
                  isFa ? origin.fa : origin.name,
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
              >
                <MapPin className="size-4 shrink-0 text-primary" />
                <span>
                  {t.getThereToStart}
                  {" · "}
                  <span className="font-semibold">
                    {isFa ? origin.fa : origin.name}
                  </span>
                </span>
              </a>
            );
          })()}

        {route ? (
          <RoutePanel route={route} lang={lang} />
        ) : !selected ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground">
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

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
