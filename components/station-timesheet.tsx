"use client";

import { useMemo, useState } from "react";
import { X, Clock, Zap, ChevronDown } from "lucide-react";
import { LINE_COLORS } from "@/lib/metro/lines";
import type { MetroStation } from "@/lib/metro/types";
import { getStation, getStationLines } from "@/lib/metro/selectors";
import { STRINGS, persianDigits, type Lang } from "@/lib/i18n";
import {
  getAllDepartures,
  getCurrentDayType,
  type Departure,
  type DayType,
} from "@/lib/schedule-utils";
import { useScheduleData } from "@/lib/use-schedule-data";
import { cn } from "@/lib/utils";

export function StationTimesheet({
  station,
  lang,
  onClose,
}: {
  station: MetroStation;
  lang: Lang;
  onClose: () => void;
}) {
  const loaded = useScheduleData();
  const t = STRINGS[lang];
  const isFa = lang === "fa";
  const [dayType, setDayType] = useState<DayType>(getCurrentDayType());
  const [expandedLine, setExpandedLine] = useState<number | null>(null);

  const dayLabels: Record<DayType, string> = {
    saturday_wednesday: isFa ? "شنبه تا چهارشنبه" : "Sat–Wed",
    thursday: isFa ? "پنجشنبه" : "Thursday",
    friday: isFa ? "جمعه / تعطیلات" : "Friday / Holidays",
  };

  const [selectedDirection, setSelectedDirection] = useState<string | null>(null);

  // Helper to get station name by ID in the correct language
  const stationName = (id: string) => {
    const s = getStation(id);
    return s ? (isFa ? s.name.fa : s.name.en) : id;
  };

  // Group departures by line, then by direction
  const timesheet = useMemo(() => {
    const result: {
      line: number;
      directions: { direction: string; directionName: string; times: { time: string; isExpress: boolean }[] }[];
    }[] = [];

    for (const line of getStationLines(station.id)) {
      const allDeps = getAllDepartures(station.id, line, dayType);

      // Group by direction
      const dirMap = new Map<string, { direction: string; directionName: string; times: { time: string; isExpress: boolean }[] }>();
      for (const dep of allDeps) {
        if (!dirMap.has(dep.direction)) {
          dirMap.set(dep.direction, { direction: dep.direction, directionName: dep.directionName, times: [] });
        }
        dirMap.get(dep.direction)!.times.push({ time: dep.time, isExpress: dep.isExpress });
      }

      result.push({
        line,
        directions: Array.from(dirMap.values()),
      });
    }

    return result;
  }, [station.id, dayType, loaded]);

  // Collect all unique directions across all lines
  const allDirections = useMemo(() => {
    const dirs = new Map<string, string>();
    for (const ld of timesheet) {
      for (const d of ld.directions) {
        dirs.set(d.direction, d.directionName);
      }
    }
    return Array.from(dirs.entries());
  }, [timesheet]);

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h3 className="text-base font-bold">
            {isFa ? "برنامه حرکت" : "Timetable"}
          </h3>
          <p className="text-sm text-muted-foreground">
            {isFa ? station.name.fa : station.name.en}
          </p>
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

      {/* Day type selector */}
      <div className="flex gap-1 border-b border-border px-4 py-2">
        {(Object.keys(dayLabels) as DayType[]).map((dt) => (
          <button
            key={dt}
            type="button"
            onClick={() => setDayType(dt)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              dayType === dt
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {dayLabels[dt]}
          </button>
        ))}
      </div>

      {/* Direction selector */}
      {allDirections.length > 1 && (
        <div className="flex gap-1 border-b border-border px-4 py-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setSelectedDirection(null)}
            className={cn(
              "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
              selectedDirection === null
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {isFa ? "همه" : "All"}
          </button>
          {allDirections.map(([dirId, dirName]) => (
            <button
              key={dirId}
              type="button"
              onClick={() => setSelectedDirection(dirId)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap",
                selectedDirection === dirId
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {isFa ? "به سمت" : "→"} {stationName(dirId)}
            </button>
          ))}
        </div>
      )}

      {/* Timesheet content */}
      <div className="max-h-[60vh] overflow-y-auto px-4 py-3">
        {!loaded && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {isFa ? "در حال بارگذاری زمان‌بندی..." : "Loading schedule..."}
          </p>
        )}
        {loaded && timesheet.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {isFa ? "حرکتی یافت نشد" : "No departures found"}
          </p>
        )}

        {timesheet.map((lineData) => {
          // Filter directions by selected direction
          const filteredDirs = selectedDirection
            ? lineData.directions.filter(d => d.direction === selectedDirection)
            : lineData.directions;
          const totalCount = filteredDirs.reduce((sum, d) => sum + d.times.length, 0);

          // Skip lines with 0 trains in the selected direction
          if (totalCount === 0) return null;

          return (
          <div key={lineData.line} className="mb-4 last:mb-0">
            {/* Line header */}
            <button
              type="button"
              onClick={() =>
                setExpandedLine(
                  expandedLine === lineData.line ? null : lineData.line,
                )
              }
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-muted/50"
            >
              <span
                className="flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: LINE_COLORS[lineData.line] }}
              >
                {persianDigits(lineData.line, lang)}
              </span>
              <span className="text-sm font-semibold">
                {t.line} {persianDigits(lineData.line, lang)}
              </span>
              <span className="tnum ml-auto text-xs text-muted-foreground">
                {persianDigits(totalCount, lang)}{" "}
                {isFa ? "حرکت" : "trains"}
              </span>
              <ChevronDown
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform",
                  expandedLine === lineData.line && "rotate-180",
                )}
              />
            </button>

            {/* Expanded content */}
            {expandedLine === lineData.line && (
              <div className="mt-2 flex flex-col gap-3 pl-8">
                {filteredDirs.map((dir) => (
                  <div key={dir.direction}>
                    <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
                      {isFa ? "به سمت" : "→"} {stationName(dir.direction)}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {dir.times.map((tt, i) => (
                        <span
                          key={i}
                          className={cn(
                            "tnum inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs",
                            tt.isExpress
                              ? "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
                              : "bg-muted text-foreground",
                          )}
                        >
                          {tt.isExpress && <Zap className="size-2.5" />}
                          {persianDigits(tt.time, lang)}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}
