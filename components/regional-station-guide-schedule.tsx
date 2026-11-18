"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronDown, Clock3, TrainFront } from "lucide-react";
import { stationByCityId, CITY_LINES, type CityStation } from "@/lib/city-catalog";
import { cityDataCredit } from "@/lib/data-credit";
import { useHolidayData } from "@/lib/holidays/use-holiday-data";
import { persianDigits, type Lang } from "@/lib/i18n";
import {
  initialRegionalPattern, regionalServiceDay, regionalServicePatterns,
  regionalStationDepartures, type RegionalTimedCity,
} from "@/lib/regional-station-schedules";
import type { StationServiceDaySummary } from "@/lib/station-seo-timetable";
import { tehranParts } from "@/lib/tehran-time";
import { useRouteClock } from "@/lib/use-route-clock";

type Props = {
  station: CityStation;
  lang: Lang;
  summaries: Record<string, StationServiceDaySummary>;
};

export function RegionalStationGuideSchedule({ station, lang, summaries }: Props) {
  const city = station.cityId as RegionalTimedCity;
  const isFa = lang === "fa";
  const { dataset } = useHolidayData();
  const nowMs = useRouteClock();
  const [mounted, setMounted] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const patterns = regionalServicePatterns(city);
  const service = mounted ? regionalServiceDay(city, nowMs, dataset) : null;
  const pattern = selected ?? service?.serviceId ?? initialRegionalPattern(city);
  const summary = summaries[pattern];
  const departures = useMemo(() =>
    regionalStationDepartures(city, station.id, pattern), [city, station.id, pattern]);
  const nowMinute = mounted ? tehranParts(nowMs).minuteOfDay : 0;
  const upcoming = service?.applicable && service.serviceId
    ? regionalStationDepartures(city, station.id, service.serviceId)
      .filter(dep => {
        const [hour, minute] = dep.time.split(":").map(Number);
        return hour * 60 + minute >= nowMinute;
      }).slice(0, 3) : [];

  const groups = useMemo(() => {
    const result = new Map<string, string[]>();
    for (const item of departures) {
      const list = result.get(item.directionId) ?? [];
      list.push(item.time);
      result.set(item.directionId, list);
    }
    return [...result];
  }, [departures]);
  const line = CITY_LINES.find(line => line.id === `${city}:line:1`);
  const terminalName = (id: string) => stationByCityId.get(id)?.names[lang] ?? id;
  const source = cityDataCredit(city);
  const provisional = city === "tabriz";
  const notice = provisional
    ? isFa ? "زمان‌بندی تبریز هنوز تأیید نهایی اپراتور را ندارد؛ پیش از سفر اطلاعیه‌های ایستگاه را بررسی کنید."
      : "Tabriz's published timetable is not yet operator-verified. Check station notices before travel."
    : isFa ? "برنامه جمعه/تعطیلات اصفهان موقت است؛ تغییرهای تقویم و تعطیلی برخی ایستگاه‌ها ممکن است اعمال شود."
      : "Isfahan's Friday/holiday pattern is provisional; some stations do not board on Fridays.";

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
          {isFa ? "مطابق جدول منتشرشده، به وقت ایران؛ نه موقعیت لحظه‌ای قطار" :
            "Published scheduled times (Iran local time), not live tracking"}
        </p>
        {!mounted ? (
          <p role="status" className="py-3 text-center text-xs text-muted-foreground">
            {isFa ? "در حال بررسی حرکت‌های امروز..." : "Checking today's departures..."}
          </p>
        ) : upcoming.length > 0 ? (
          <ul aria-label={isFa ? "حرکت‌های بعدی" : "Next scheduled trains"} className="divide-y divide-border">
            {upcoming.map((dep, i) => (
              <li key={`${dep.time}-${dep.directionId}-${i}`} className="flex min-h-12 items-center justify-between gap-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span aria-label={isFa ? "خط یک" : "Line 1"}
                    className="flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                    style={{ backgroundColor: line?.color ?? "var(--color-primary)", color: line?.onColor ?? "white" }}>
                    {persianDigits(1, lang)}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {isFa ? "به سمت " : "To "}{terminalName(dep.directionId)}
                  </span>
                </div>
                <time className="tnum shrink-0 text-base font-bold" dateTime={dep.time}>
                  {persianDigits(dep.time, lang)}
                </time>
              </li>
            ))}
          </ul>
        ) : (
          <p role="status" className="py-3 text-center text-xs text-muted-foreground">
            {isFa ? "حرکت دیگری در جدول امروز ثبت نشده است." : "No further scheduled departures today."}
          </p>
        )}
        {service?.holidayAssumption && <p className="mt-2 text-[11px] text-muted-foreground">
          {isFa ? "نوع برنامه روز تعطیل موقت/فرضی است." : "Holiday service selection is provisional."}
        </p>}
        {service?.calendarUnknown && <p className="mt-2 text-[11px] text-muted-foreground">
          {isFa ? "تقویم این تاریخ به‌طور کامل تأیید نشده است." : "Calendar coverage for this date is uncertain."}
        </p>}
      </section>

      <section aria-labelledby="station-timetable" className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <CalendarDays aria-hidden="true" className="size-4 text-muted-foreground" />
          <h2 id="station-timetable" className="text-sm font-bold">
            {isFa ? "برنامه حرکت" : "Timetable"}
          </h2>
        </div>
        <div role="group" aria-label={isFa ? "نوع روز" : "Day type"} className="grid grid-cols-2 gap-1 rounded-lg bg-muted/70 p-1">
          {patterns.map(p => (
            <button key={p.id} type="button" aria-pressed={pattern === p.id}
              onClick={() => { setSelected(p.id); setExpanded(false); }}
              className={`min-h-11 rounded-md px-2 py-2 text-xs font-semibold leading-5 focus-visible:outline-2 focus-visible:outline-primary
                ${pattern === p.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}>
              {p.label[lang]}
            </button>
          ))}
        </div>
        {summary ? (
          <div className="mt-4 flex items-center justify-around gap-2 rounded-lg border border-border px-2 py-3 text-center">
            <div className="min-w-0">
              <span className="block text-xs text-muted-foreground">{isFa ? "تعداد حرکت" : "Departures"}</span>
              <strong className="tnum mt-1 block text-base font-bold">{persianDigits(summary.count, lang)}</strong>
            </div>
            <div aria-hidden="true" className="h-9 w-px bg-border" />
            <div className="min-w-0">
              <span className="block text-xs text-muted-foreground">{isFa ? "اولین حرکت" : "First"}</span>
              <strong className="tnum mt-1 block text-sm font-semibold">{persianDigits(summary.first, lang)}</strong>
            </div>
            <div aria-hidden="true" className="h-9 w-px bg-border" />
            <div className="min-w-0">
              <span className="block text-xs text-muted-foreground">{isFa ? "آخرین حرکت" : "Last"}</span>
              <strong className="tnum mt-1 block text-sm font-semibold">{persianDigits(summary.last, lang)}</strong>
            </div>
          </div>
        ) : (
          <p className="py-4 text-center text-xs text-muted-foreground">
            {isFa ? "برای این روز حرکت ثبت‌شده‌ای نداریم." : "No departures published for this day."}
          </p>
        )}
        {summary && (
          <>
            <button type="button" aria-expanded={expanded} aria-controls="station-guide-full-timetable"
              onClick={() => setExpanded(value => !value)}
              className="mt-3 flex min-h-11 w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary">
              <span>{expanded
                ? isFa ? "بستن برنامه کامل" : "Hide full timetable"
                : isFa ? "نمایش برنامه کامل" : "View full timetable"}</span>
              <span className="flex items-center gap-2 text-muted-foreground">
                {persianDigits(summary.count, lang)} {isFa ? "حرکت" : "trains"}
                <ChevronDown aria-hidden="true" className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
              </span>
            </button>
            <div id="station-guide-full-timetable" hidden={!expanded}>
              {expanded && <div className="mt-3 max-h-72 space-y-4 overflow-y-auto rounded-lg border border-border p-3">
                {groups.map(([directionId, times]) => (
                  <div key={directionId}>
                    <h3 className="mb-2 text-xs font-semibold">
                      {isFa ? "به سمت " : "To "}{terminalName(directionId)}
                    </h3>
                    <ul className="flex flex-wrap gap-1.5">
                      {times.map((time, i) => (
                        <li key={`${time}-${i}`}>
                          <time dateTime={time} className="tnum inline-flex min-h-8 items-center rounded-md bg-muted px-2 py-1 text-xs">
                            {persianDigits(time, lang)}
                          </time>
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
          {notice}
        </p>
        <a className="mt-2 inline-flex min-h-9 items-center text-xs text-primary underline-offset-2 hover:underline"
          href={source.url} target="_blank" rel="noopener noreferrer">
          {isFa ? "منبع جدول حرکت" : "Timetable source"}: {source.name}
        </a>
      </section>
    </div>
  );
}
