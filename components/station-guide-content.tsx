"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, ExternalLink, Map as MapIcon, MapPin, Route as RouteIcon, TrainFront } from "lucide-react";
import { useMetro } from "@/app/providers";
import { StationGuideSchedule } from "@/components/station-guide-schedule";
import { AMENITY_ICON_MAP } from "@/lib/amenity-icons";
import { geoUrl } from "@/lib/geo";
import { AMENITY_LABELS, persianDigits } from "@/lib/i18n";
import { LINE_COLORS, lineOnColor } from "@/lib/metro/lines";
import { getOperationalStationLines, getRoutesForStation, getStationTerminalRoutes } from "@/lib/metro/selectors";
import type { MetroStation } from "@/lib/metro/types";
import { stationSeoPath } from "@/lib/station-seo";
import type { StationTimetableSummary } from "@/lib/station-seo-timetable";
import { getCityMeta } from "@/lib/cities";

type Neighbor = {
  id: string;
  name: MetroStation["name"];
  lineId: number;
  side: "before" | "after";
};

export function StationGuideContent({
  station,
  neighbors,
  timetableSummary,
}: {
  station: MetroStation;
  neighbors: Neighbor[];
  timetableSummary: StationTimetableSummary | null;
}) {
  const { lang } = useMetro();
  const isFa = lang === "fa";
  const city = getCityMeta("tehran")!;
  const BackIcon = isFa ? ArrowRight : ArrowLeft;
  const lines = getOperationalStationLines(station.id);
  const terminalRoutes = new Set(getStationTerminalRoutes(station.id));
  const terminalLines = new Set(
    getRoutesForStation(station.id)
      .filter(route => terminalRoutes.has(route.id))
      .map(route => route.lineId),
  );
  // Only explicitly confirmed amenities can appear as station facts.
  // A missing/false value is NOT evidence that an amenity is absent.
  const amenities = station.amenitiesVerified === false
    ? []
    : Object.entries(station.amenities).filter(([, value]) => value === true);

  return (
    <div dir={isFa ? "rtl" : "ltr"}
      className="mx-auto flex w-full max-w-xl flex-col gap-3 px-4 pb-7 pt-3 sm:gap-4 sm:py-6">
      <nav aria-label={isFa ? "مسیر صفحه" : "Breadcrumb"} className="flex items-center">
        <Link href={`/stations?lang=${lang}`} prefetch={false}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg px-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-primary">
          <BackIcon aria-hidden="true" className="size-4" />
          {isFa ? "بازگشت به ایستگاه‌ها" : "Back to stations"}
        </Link>
      </nav>

      <header className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
              <Link href={`/tehran?lang=${lang}`} prefetch={false}
                aria-label={isFa ? "مترو تهران" : "Tehran Metro"}
                className="rounded-sm underline-offset-2 hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary">
                {isFa ? "مترو " : "Metro "}{city.name[lang]}
              </Link>
              <span aria-hidden="true">/</span>
              <Link href={`/stations?lang=${lang}`} prefetch={false}
                className="rounded-sm underline-offset-2 hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary">
                {isFa ? "ایستگاه‌ها" : "Stations"}
              </Link>
            </div>
            <h1 className="text-xl font-extrabold leading-relaxed sm:text-2xl">
              {isFa ? `ایستگاه مترو ${station.name.fa}` : `${station.name.en} Metro Station`}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground" lang={isFa ? "en" : "fa"}
              dir={isFa ? "ltr" : "rtl"}>
              {isFa ? station.name.en : station.name.fa}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
            {lines.map(line => (
              <span key={line}
                aria-label={`${isFa ? "خط" : "Line"} ${persianDigits(line, lang)}`}
                className="inline-flex min-h-9 items-center justify-center rounded-lg px-3 text-xs font-extrabold"
                style={{ backgroundColor: LINE_COLORS[line], color: lineOnColor(line) }}>
                {isFa ? "خط " : "Line "}{persianDigits(line, lang)}
              </span>
            ))}
          </div>
        </div>
        {amenities.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3" aria-label={isFa ? "امکانات ثبت‌شده" : "Recorded amenities"}>
            {amenities.map(([key]) => {
              const Icon = AMENITY_ICON_MAP[key];
              return (
                <span key={key} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground">
                  {Icon && <Icon aria-hidden="true" className="size-3.5" />}
                  {AMENITY_LABELS[key]?.[lang] ?? key}
                </span>
              );
            })}
          </div>
        )}
      </header>

      <section aria-labelledby="station-line-context" className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 px-4 pb-2 pt-4">
          <RouteIcon aria-hidden="true" className="size-4 text-muted-foreground" />
          <h2 id="station-line-context" className="text-sm font-bold">
            {isFa ? "موقعیت در خط" : "Position on the line"}
          </h2>
        </div>

        <div className="space-y-3 px-4 pb-4">
          {lines.map(line => {
            const before = neighbors.filter(n => n.lineId === line && n.side === "before");
            const after = neighbors.filter(n => n.lineId === line && n.side === "after");
            const nodes = [
              ...before,
              { id: station.id, name: station.name, lineId: line, side: "current" as const },
              ...after,
            ];
            return (
              <div key={line} className="relative overflow-hidden rounded-lg border border-border bg-muted/20 px-3 py-3">
                <div className="mb-3 flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold" style={{ color: LINE_COLORS[line] }}>
                    {isFa ? "خط " : "Line "}{persianDigits(line, lang)}
                  </span>
                  {terminalLines.has(line) && <span className="text-muted-foreground">
                    {isFa ? "ایستگاه پایانی این مسیر" : "Terminal stop on this route"}
                  </span>}
                </div>
                <div className="relative">
                  {nodes.length > 1 && (
                    <span aria-hidden="true" className="absolute inset-x-[12%] top-[9px] h-0.5"
                      style={{ backgroundColor: LINE_COLORS[line] }} />
                  )}
                  <ol className="relative flex items-start justify-around gap-2">
                    {nodes.map(node => {
                      const current = node.id === station.id;
                      return (
                        <li key={node.id} className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
                          <span aria-hidden="true" className="z-10 block size-[19px] shrink-0 rounded-full border-[3px] border-card"
                            style={{
                              backgroundColor: current ? LINE_COLORS[line] : "var(--color-card)",
                              boxShadow: `0 0 0 2px ${LINE_COLORS[line]}`,
                            }} />
                          {current
                            ? <span aria-current="location" className="line-clamp-2 text-xs font-bold">{node.name[lang]}</span>
                            : <Link href={`${stationSeoPath(node.id)}?lang=${lang}`} prefetch={false}
                                className="line-clamp-2 min-h-9 text-xs font-semibold text-muted-foreground underline-offset-2 hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary">
                                {node.name[lang]}
                              </Link>}
                        </li>
                      );
                    })}
                  </ol>
                </div>
              </div>
            );
          })}
        </div>
        <p className="px-4 pb-3 text-[11px] leading-5 text-muted-foreground">
          {isFa ? "نمای شماتیک ایستگاه‌های مجاور؛ برای موقعیت جغرافیایی، نقشه را باز کنید." : "Simplified neighboring stops; open the map for geographic location."}
        </p>
      </section>

      <StationGuideSchedule station={station} lang={lang} bundledSummary={timetableSummary} />

      <nav aria-label={isFa ? "مسیریابی و نقشه" : "Route and map"}
        className="grid grid-cols-2 gap-2 pt-1">
        <Link href={`/tehran/route?to=${encodeURIComponent(station.id)}&lang=${lang}`} prefetch={false}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary px-2 py-3 text-center text-xs font-bold leading-5 text-primary-foreground transition-colors hover:brightness-110 focus-visible:outline-2 focus-visible:outline-primary sm:text-sm">
          <RouteIcon aria-hidden="true" className="size-4 shrink-0" />
          {isFa ? "مسیریابی به این ایستگاه" : "Route to this station"}
        </Link>
        <Link href={`/tehran/map?station=${encodeURIComponent(station.id)}&lang=${lang}`} prefetch={false}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-border bg-card px-2 py-3 text-center text-xs font-semibold leading-5 transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary sm:text-sm">
          <MapIcon aria-hidden="true" className="size-4 shrink-0" />
          {isFa ? "نمایش روی نقشهٔ متو" : "Show on Metto map"}
        </Link>
      </nav>

      <a href={geoUrl(station.location, isFa ? station.name.fa : station.name.en)}
        target="_blank" rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg text-xs text-muted-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-primary">
        <MapPin aria-hidden="true" className="size-3.5" />
        {isFa ? "موقعیت و مسیر پیاده در نقشهٔ خارجی" : "Walking directions in an external map"}
        <ExternalLink aria-hidden="true" className="size-3.5" />
        <span className="sr-only">{isFa ? "(در پنجره جدید)" : "(opens a new tab)"}</span>
      </a>

      <p className="px-1 text-[11px] leading-5 text-muted-foreground">
        <TrainFront aria-hidden="true" className="me-1 inline size-3.5 align-text-bottom" />
        {isFa
          ? "اطلاعات خطوط و امکانات از داده‌های ثبت‌شدهٔ متو است؛ نبودن یک امکان در فهرست به معنی نبودن آن در ایستگاه نیست."
          : "Lines and facilities use Metto's recorded data. An unlisted facility is not necessarily unavailable."}
      </p>
    </div>
  );
}
