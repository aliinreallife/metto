"use client";
import { useEffect, useState } from "react";
import { useHolidayData } from "@/lib/holidays/use-holiday-data";
import { findIsfahanTrips, isfahanServiceData, isfahanServiceDay } from "@/lib/isfahan-timetable";
import { STRINGS, persianDigits, type Lang } from "@/lib/i18n";
import { formatDateLabel } from "@/lib/route-planning";
import { tehranParts } from "@/lib/tehran-time";
import { PathRoutePanel, RouteSummaryStats } from "./route-panel";
import { METTO_DATA_CREDIT } from "@/lib/data-credit";
import { stationByCityId } from "@/lib/city-catalog";

/** Published times, not real-time train positions. Uses Iran's clock on every device. */
export function IsfahanTimes({ from, to, lang, plannedAt, arriveBy = false, stationIds }: { from: string; to?: string; lang: Lang; plannedAt?: number; arriveBy?: boolean; stationIds?: string[] }) {
  const [now, setNow] = useState<number | null>(null);
  const { dataset } = useHolidayData();
  useEffect(() => {
    const update = () => setNow(Date.now());
    queueMicrotask(update);
    const timer = setInterval(update, 30_000);
    return () => clearInterval(timer);
  }, []);
  const t = STRINGS[lang];
  if (now === null) return <p role="status" className="text-xs text-muted-foreground">{t.isfahanLoading}</p>;
  const targetIds = to ? [to] : [isfahanServiceData.stationIds[0], isfahanServiceData.stationIds.at(-1)!].filter(id => id !== from);
  const results = targetIds.map(id => findIsfahanTrips(from, id, plannedAt ?? now, dataset, { arriveBy, notBeforeMs: now }));
  const service = results[0];
  const firstTrip = service?.trips[0];
  const closed = service?.serviceId === "friday" ? isfahanServiceData.release.fridayNoBoardingStationIds : [];
  return <div className="flex flex-col gap-3">
    {firstTrip && stationIds && <RouteSummaryStats lang={lang}
      stationCount={stationIds.filter(id => !closed.includes(id)).length}
      waitMinutes={arriveBy ? 0 : Math.max(0, Math.round((firstTrip.departureMs - (plannedAt ?? now)) / 60_000))}
      travelMinutes={firstTrip.minutes} arrival={firstTrip.arrival} departedAtMs={firstTrip.departureMs} />}
    <div data-testid="isfahan-times" className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-sm" aria-label={t.isfahanPublishedTimes}>
    <p className="text-xs font-medium text-muted-foreground">{t.isfahanPublishedTimes}</p>
    {service?.holidayAssumption && <p role="status" data-testid="isfahan-holiday-assumption" className="text-sm font-medium">{t.isfahanHolidayAssumption}</p>}
    {service?.calendarUnknown && <p role="status" className="text-xs text-muted-foreground">{service.applicable ? t.isfahanCalendarProvisional : t.isfahanCalendarUnknown}</p>}
    {service && !service.applicable && !service.calendarUnknown && <p role="status">{t.isfahanCalendarUnknown}</p>}
    {service?.applicable && results.slice(0, service.blocked ? 1 : results.length).map((result, i) => {
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
    <a className="self-start text-xs text-muted-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-primary" href={METTO_DATA_CREDIT.url} target="_blank" rel="noreferrer">{t.isfahanTimetableSource}</a>
  </div></div>;
}

/** Keep Friday's physical track, but do not count closed boarding points as stops. */
export function IsfahanPathPanel(props: Parameters<typeof PathRoutePanel>[0] & { plannedAt?: number; stationIds: string[]; arriveBy?: boolean }) {
  const { plannedAt, stationIds, arriveBy, ...rest } = props;
  const { dataset } = useHolidayData();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setNow(Date.now()); queueMicrotask(update);
    const timer = setInterval(update, 30_000); return () => clearInterval(timer);
  }, []);
  const service = now === null ? null : arriveBy ? findIsfahanTrips(stationIds[0], stationIds.at(-1)!, plannedAt ?? now, dataset, { arriveBy: true, notBeforeMs: now }) : isfahanServiceDay(plannedAt ?? now, dataset);
  const closed = service?.serviceId === "friday" ? isfahanServiceData.release.fridayNoBoardingStationIds : [];
  return <PathRoutePanel {...rest} showSummary={false} stationCount={stationIds.filter(id => !closed.includes(id)).length}
    stationNote={id => closed.includes(id) ? STRINGS[props.lang].isfahanNoStopNote : undefined} />;
}
