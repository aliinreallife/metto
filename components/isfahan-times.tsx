"use client";
import { useEffect, useState } from "react";
import { useHolidayData } from "@/lib/holidays/use-holiday-data";
import { findIsfahanTrips, isfahanServiceData } from "@/lib/isfahan-timetable";
import { STRINGS, persianDigits, type Lang } from "@/lib/i18n";
import { formatDateLabel } from "@/lib/route-planning";
import { tehranParts, parseServiceTimeToMinutes, tehranMinuteToInstant } from "@/lib/tehran-time";
import { MissedDeadlineCard, NoServiceCard, PathRoutePanel, TimetabledJourneyFrame } from "./route-panel";
import { stationByCityId } from "@/lib/city-catalog";
import { RatePromptHost } from "./rate-prompt";

function usePublishedClock() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setNow(Date.now());
    queueMicrotask(update);
    const timer = setInterval(update, 30_000);
    const visible = () => { if (!document.hidden) update(); };
    window.addEventListener("pageshow", update);
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pageshow", update);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  return now;
}

/** Compact departures for station map cards, not a second route-results panel. */
export function IsfahanTimes({ from, to, lang, plannedAt, arriveBy = false }: {
  from: string; to?: string; lang: Lang; plannedAt?: number; arriveBy?: boolean;
}) {
  const now = usePublishedClock();
  const { dataset } = useHolidayData();
  const t = STRINGS[lang];
  if (now === null) return <p role="status" className="text-xs text-muted-foreground">{t.isfahanLoading}</p>;
  const targetIds = to ? [to] : [isfahanServiceData.stationIds[0], isfahanServiceData.stationIds.at(-1)!].filter(id => id !== from);
  const results = targetIds.map(id => findIsfahanTrips(from, id, plannedAt ?? now, dataset, { arriveBy, notBeforeMs: now }));
  const service = results[0];
  if (!service?.applicable) return <p role="status" className="text-xs text-muted-foreground">{t.isfahanCalendarUnknown}</p>;
  return <div data-testid="isfahan-times" className="flex flex-col gap-2 text-sm" aria-label={t.isfahanPublishedTimes}>
    {service.holidayAssumption && <p role="status" className="text-xs text-muted-foreground">{t.isfahanHolidayAssumption}</p>}
    {results.slice(0, service.blocked ? 1 : results.length).map((result, i) => {
      const trip = result.trips[0];
      if (result.blocked) return <p key={i} role="status">{t.isfahanNoBoarding}</p>;
      if (!trip) return <p key={i} role="status">{arriveBy ? t.noJourneyBy : t.isfahanNoMoreTrains}</p>;
      const terminal = stationByCityId.get(trip.terminalId)?.names[lang] ?? "";
      return <div key={i} className="flex flex-col gap-1">
        {arriveBy && result.dateStr !== tehranParts(plannedAt ?? now).dateStr && <p className="text-xs font-medium">{formatDateLabel(lang, result.dateStr, now)}</p>}
        <p className="flex flex-wrap items-baseline gap-x-2"><strong className="tnum text-xl" dir="ltr">{persianDigits(trip.departure, lang)}</strong><span>{t.towards} {terminal}</span></p>
        {to && <p>{t.isfahanScheduledArrival} <strong className="tnum" dir="ltr">{persianDigits(trip.arrival, lang)}</strong> · {persianDigits(trip.minutes, lang)} {t.isfahanMinutes}</p>}
        {!arriveBy && result.trips.length > 1 && <p className="text-xs text-muted-foreground">{t.isfahanFollowingTrains} <span className="tnum" dir="ltr">{result.trips.slice(1, 3).map(tr => persianDigits(tr.departure, lang)).join(" · ")}</span></p>}
      </div>;
    })}
  </div>;
}

/**
 * Timetable-enabled cities must use the same passenger-facing route flow as
 * Tehran: one planned journey, or a specific no-service / missed-deadline card.
 * Isfahan's adapter alone selects a published source row. No extra schedule
 * disclaimer panel, and never a purely geometric trip presented as a train.
 */
