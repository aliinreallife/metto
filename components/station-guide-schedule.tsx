"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronDown, Clock3, TrainFront, Zap } from "lucide-react";
import { getStation, getOperationalStationLines } from "@/lib/metro/selectors";
import { LINE_COLORS, lineOnColor } from "@/lib/metro/lines";
import type { MetroStation } from "@/lib/metro/types";
import { persianDigits, type Lang } from "@/lib/i18n";
import {
  getAllDepartures, getCurrentDayType, getStationDepartures,
  type DayType, type Departure,
} from "@/lib/schedule-utils";
import { useScheduleData } from "@/lib/use-schedule-data";
import { useHolidayData } from "@/lib/holidays/use-holiday-data";
import { cn } from "@/lib/utils";

const DAY_TYPES: DayType[] = ["saturday_wednesday", "thursday", "friday"];

function dayLabel(type: DayType, lang: Lang): string {
  if (lang === "en") return ({
    saturday_wednesday: "Sat–Wed",
    thursday: "Thursday",
    friday: "Fri / Holidays",
  } satisfies Record<DayType, string>)[type];
  return ({
    saturday_wednesday: "شنبه تا چهارشنبه",
    thursday: "پنجشنبه",
    friday: "جمعه / تعطیلات",
  } satisfies Record<DayType, string>)[type];
}

function directionLabel(departure: Departure, lang: Lang): string {
  if (lang === "fa") return departure.directionName;
  return getStation(departure.direction)?.name.en ?? departure.directionName;
}

