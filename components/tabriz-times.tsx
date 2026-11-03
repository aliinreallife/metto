"use client";

import { useEffect, useState } from "react";
import { useHolidayData } from "@/lib/holidays/use-holiday-data";
import { findTabrizTrips, tabrizServiceData } from "@/lib/tabriz-timetable";
import { STRINGS, persianDigits, type Lang } from "@/lib/i18n";
import { MissedDeadlineCard, NoServiceCard, PathRoutePanel, TimetabledJourneyFrame } from "./route-panel";
import { stationByCityId } from "@/lib/city-catalog";
import { tehranMinuteToInstant, parseServiceTimeToMinutes } from "@/lib/tehran-time";
import { RatePromptHost } from "./rate-prompt";
import type { IsfahanJourney } from "./isfahan-times";

function usePublishedClock() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setNow(Date.now());
    queueMicrotask(update);
    const interval = setInterval(update, 30_000);
    const visible = () => { if (!document.hidden) update(); };
    window.addEventListener("pageshow", update);
    document.addEventListener("visibilitychange", visible);
    return () => { clearInterval(interval); window.removeEventListener("pageshow", update);
      document.removeEventListener("visibilitychange", visible); };
  }, []);
  return now;
}
const uncertainDayNote = (lang: Lang) => lang === "fa"
  ? "الگوی حرکت پنجشنبه و تعطیلات تبریز هنوز توسط بهره‌بردار تأیید نشده است."
  : "Tabriz Thursday and holiday operating patterns are not yet operator-confirmed.";

export function TabrizTimes({ from, to, lang, plannedAt, arriveBy = false }: {
  from: string; to?: string; lang: Lang; plannedAt?: number; arriveBy?: boolean;
}) {
  const now = usePublishedClock();
  const { dataset } = useHolidayData();
  const t = STRINGS[lang];
  if (now === null) return <p role="status" className="text-xs text-muted-foreground">
    {lang === "fa" ? "در حال بارگذاری زمان‌بندی..." : "Loading schedule..."}</p>;
  const targetIds = to ? [to] :
    [tabrizServiceData.stationIds[0], tabrizServiceData.stationIds.at(-1)!].filter(id => id !== from);
  const results = targetIds.map(id => findTabrizTrips(from, id, plannedAt ?? now, dataset,
    { arriveBy, notBeforeMs: now }));
  return <div data-testid="tabriz-times" className="flex flex-col gap-2 text-sm"
    aria-label={lang === "fa" ? "زمان‌بندی تبریز" : "Tabriz departures"}>
    {results[0]?.holidayAssumption && <p role="status" className="text-xs text-muted-foreground">{uncertainDayNote(lang)}</p>}
    {results.map((result, index) => {
      const trip = result.trips[0];
      if (!trip) return <p key={index} role="status" className="text-xs text-muted-foreground">
        {lang === "fa" ? "در منبع فعلی حرکت دیگری ثبت نشده؛ احتمال سرویس اضافه وجود دارد."
          : "No later departure in this source; additional service may operate."}</p>;
      const terminal = stationByCityId.get(trip.terminalId)?.names[lang] ?? "";
      return <div key={index} className="flex flex-col gap-1">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <strong className="tnum text-xl" dir="ltr">{persianDigits(trip.departure, lang)}</strong>
          <span>{t.towards} {terminal}</span>
        </p>
        {to && <p>{t.isfahanScheduledArrival} <strong className="tnum" dir="ltr">{persianDigits(trip.arrival, lang)}</strong>
          {" · "}{persianDigits(trip.minutes, lang)} {t.isfahanMinutes}</p>}
        {!arriveBy && result.trips.length > 1 && <p className="text-xs text-muted-foreground">
          {t.isfahanFollowingTrains} <span className="tnum" dir="ltr">
            {result.trips.slice(1, 3).map(tr => persianDigits(tr.departure, lang)).join(" · ")}
          </span></p>}
      </div>;
    })}
  </div>;
}

/** Tehran's shared journey chrome with Tabriz-specific, source-backed rows. */
export function TabrizJourney({ plannedAt, stationIds, arriveBy = false,
  onEditTime, onUseNow, published, nowMs, ...path }: Parameters<typeof IsfahanJourney>[0]) {
  const mountedNow = usePublishedClock();
  const { dataset } = useHolidayData();
  const t = STRINGS[path.lang];
  // Hydration-safe: neither the published schedule nor the browser clock
  // is rendered until the client has mounted.
  if (mountedNow === null) return <p role="status" className="text-xs text-muted-foreground">
    {path.lang === "fa" ? "در حال بارگذاری زمان‌بندی..." : "Loading schedule..."}</p>;
  const now = nowMs ?? mountedNow;
  const from = stationIds[0], to = stationIds.at(-1)!;
  const selection = published ?? findTabrizTrips(from, to, plannedAt ?? now, dataset,
    { arriveBy, notBeforeMs: now });
  const trip = selection.trips[0];
  if (!trip) {
    if (arriveBy && plannedAt !== undefined) {
      const forward = findTabrizTrips(from, to, now, dataset);
      const next = forward.trips[0];
      if (next) {
        const earliestArrivalMs = tehranMinuteToInstant(forward.dateStr,
          parseServiceTimeToMinutes(next.arrival));
        if (earliestArrivalMs > plannedAt)
          return <div data-testid="tabriz-missed-deadline">
            <MissedDeadlineCard lang={path.lang} deadlineMs={plannedAt}
              earliestArrivalMs={earliestArrivalMs} onEditTime={onEditTime}
              onRouteFromNow={onUseNow} />
          </div>;
      }
    }
    return <div data-testid="tabriz-no-service">
      <p role="status" data-testid="tabriz-source-limit-note"
        className="mb-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
        {path.lang === "fa"
          ? "در جدول منتشرشده سفر دیگری برای این زمان پیدا نشد. ممکن است قطارهای دیرتر فعال باشند؛ اطلاعیهٔ ایستگاه را بررسی کنید."
          : "No matching train in the published table. Later trains may operate; check station announcements."}
      </p>
      <NoServiceCard lang={path.lang}
        stationName={path.name(from)} reachableUntil="" isOrigin
        onPlanAnotherTime={onEditTime} />
    </div>;
  }
  return <div data-testid="tabriz-journey" className="flex flex-col gap-3 md:gap-4">
    {selection.holidayAssumption && <p data-testid="tabriz-operating-pattern-note" role="status"
      className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
      {uncertainDayNote(path.lang)}
    </p>}
    <TimetabledJourneyFrame lang={path.lang} stationCount={stationIds.length}
      waitMinutes={arriveBy ? 0 : Math.max(0, Math.round((trip.departureMs - (plannedAt ?? now)) / 60_000))}
      travelMinutes={trip.minutes} arrival={trip.arrival} departedAtMs={trip.departureMs}
      originName={path.name(from)} arriveBy={arriveBy} note={t.timeNote}
      afterStats={<RatePromptHost lang={path.lang} routeSucceeded
        routeKey={`tabriz|${from}|${to}|${arriveBy ? "arrive" : plannedAt === undefined ? "now" : "depart"}|${plannedAt ?? "now"}`} />}>
      <PathRoutePanel {...path} showSummary={false} stationCount={stationIds.length}
        nextTrip={trip}
        followingTimes={!arriveBy && plannedAt === undefined
          ? selection.trips.slice(1, 3).map(next => next.departure) : []}
        isPlanned={plannedAt !== undefined} />
    </TimetabledJourneyFrame>
  </div>;
}
