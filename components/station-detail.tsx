"use client";

import { useMemo } from "react";
import { X, Clock, Zap } from "lucide-react";
import { LINE_COLORS, type Station } from "@/lib/metro-data";
import { AMENITY_ICON_MAP } from "@/lib/amenity-icons";
import { AMENITY_LABELS, STRINGS, persianDigits, type Lang } from "@/lib/i18n";
import {
  getStationDepartures,
  getCurrentDayType,
  type Departure,
} from "@/lib/schedule-utils";

export function StationDetail({
  station,
  lang,
  onClose,
}: {
  station: Station;
  lang: Lang;
  onClose: () => void;
}) {
  const t = STRINGS[lang];
  const isFa = lang === "fa";
  const activeAmenities = Object.entries(station.amenities).filter(
    ([, v]) => v,
  );

  const departures = useMemo(() => {
    const grouped = getStationDepartures(station.id, getCurrentDayType(), 3);
    return grouped.flatMap((g) => g.departures);
  }, [station.id]);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold leading-tight">
            {isFa ? station.fa : station.name}
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {isFa ? station.name : station.fa}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex gap-1.5">
            {station.lines.map((l) => (
              <span
                key={l}
                className="flex size-7 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: LINE_COLORS[l] }}
              >
                {persianDigits(l, lang)}
              </span>
            ))}
          </div>
          <button
            type="button"
            aria-label={t.close}
            onClick={onClose}
            className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {station.lines.length > 1 && (
        <span className="inline-flex items-center gap-1 self-start rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {t.interchange}
        </span>
      )}

      {activeAmenities.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {activeAmenities.map(([key]) => {
            const Icon = AMENITY_ICON_MAP[key];
            return (
              <span
                key={key}
                className="flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs text-foreground"
              >
                {Icon && <Icon className="size-3.5 shrink-0 text-primary" />}
                {AMENITY_LABELS[key]?.[lang] ?? key}
              </span>
            );
          })}
        </div>
      )}

      {departures.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {isFa ? "حرکت‌های بعدی" : "Next departures"}
          </span>
          <div className="flex flex-col gap-1">
            {departures.map((dep, i) => (
              <DepartureRow key={i} dep={dep} lang={lang} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DepartureRow({ dep, lang }: { dep: Departure; lang: Lang }) {
  const isFa = lang === "fa";
  const color = LINE_COLORS[dep.line];

  return (
    <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs">
      <span
        className="flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
        style={{ backgroundColor: color }}
      >
        {persianDigits(dep.line, lang)}
      </span>
      <Clock className="size-3 shrink-0 text-muted-foreground" />
      <span className="font-mono font-semibold">{dep.time}</span>
      {dep.isExpress && (
        <span className="flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          <Zap className="size-2.5" />
          {isFa ? "سریع" : "Express"}
        </span>
      )}
      <span className="ml-auto truncate text-muted-foreground">
        {isFa ? "به سمت" : "→"} {dep.directionName}
      </span>
      {dep.minutesUntil <= 2 && (
        <span className="shrink-0 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-700 dark:bg-green-900/30 dark:text-green-400">
          {isFa ? "الان" : "Now"}
        </span>
      )}
    </div>
  );
}