export function StationGuideSchedule({ station, lang }: { station: MetroStation; lang: Lang }) {
  const isFa = lang === "fa";
  const loaded = useScheduleData();
  const { isHolidayDate } = useHolidayData();
  const [dayOverride, setDayOverride] = useState<DayType | null>(null);
  const [fullSchedule, setFullSchedule] = useState(false);
  const [minuteTick, setMinuteTick] = useState(0);
  const lines = useMemo(() => getOperationalStationLines(station.id), [station.id]);
  const dayType = dayOverride ?? getCurrentDayType(undefined, isHolidayDate);

  // The next-departures helper uses Tehran wall time. Recompute it while
  // this screen is open instead of leaving stale "next" times on screen.
  useEffect(() => {
    const interval = window.setInterval(() => setMinuteTick(value => value + 1), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const upcoming = useMemo(() => {
    if (!loaded) return [];
    return getStationDepartures(station.id, getCurrentDayType(undefined, isHolidayDate), 3)
      .flatMap(group => group.departures)
      .sort((a, b) => a.minutesUntil - b.minutesUntil)
      .slice(0, 3);
    // minuteTick is an intentional invalidation of time-dependent selectors.
  }, [station.id, loaded, isHolidayDate, minuteTick]);

  const scheduled = useMemo(() => {
    if (!loaded) return [];
    return lines.flatMap(line => getAllDepartures(station.id, line, dayType))
      .sort((a, b) => a.minutesUntil - b.minutesUntil);
  }, [station.id, lines, dayType, loaded]);

  const scheduleGroups = useMemo(() => {
    const map = new Map<string, { line: number; direction: string; directionLabel: string; times: Departure[] }>();
    for (const dep of scheduled) {
      const key = `${dep.line}:${dep.direction}`;
      let group = map.get(key);
      if (!group) {
        group = { line: dep.line, direction: dep.direction, directionLabel: directionLabel(dep, lang), times: [] };
        map.set(key, group);
      }
      group.times.push(dep);
    }
    return [...map.values()];
  }, [scheduled, lang]);

  return (
    <div className="flex flex-col gap-3">
      <section aria-labelledby="station-next-departures" className="rounded-xl border border-border bg-card p-4">
        <div className="mb-1 flex items-center gap-2">
          <Clock3 aria-hidden="true" className="size-4 text-muted-foreground" />
          <h2 id="station-next-departures" className="text-sm font-bold">
            {isFa ? "حرکت‌های بعدی" : "Upcoming departures"}
          </h2>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          {isFa ? "بر اساس زمان‌بندی ثبت‌شده، به وقت تهران" : "Scheduled times, Tehran local time"}
        </p>
        {!loaded ? (
          <p role="status" className="py-4 text-center text-xs text-muted-foreground">
            {isFa ? "در حال بارگذاری برنامه حرکت..." : "Loading timetable..."}
          </p>
        ) : upcoming.length ? (
          <ul className="divide-y divide-border" aria-label={isFa ? "زمان حرکت‌های بعدی" : "Upcoming train times"}>
            {upcoming.map((dep, index) => (
              <li key={`${dep.line}-${dep.direction}-${dep.time}-${index}`}
                className="flex min-h-12 items-center justify-between gap-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span aria-label={`${isFa ? "خط" : "Line"} ${persianDigits(dep.line, lang)}`}
                    className="flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                    style={{ backgroundColor: LINE_COLORS[dep.line], color: lineOnColor(dep.line) }}>
                    {persianDigits(dep.line, lang)}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {isFa ? "به سمت " : "To "}{directionLabel(dep, lang)}
                  </span>
                  {dep.isExpress && <Zap aria-label={isFa ? "سریع السیر" : "Express"} className="size-3.5 shrink-0 text-amber-500" />}
                </div>
                <time className="tnum shrink-0 text-base font-bold" dateTime={dep.time.padStart(5, "0")}>
                  {persianDigits(dep.time, lang)}
                </time>
              </li>
            ))}
          </ul>
        ) : (
          <p role="status" className="py-4 text-center text-xs text-muted-foreground">
            {isFa ? "حرکت دیگری برای امروز ثبت نشده است." : "No more scheduled departures today."}
          </p>
        )}
      </section>

      <section aria-labelledby="station-timetable" className="rounded-xl border border-border bg-card p-4">
        <div className="mb-4 flex items-center gap-2">
          <CalendarDays aria-hidden="true" className="size-4 text-muted-foreground" />
          <h2 id="station-timetable" className="text-sm font-bold">
            {isFa ? "برنامه حرکت" : "Timetable"}
          </h2>
        </div>
        <div role="group" aria-label={isFa ? "نوع روز" : "Day type"}
          className="grid grid-cols-3 gap-1 rounded-lg bg-muted/70 p-1">
          {DAY_TYPES.map(type => (
            <button key={type} type="button" aria-pressed={dayType === type}
              onClick={() => { setDayOverride(type); setFullSchedule(false); }}
              className={cn(
                "min-h-11 rounded-md px-1.5 py-2 text-[11px] font-semibold leading-5 transition-colors focus-visible:outline-2 focus-visible:outline-primary sm:text-xs",
                dayType === type ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}>
              {dayLabel(type, lang)}
            </button>
          ))}
        </div>
        {!loaded ? (
          <p role="status" className="py-5 text-center text-xs text-muted-foreground">
            {isFa ? "در حال بارگذاری برنامه حرکت..." : "Loading timetable..."}
          </p>
        ) : scheduled.length ? (
          <div className="mt-4 flex items-center justify-around gap-3 rounded-lg border border-border px-2 py-3 text-center">
            <div className="min-w-0">
              <span className="block text-xs text-muted-foreground">{isFa ? "تعداد حرکت" : "Departures"}</span>
              <strong className="tnum mt-1 block text-base font-bold">{persianDigits(scheduled.length, lang)}</strong>
            </div>
            <div className="h-9 w-px shrink-0 bg-border" aria-hidden="true" />
            <div className="min-w-0">
              <span className="block text-xs text-muted-foreground">{isFa ? "اولین حرکت" : "First"}</span>
              <strong className="tnum mt-1 block text-sm font-semibold">{persianDigits(scheduled[0].time, lang)}</strong>
            </div>
            <div className="h-9 w-px shrink-0 bg-border" aria-hidden="true" />
            <div className="min-w-0">
              <span className="block text-xs text-muted-foreground">{isFa ? "آخرین حرکت" : "Last"}</span>
              <strong className="tnum mt-1 block text-sm font-semibold">{persianDigits(scheduled[scheduled.length - 1].time, lang)}</strong>
            </div>
          </div>
        ) : (
          <p className="py-5 text-center text-xs text-muted-foreground">
            {isFa ? "برای این روز حرکت ثبت‌شده‌ای وجود ندارد." : "No timetable entries for this day."}
          </p>
        )}

        {loaded && scheduled.length > 0 && (
          <>
            <button type="button" aria-expanded={fullSchedule}
              aria-controls="station-guide-full-timetable"
              onClick={() => setFullSchedule(expanded => !expanded)}
              className="mt-3 flex min-h-11 w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-xs font-semibold transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary">
              <span>{fullSchedule
                ? isFa ? "بستن برنامه کامل" : "Hide full timetable"
                : isFa ? "نمایش برنامه کامل" : "View full timetable"}</span>
              <span className="flex items-center gap-2 text-muted-foreground">
                {persianDigits(scheduled.length, lang)} {isFa ? "حرکت" : "trains"}
                <ChevronDown aria-hidden="true" className={cn("size-4 transition-transform", fullSchedule && "rotate-180")} />
              </span>
            </button>
            <div id="station-guide-full-timetable" hidden={!fullSchedule}>
              {fullSchedule && <div className="mt-3 max-h-72 space-y-4 overflow-y-auto rounded-lg border border-border p-3">
                {scheduleGroups.map(group => (
                  <div key={`${group.line}-${group.direction}`}>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
                        style={{ backgroundColor: LINE_COLORS[group.line], color: lineOnColor(group.line) }}>
                        {persianDigits(group.line, lang)}
                      </span>
                      <h3 className="truncate text-xs font-semibold">
                        {isFa ? "به سمت " : "To "}{group.directionLabel}
                      </h3>
                    </div>
                    <ul className="flex flex-wrap gap-1.5">
                      {group.times.map((dep, index) => (
                        <li key={`${dep.time}-${index}`}>
                          <span className="tnum inline-flex min-h-8 items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs">
                            {dep.isExpress && <Zap aria-label={isFa ? "سریع السیر" : "Express"} className="size-3 text-amber-500" />}
                            {persianDigits(dep.time, lang)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>}
            </div>
          </>
        )}
        <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-5 text-muted-foreground">
          <TrainFront aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          {isFa
            ? "ساعت‌ها برنامه‌ریزی‌شده‌اند، نه موقعیت لحظه‌ای قطار. روزهای تعطیل طبق تقویم متو محاسبه می‌شوند."
            : "These are scheduled times, not live train tracking. Holiday service follows Metto's calendar."}
        </p>
      </section>
    </div>
  );
}
