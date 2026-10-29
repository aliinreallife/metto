"use client";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Moon, Sun, TrainFront } from "lucide-react";
import { useMetro } from "@/app/providers";
import { STRINGS, persianDigits, type Lang } from "@/lib/i18n";
import {
  candidateTrack,
  isfahanCandidate as data,
} from "@/lib/isfahan-preview";
import { StationCombobox } from "@/components/station-combobox";
import type { MapNetwork, MapRoute } from "@/components/real-map";
const RealMap = dynamic(
  () => import("@/components/real-map").then((m) => m.RealMap),
  { ssr: false },
);
const action =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary";
function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}
export function IsfahanReview({ initialLang }: { initialLang: Lang }) {
  const { mapMode } = useMetro();
  const [lang, setLang] = useState(initialLang);
  const dark = useSyncExternalStore(
    subscribeTheme,
    () => document.documentElement.classList.contains("dark"),
    () => true,
  );
  const [tab, setTab] = useState<"map" | "stations">("map"),
    [from, setFrom] = useState<string | null>(null),
    [to, setTo] = useState<string | null>(null),
    [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "fa" ? "rtl" : "ltr";
  }, [lang]);
  const t = STRINGS[lang],
    picked = data.stations.find((s) => s.id === selected),
    track = useMemo(() => candidateTrack(from, to), [from, to]);
  const network = useMemo<MapNetwork>(() => {
    const stations = data.stations.map((s) => ({
      id: s.id,
      name: s.names,
      location: s.representativePoint,
      status: "review_unverified",
    }));
    return {
      labelMinZoom: 12,
      stations,
      stationMap: new Map(stations.map((s) => [s.id, s])),
      edges: data.tracks.map((edge, i) => ({
        a: edge.fromStationId,
        b: edge.toStationId,
        line: 1,
        status: "review_unverified",
        coordinates: edge.geometry.map(
          (p) => [p.lat, p.lng] as [number, number],
        ),
        id: i,
      })),
      colors: { 1: "#cc0e2d" },
      stationLines: () => [1],
      isInterchange: () => false,
      isTerminal: (id) => id === stations[0].id || id === stations.at(-1)!.id,
    };
  }, []);
  const mapRoute = useMemo<MapRoute | null>(
    () =>
      track
        ? {
            path: track.stationIds,
            hops: track.stationIds
              .slice(1)
              .map((to, i) => ({ from: track.stationIds[i], to, line: 1 })),
          }
        : null,
    [track],
  );
  const catalog = useMemo(
    () =>
      data.stations.map((s) => ({
        id: s.id,
        name: s.names,
        lineColors: ["#cc0e2d"],
      })),
    [],
  );
  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      dir={lang === "fa" ? "rtl" : "ltr"}
      data-testid="isfahan-review"
    >
      <a href="#candidate-main" className="sr-only focus:not-sr-only">
        {t.skipToContent}
      </a>
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-2 font-bold"
        >
          <TrainFront className="size-5 text-primary" aria-hidden />
          {t.candidateBrand}
        </Link>
        <h1 className="text-base font-bold">{t.candidateTitle}</h1>
        <div className="flex gap-2">
          <button
            type="button"
            className={action}
            onClick={() => setLang(lang === "fa" ? "en" : "fa")}
          >
            {lang === "fa" ? "EN" : "فارسی"}
          </button>
          <button
            type="button"
            className={action}
            aria-label={t.candidateTheme}
            onClick={() => {
              document.documentElement.classList.toggle("dark");
            }}
          >
            {dark ? (
              <Sun className="size-4" aria-hidden />
            ) : (
              <Moon className="size-4" aria-hidden />
            )}
          </button>
        </div>
      </header>
      <main
        id="candidate-main"
        tabIndex={-1}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="shrink-0 border-b border-border bg-muted/50 px-4 py-3">
          <p className="text-sm font-semibold">
            {t.candidateBadge} · {t.candidateStationCount}
          </p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {t.candidateNotice}
          </p>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-3 border-b border-border px-4 py-3">
          <div>
            <label
              htmlFor="candidate-from"
              className="mb-1 block text-xs font-medium"
            >
              {t.candidateFrom}
            </label>
            <StationCombobox
              id="candidate-from"
              catalog={catalog}
              lang={lang}
              placeholder={t.searchStations}
              accentClass="bg-primary"
              value={from}
              onChange={setFrom}
            />
          </div>
          <div>
            <label
              htmlFor="candidate-to"
              className="mb-1 block text-xs font-medium"
            >
              {t.candidateTo}
            </label>
            <StationCombobox
              id="candidate-to"
              catalog={catalog}
              lang={lang}
              placeholder={t.searchStations}
              accentClass="bg-primary"
              value={to}
              onChange={setTo}
            />
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-between gap-2 px-4 py-2">
          <div
            role="group"
            aria-label={t.candidateTitle}
            className="flex gap-2"
          >
            {(["map", "stations"] as const).map((value) => (
              <button
                type="button"
                key={value}
                className={action}
                aria-pressed={tab === value}
                onClick={() => setTab(value)}
              >
                {value === "map" ? t.tabMap : t.tabStations}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={action}
            disabled={!from && !to}
            onClick={() => {
              setFrom(null);
              setTo(null);
            }}
          >
            {t.candidateReset}
          </button>
        </div>
        <p
          role="status"
          className="shrink-0 px-4 pb-2 text-xs text-muted-foreground"
        >
          {track
            ? `${t.candidateTrack} · ${persianDigits(track.stationIds.length, lang)} ${t.stops}`
            : t.candidateSelect}
        </p>
        {tab === "map" ? (
          <div className="relative min-h-48 flex-1" data-testid="candidate-map">
            <RealMap
              network={network}
              lang={lang}
              mapMode={mapMode}
              route={mapRoute}
              originId={from}
              destId={to}
              selectedId={selected}
              onSelect={setSelected}
              initialCenter={[32.65, 51.66]}
              initialZoom={12}
            />
          </div>
        ) : (
          <ol className="min-h-0 flex-1 overflow-y-auto border-t border-border px-4">
            {data.stations.map((s, i) => (
              <li key={s.id} className="border-b border-border">
                <button
                  type="button"
                  className="flex min-h-14 w-full items-center gap-3 py-3 text-start"
                  onClick={() => {
                    setSelected(s.id);
                    setTab("map");
                  }}
                >
                  <span className="text-xs text-muted-foreground">
                    {persianDigits(i + 1, lang)}
                  </span>
                  <span className="flex-1 font-medium">{s.names[lang]}</span>
                  {s.boardingReview === "conflicting-reports" && (
                    <span className="text-xs text-muted-foreground">
                      {t.candidateBadge}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ol>
        )}
        {picked && (
          <section
            className="shrink-0 border-t border-border bg-card px-4 py-3"
            aria-label={picked.names[lang]}
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-bold">{picked.names[lang]}</h2>
              <button
                type="button"
                className={action}
                onClick={() => setSelected(null)}
              >
                {t.close}
              </button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {picked.boardingReview === "conflicting-reports"
                ? t.candidateDisputed
                : t.candidateBoardingUnknown}
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className={action}
                onClick={() => setFrom(picked.id)}
              >
                {t.candidateStart}
              </button>
              <button
                type="button"
                className={action}
                onClick={() => setTo(picked.id)}
              >
                {t.candidateEnd}
              </button>
            </div>
          </section>
        )}
        <footer className="flex shrink-0 flex-wrap justify-between gap-2 border-t border-border px-4 py-2 text-xs text-muted-foreground">
          <a
            className="inline-flex min-h-8 items-center underline"
            href="https://www.openstreetmap.org/copyright"
          >
            © OpenStreetMap contributors
          </a>
          <a
            className="inline-flex min-h-8 items-center underline"
            href="https://github.com/aliinreallife/metto-data/pull/37"
          >
            {t.candidateSource}
          </a>
        </footer>
      </main>
    </div>
  );
}
