"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  ArrowUpDown,
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
} from "lucide-react";
import { MetroMap } from "@/components/metro-map";
import { StationCombobox } from "@/components/station-combobox";
import { RoutePanel } from "@/components/route-panel";
import { StationDetail } from "@/components/station-detail";
import { StationsTab } from "@/components/stations-tab";
import { NearbyTab } from "@/components/nearby-tab";
import { InstallButton } from "@/components/pwa";
import { LINE_COLORS, STATIONS } from "@/lib/metro-data";
import { STATION_MAP, findRoute } from "@/lib/route";
import { geoUrl, nearestStations } from "@/lib/geo";
import { STRINGS, persianDigits, type Lang } from "@/lib/i18n";
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

const LINE_NUMBERS = Object.keys(LINE_COLORS)
  .map(Number)
  .sort((a, b) => a - b);

export default function Page() {
  const [lang, setLang] = useState<Lang>("en");
  const [tab, setTab] = useState<Tab>("route");
  const [originId, setOriginId] = useState<string | null>(null);
  const [destId, setDestId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  function swap() {
    setOriginId(destId);
    setDestId(originId);
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
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <span>{t.appSubtitle}</span>
              <span>·</span>
              <a
                href="https://github.com/aliinreallife"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-foreground transition-colors hover:text-primary"
              >
                aliinreallife
              </a>
            </div>
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
              route={route}
              originId={originId}
              destId={destId}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
            {selected && (
              <div className="absolute inset-x-3 bottom-3 z-[500] mx-auto max-w-md">
                <StationDetail
                  station={selected}
                  lang={lang}
                  onClose={() => setSelectedId(null)}
                  onSetOrigin={() => {
                    setOriginId(selected.id);
                    setSelectedId(null);
                    setTab("route");
                  }}
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
    <div className="flex size-full flex-col overflow-y-auto md:min-h-0 md:flex-row md:overflow-hidden">
      <aside className="flex shrink-0 flex-col gap-3 border-b border-border bg-background p-4 md:w-[380px] md:overflow-y-auto md:border-b-0 md:border-e">
        <div className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t.from}
              </label>
              <button
                type="button"
                onClick={locateOrigin}
                disabled={locating}
                aria-label="Use my location"
                className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                {locating ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <LocateFixed className="size-3.5" />
                )}
              </button>
            </div>
            <StationCombobox
              value={originId}
              onChange={setOriginId}
              placeholder={t.origin}
              lang={lang}
              accentClass="bg-primary"
            />
            <label className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t.to}
            </label>
            <StationCombobox
              value={destId}
              onChange={setDestId}
              placeholder={t.destination}
              lang={lang}
              accentClass="bg-foreground"
            />
          </div>
          <button
            type="button"
            onClick={swap}
            aria-label={t.swap}
            className="mb-0.5 flex size-9 items-center justify-center rounded-lg border border-border bg-background transition-colors hover:bg-accent"
          >
            <ArrowUpDown className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {selected ? (
            <StationDetail
              station={selected}
              lang={lang}
              onClose={() => setSelectedId(null)}
              onSetOrigin={() => {
                setOriginId(selected.id);
                setSelectedId(null);
              }}
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
            <p className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground">
              {originId && destId && originId === destId
                ? t.sameStation
                : t.pickBoth}
            </p>
          ) : null}

          {originId && destId && originId !== destId && !route && (
            <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
              {t.noRoute}
            </p>
          )}
        </div>

        <div className="mt-auto pt-2">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t.lines}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {LINE_NUMBERS.map((l) => (
              <span
                key={l}
                className="flex items-center gap-1.5 rounded-full bg-muted px-2 py-1 text-xs"
              >
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: LINE_COLORS[l] }}
                />
                {t.line} {persianDigits(l, lang)}
              </span>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {persianDigits(STATIONS.length, lang)}{" "}
            {isFa ? "ایستگاه" : "stations"}
          </p>

          <div className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3 text-[11px] text-muted-foreground">
            <a
              href="https://github.com/aliinreallife"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 transition-colors hover:text-foreground"
            >
              <ExternalLink className="size-3.5" />
              <span>
                {t.builtBy}{" "}
                <span className="font-medium text-foreground">
                  aliinreallife
                </span>
              </span>
            </a>
            <a
              href="https://github.com/mostafa-kheibary/tehran-metro-data"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 transition-colors hover:text-foreground"
            >
              <Database className="size-3.5" />
              <span>
                {t.dataBy}{" "}
                <span className="font-medium text-foreground">
                  mostafa-kheibary/tehran-metro-data
                </span>
              </span>
            </a>
          </div>
        </div>
      </aside>

      <main className="h-72 shrink-0 p-3 md:relative md:h-auto md:min-h-0 md:flex-1">
        <MetroMap
          mode="schematic"
          lang={lang}
          route={route}
          originId={originId}
          destId={destId}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </main>
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
