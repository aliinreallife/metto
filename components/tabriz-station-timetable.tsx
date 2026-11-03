"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { findTabrizTrips, tabrizServiceData, tabrizServiceDay, type TabrizServiceId } from "@/lib/tabriz-timetable";
import { stationByCityId } from "@/lib/city-catalog";
import { cityDataCredit } from "@/lib/data-credit";
import { STRINGS, persianDigits, type Lang } from "@/lib/i18n";
import type { HolidayDataset } from "@/lib/holidays/local-dataset";

const terminals = [tabrizServiceData.stationIds[0], tabrizServiceData.stationIds.at(-1)!];
const name = (id: string, lang: Lang) => stationByCityId.get(id)?.names[lang] ?? id;

export function TabrizStationDepartures({ stationId, lang, nowMs, holidays }: {
  stationId: string; lang: Lang; nowMs: number | null; holidays: HolidayDataset | null;
}) {
  if (nowMs === null) return null;
  const t = STRINGS[lang];
  const groups = terminals.filter(id => id !== stationId).map(id => ({
    id, trips: findTabrizTrips(stationId, id, nowMs, holidays).trips.slice(0, 2),
  })).filter(group => group.trips.length > 0);
  if (!groups.length) return null;
  return <div className="border-t border-border px-4 py-2" data-testid="tabriz-station-departures">
    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      {t.isfahanPublishedTimes}
    </p>
    <div className="flex flex-col gap-1.5">{groups.map(group =>
      <p key={group.id} className="flex flex-wrap items-baseline gap-1.5 text-xs">
        <span className="text-muted-foreground">{t.towards} {name(group.id, lang)}</span>
        {group.trips.map(trip => <span key={trip.id} className="tnum font-semibold" dir="ltr">
          {persianDigits(trip.departure, lang)}</span>)}
      </p>)}</div>
  </div>;
}

export function TabrizStationTimesheet({ stationId, lang, initialPattern, onClose }: {
  stationId: string; lang: Lang; initialPattern: TabrizServiceId; onClose: () => void;
}) {
  const t = STRINGS[lang];
  const [pattern, setPattern] = useState<TabrizServiceId>(initialPattern);
  const [selectedTerminal, setSelectedTerminal] = useState<string | null>(null);
  const index = tabrizServiceData.stationIds.indexOf(stationId);
  const groups = terminals.filter(id => id !== stationId).map(id => ({
    id, times: tabrizServiceData.trips
      .filter(tr => tr.serviceId === pattern && tr.direction ===
        (id === terminals[1] ? "to_noor" : "to_el_goli"))
      .map(tr => index < 0 ? null : tr.times[index])
      .filter((time): time is string => !!time)
      .sort((a, b) => a.localeCompare(b)),
  }));
  return <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card"
    data-testid="tabriz-station-timesheet">
    <div className="flex items-center justify-between border-b border-border px-4 py-3">
      <div>
        <h3 className="text-base font-bold">{lang === "fa" ? "برنامه حرکت" : "Timetable"}</h3>
        <p className="text-sm text-muted-foreground">{name(stationId, lang)}</p>
      </div>
      <button type="button" aria-label={t.close} onClick={onClose}
        className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
    <div className="flex gap-1 border-b border-border px-4 py-2">
      {([
        { id: "normal" as const, label: lang === "fa" ? "روزهای عادی" : "Normal days" },
        { id: "holiday" as const, label: lang === "fa" ? "جمعه / تعطیلات (آزمایشی)" : "Friday / holidays (provisional)" },
      ]).map(item =>
        <button key={item.id} type="button"
          onClick={() => { setPattern(item.id); setSelectedTerminal(null); }}
          aria-pressed={pattern === item.id}
          className={pattern === item.id
            ? "rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
            : "rounded-full px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"}>
          {item.label}
        </button>)}
    </div>
    {pattern === "holiday" && <p className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
      {lang === "fa" ? "اجرای برنامهٔ تعطیلات نیازمند تأیید بهره‌بردار است." : "Holiday operating pattern is not operator-confirmed."}
    </p>}
    {groups.length > 1 && <div className="flex flex-wrap gap-1 border-b border-border px-4 py-2">
      <button type="button" aria-pressed={selectedTerminal === null}
        onClick={() => setSelectedTerminal(null)}
        className={selectedTerminal === null ? "rounded-full bg-secondary px-3 py-1 text-xs font-medium" : "rounded-full px-3 py-1 text-xs text-muted-foreground hover:bg-muted"}>
        {t.all}
      </button>
      {groups.map(group => <button type="button" key={group.id}
        aria-pressed={selectedTerminal === group.id}
        onClick={() => setSelectedTerminal(group.id)}
        className={selectedTerminal === group.id ? "rounded-full bg-secondary px-3 py-1 text-xs font-medium" : "rounded-full px-3 py-1 text-xs text-muted-foreground hover:bg-muted"}>
        {t.towards} {name(group.id, lang)}
      </button>)}
    </div>}
    <div className="max-h-[60vh] min-h-20 overflow-y-auto px-4 py-3">
      {groups.filter(group => (selectedTerminal === null || group.id === selectedTerminal) &&
        group.times.length > 0).map(group =>
        <section key={group.id} className="mb-4 last:mb-0">
          <h4 className="mb-2 text-xs font-semibold text-muted-foreground">
            {t.towards} {name(group.id, lang)} · {persianDigits(group.times.length, lang)}
          </h4>
          <div className="flex flex-wrap gap-1">
            {group.times.map((time, i) =>
              <span key={i} className="tnum rounded-md bg-muted px-1.5 py-0.5 text-xs" dir="ltr">
                {persianDigits(time, lang)}</span>)}
          </div>
        </section>)}
    </div>
    <a href={cityDataCredit("tabriz").url} target="_blank" rel="noopener noreferrer"
      className="border-t border-border px-4 py-2 text-xs text-muted-foreground underline underline-offset-4">
      {lang === "fa" ? "منبع جدول: TimeMetro (غیررسمی)" : "Time source: TimeMetro (unofficial)"}
    </a>
  </div>;
}

// Typed date helper for keeping the station modal's default pattern in sync.
export { tabrizServiceDay };