export function IsfahanJourney({ plannedAt, stationIds, arriveBy = false, onEditTime, onUseNow, published, nowMs, ...path }: Parameters<typeof PathRoutePanel>[0] & {
  plannedAt?: number; stationIds: string[]; arriveBy?: boolean;
  onEditTime: () => void; onUseNow: () => void;
  published?: ReturnType<typeof findIsfahanTrips> | null; nowMs?: number;
}) {
  const now = usePublishedClock();
  const { dataset } = useHolidayData();
  const t = STRINGS[path.lang];
  // Keep the SSR/client mount gate even when the parent supplies its clock:
  // the server clock can differ from the browser clock during hydration.
  if (now === null) return <p role="status" className="text-xs text-muted-foreground">{t.isfahanLoading}</p>;
  const currentNow = nowMs ?? now!;
  const from = stationIds[0], to = stationIds.at(-1)!;
  const selection = published ?? findIsfahanTrips(from, to, plannedAt ?? currentNow, dataset, { arriveBy, notBeforeMs: currentNow });
  const trip = selection.trips[0];
  if (!selection.applicable) return <p role="status" data-testid="isfahan-service-unknown" className="rounded-xl border border-border bg-card px-4 py-5 text-sm">{t.isfahanCalendarUnknown}</p>;
  if (selection.blocked) return <p role="status" data-testid="isfahan-no-boarding" className="rounded-xl border border-border bg-card px-4 py-5 text-sm">{t.isfahanNoBoarding}</p>;
  if (!trip) {
    if (arriveBy && plannedAt !== undefined) {
      // Tehran's missed-deadline card is used only when a real forward trip
      // proves the next possible arrival is after the requested deadline.
      const forward = findIsfahanTrips(from, to, currentNow, dataset);
      const next = forward.trips[0];
      if (next) {
        const earliestArrivalMs = tehranMinuteToInstant(forward.dateStr, parseServiceTimeToMinutes(next.arrival));
        if (earliestArrivalMs > plannedAt) return <div data-testid="isfahan-missed-deadline"><MissedDeadlineCard lang={path.lang}
          deadlineMs={plannedAt} earliestArrivalMs={earliestArrivalMs}
          onEditTime={onEditTime} onRouteFromNow={onUseNow} /></div>;
      }
    }
    return <div data-testid="isfahan-no-service"><NoServiceCard lang={path.lang}
      stationName={path.name(from)} reachableUntil="" isOrigin onPlanAnotherTime={onEditTime} /></div>;
  }
  const closed = selection.serviceId === "friday" ? isfahanServiceData.release.fridayNoBoardingStationIds : [];
  return <div data-testid="isfahan-times" className="flex flex-col gap-3 md:gap-4">
    {selection.holidayAssumption && <p role="status" data-testid="isfahan-holiday-assumption"
      className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">{t.isfahanHolidayAssumption}</p>}
    <TimetabledJourneyFrame lang={path.lang} stationCount={stationIds.filter(id => !closed.includes(id)).length}
      waitMinutes={arriveBy ? 0 : Math.max(0, Math.round((trip.departureMs - (plannedAt ?? currentNow)) / 60_000))}
      travelMinutes={trip.minutes} arrival={trip.arrival} departedAtMs={trip.departureMs}
      originName={path.name(from)} arriveBy={arriveBy} note={t.timeNote}
      afterStats={<RatePromptHost lang={path.lang} routeSucceeded
        routeKey={`isfahan|${from}|${to}|${arriveBy ? "arrive" : plannedAt === undefined ? "now" : "depart"}|${plannedAt ?? "now"}`} />}>
      <PathRoutePanel {...path} showSummary={false} stationCount={stationIds.filter(id => !closed.includes(id)).length}
        nextTrip={trip} stationNote={id => closed.includes(id) ? t.isfahanNoStopNote : undefined} />
    </TimetabledJourneyFrame>
  </div>;
}
