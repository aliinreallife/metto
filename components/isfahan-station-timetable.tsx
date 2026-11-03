"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { findIsfahanTrips, isfahanServiceData, isfahanServiceDay } from "@/lib/isfahan-timetable";
import { stationByCityId } from "@/lib/city-catalog";
import { METTO_DATA_CREDIT } from "@/lib/data-credit";
import { STRINGS, persianDigits, type Lang } from "@/lib/i18n";
import type { HolidayDataset } from "@/lib/holidays/local-dataset";

type Pattern = "saturday_thursday" | "friday";
const terminalIds = [isfahanServiceData.stationIds[0], isfahanServiceData.stationIds.at(-1)!];
const stationName = (id: string, lang: Lang) => stationByCityId.get(id)?.names[lang] ?? id;

/** Compact, source-backed departure rows for the shared city station cards. */
export function IsfahanStationDepartures({ stationId, lang, nowMs, holidays }: {
  stationId: string; lang: Lang; nowMs: number | null; holidays: HolidayDataset | null;
}) {
  if (nowMs === null) return null;
  const t = STRINGS[lang];
  const service = isfahanServiceDay(nowMs, holidays);
  const closed = service.serviceId === "friday" && isfahanServiceData.release.fridayNoBoardingStationIds.includes(stationId);
  if (closed) return <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">{t.isfahanNoBoarding}</p>;
  // Outside the known date coverage, never promise a train based on a day-pattern guess.
  if (!service.applicable) return null;
  const groups = terminalIds.filter(id => id !== stationId).map(id => ({
    id, trips: findIsfahanTrips(stationId, id, nowMs, holidays).trips.slice(0, 2),
  })).filter(group => group.trips.length > 0);
  if (!groups.length) return null;
  return <div className="border-t border-border px-4 py-2" data-testid="isfahan-station-departures">
    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t.isfahanPublishedTimes}</p>
    <div className="flex flex-col gap-1.5">{groups.map(group =>
      <p key={group.id} className="flex flex-wrap items-baseline gap-1.5 text-xs">
        <span className="text-muted-foreground">{t.towards} {stationName(group.id, lang)}</span>
        {group.trips.map(trip => <span className="tnum font-semibold" dir="ltr" key={trip.id}>{persianDigits(trip.departure, lang)}</span>)}
      </p>,
    )}</div>
    {service.holidayAssumption && <p className="mt-1 text-[10px] text-muted-foreground">{t.isfahanHolidayAssumption}</p>}
  </div>;
}

/** Tehran-style station timesheet, using Isfahan's own verified printed rows. */
export function IsfahanStationTimesheet({ stationId, lang, onClose, initialPattern }: {
  stationId: string; lang: Lang; onClose: () => void; initialPattern: Pattern;
}) {
  const t = STRINGS[lang];
  const [pattern, setPattern] = useState<Pattern>(initialPattern);
  const [selectedTerminal, setSelectedTerminal] = useState<string | null>(null);
  const idIndex = isfahanServiceData.stationIds.indexOf(stationId);
  const closed = pattern === "friday" && isfahanServiceData.release.fridayNoBoardingStationIds.includes(stationId);
  const targets = terminalIds.filter(id => id !== stationId);
  const groups = useMemo(() => targets.map(id => {
    const direction = id === terminalIds[1] ? "qods_to_defa" : "defa_to_qods";
    const times = idIndex < 0 ? [] : isfahanServiceData.trips
      .filter(trip => trip.serviceId === pattern && trip.direction === direction)
      .flatMap(trip => trip.times[idIndex] ? [trip.times[idIndex]!] : [])
      .sort((a, b) => a.localeCompare(b));
    return { id, times };
  }), [pattern, idIndex, targets.join("|")]);

  return <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card" data-testid="isfahan-station-timesheet">
    <div className="flex items-center justify-between border-b border-border px-4 py-3">
      <div>
        <h3 className="text-base font-bold">{lang === "fa" ? "برنامه حرکت" : "Timetable"}</h3>
        <p className="text-sm text-muted-foreground">{stationName(stationId, lang)}</p>
      </div>
      <button type="button" onClick={onClose} aria-label={t.close}
        className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary">
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
    <div className="flex gap-1 border-b border-border px-4 py-2">
      {([
        { id: "saturday_thursday", label: lang === "fa" ? "شنبه تا پنجشنبه" : "Sat–Thu" },
        { id: "friday", label: lang === "fa" ? "جمعه / تعطیلات (موقت)" : "Friday / holidays (provisional)" },
      ] as const).map(item =>
        <button key={item.id} type="button" onClick={() => { setPattern(item.id); setSelectedTerminal(null); }}
          aria-pressed={pattern === item.id}
          className={pattern === item.id ? "rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground" : "rounded-full px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"}>
          {item.label}
        </button>,
      )}
    </div>
    {pattern === "friday" && <p className="border-b border-border px-4 py-2 text-xs text-muted-foreground">{t.isfahanHolidayAssumption}</p>}
    {!closed && targets.length > 1 && <div className="flex flex-wrap gap-1 border-b border-border px-4 py-2">
      <button type="button" aria-pressed={selectedTerminal === null} onClick={() => setSelectedTerminal(null)}
        className={selectedTerminal === null ? "rounded-full bg-secondary px-3 py-1 text-xs font-medium" : "rounded-full px-3 py-1 text-xs text-muted-foreground hover:bg-muted"}>
        {t.all}
      </button>
      {targets.map(id => <button type="button" key={id} aria-pressed={selectedTerminal === id} onClick={() => setSelectedTerminal(id)}
        className={selectedTerminal === id ? "rounded-full bg-secondary px-3 py-1 text-xs font-medium" : "rounded-full px-3 py-1 text-xs text-muted-foreground hover:bg-muted"}>
        {t.towards} {stationName(id, lang)}
      </button>)}
    </div>}
    <div className="max-h-[60vh] min-h-20 overflow-y-auto px-4 py-3">
      {closed ? <p role="status" className="py-4 text-center text-sm">{t.isfahanNoBoarding}</p>
        : groups.filter(group => (selectedTerminal === null || group.id === selectedTerminal) && group.times.length > 0).map(group =>
          <section key={group.id} className="mb-4 last:mb-0">
            <h4 className="mb-2 text-xs font-semibold text-muted-foreground">
              {t.towards} {stationName(group.id, lang)} · {persianDigits(group.times.length, lang)}
            </h4>
            <div className="flex flex-wrap gap-1">
              {group.times.map((time, index) =>
                <span key={index} dir="ltr" className="tnum rounded-md bg-muted px-1.5 py-0.5 text-xs">{persianDigits(time, lang)}</span>,
              )}
            </div>
          </section>,
        )}
    </div>
    <a href={METTO_DATA_CREDIT.url} target="_blank" rel="noopener noreferrer"
      className="border-t border-border px-4 py-2 text-xs text-muted-foreground underline underline-offset-4">
      {t.isfahanTimetableSource}
    </a>
  </div>;
}
