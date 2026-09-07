"use client";

import { useMemo } from "react";
import { MapPin, Flag, Clock, Zap, Calendar, Ban } from "lucide-react";
import { LINE_COLORS } from "@/lib/metro/lines";
import type { MetroStation } from "@/lib/metro/types";
import { getStationLines } from "@/lib/metro/selectors";
import { AMENITY_ICON_MAP } from "@/lib/amenity-icons";
import { AMENITY_LABELS, STRINGS, persianDigits, type Lang } from "@/lib/i18n";
import { geoUrl, formatDistance } from "@/lib/geo";
import {
  getNextDepartures,
  getCurrentDayType,
} from "@/lib/schedule-utils";
import { useScheduleData } from "@/lib/use-schedule-data";

type Props = {
  station: MetroStation;
  lang: Lang;
  distance?: number;
  onSetDest: () => void;
  onShowTimetable?: () => void;
};

export function StationCard({ station, lang, distance, onSetDest, onShowTimetable }: Props) {
  const loaded = useScheduleData();
  const t = STRINGS[lang];
  const isFa = lang === "fa";
  const lines = getStationLines(station.id);
  const underConstruction = station.status !== "operational";

  const activeAmenities = Object.entries(station.amenities).filter(
    ([, v]) => v,
  );

  const departures = useMemo(() => {
    const grouped = lines.map((line) => ({
      line,
      departures: getNextDepartures(station.id, line, getCurrentDayType(), 2),
    }));
    return grouped.filter((g) => g.departures.length > 0);
  }, [station.id, lines.join(","), loaded]);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header with colored line accent */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex shrink-0 gap-1">
          {lines.map((l) => (
            <span
              key={l}
              className="flex size-8 items-center justify-center rounded-lg text-sm font-bold text-white"
              style={{ backgroundColor: LINE_COLORS[l] }}
            >
              {persianDigits(l, lang)}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold leading-tight truncate">
            {isFa ? station.name.fa : station.name.en}
          </h3>
          <p className="text-xs text-muted-foreground truncate">
            {isFa ? station.name.en : station.name.fa}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {underConstruction && (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
              <Ban className="size-3" />
              {t.underConstruction}
            </span>
          )}
          {lines.length > 1 && (
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {t.interchange}
            </span>
          )}
          {distance !== undefined && (
            <span className="text-[10px] text-muted-foreground">
              {formatDistance(distance, lang)}
            </span>
          )}
        </div>
      </div>

      {/* Amenities as icon pills */}
      {activeAmenities.length > 0 && (
        <div className="flex flex-wrap gap-1 px-4 pb-2">
          {activeAmenities.map(([key]) => {
            const Icon = AMENITY_ICON_MAP[key];
            const label = AMENITY_LABELS[key]?.[lang] ?? key;
            return (
              <span
                key={key}
                className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground"
                title={label}
              >
                {Icon && <Icon className="size-3 shrink-0 text-primary" />}
                <span className="inline">{label}</span>
              </span>
            );
          })}
        </div>
      )}

      {/* Next departures - compact */}
      {!loaded && (
        <div className="border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
          {isFa ? "در حال بارگذاری زمان‌بندی..." : "Loading schedule..."}
        </div>
      )}
      {loaded && departures.length > 0 && (
        <div className="border-t border-border px-4 py-2.5">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
            <Clock className="size-3" />
            {isFa ? "حرکت بعدی" : "Next"}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {departures.map((g) => (
              <div key={g.line} className="flex items-center gap-1.5 text-xs">
                <span
                  className="flex size-4 shrink-0 items-center justify-center rounded-full text-[8px] font-bold text-white"
                  style={{ backgroundColor: LINE_COLORS[g.line] }}
                >
                  {persianDigits(g.line, lang)}
                </span>
                <span className="font-mono font-semibold">
                  {g.departures[0]?.time}
                </span>
                {g.departures[0]?.isExpress && (
                  <span className="flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
                    <Zap className="size-3" />
                    <span className="text-[9px] font-bold">{isFa ? "سریع السیر" : "express"}</span>
                  </span>
                )}
                {g.departures.length > 1 && (
                  <span className="text-muted-foreground text-[10px]">
                    {isFa ? "بعدی:" : "+"} {g.departures[1]?.time}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex border-t border-border">
        {onShowTimetable && (
          <button
            type="button"
            onClick={onShowTimetable}
            className="flex flex-1 items-center justify-center gap-1.5 px-2 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Calendar className="size-3.5" />
            {isFa ? "برنامه" : "Timetable"}
          </button>
        )}
        <a
          href={geoUrl(
            { lat: station.location.lat, lng: station.location.lng },
            isFa ? station.name.fa : station.name.en,
          )}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t.directions}
          title={t.directions}
          className="flex flex-1 items-center justify-center gap-1.5 border-x border-border px-2 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <MapPin className="size-3.5" />
          {t.directions}
        </a>
        <button
          type="button"
          onClick={onSetDest}
          disabled={underConstruction}
          className="flex flex-1 items-center justify-center gap-1.5 px-2 py-2.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Flag className="size-3.5" />
          {t.setDestination}
        </button>
      </div>
    </div>
  );
}
