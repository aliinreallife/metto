"use client";

import { CalendarDays, ChevronDown } from "lucide-react";
import { useState } from "react";
import { STRINGS, persianDigits, type Lang } from "@/lib/i18n";
import { useHolidayData } from "@/lib/holidays/use-holiday-data";
import { gregorianToJalali } from "@/lib/holidays/jalali";
import { tehranParts } from "@/lib/tehran-time";
import { cn } from "@/lib/utils";

/** Compact holiday summary for the timetable area (offline, same dataset). */
export function HolidayCard({ lang }: { lang: Lang }) {
  const t = STRINGS[lang];
  const isFa = lang === "fa";
  const [open, setOpen] = useState(false);
  const {
    dataset,
    loaded,
    scheduleDay,
    nextHoliday,
    upcoming,
  } = useHolidayData();

  if (!loaded || !dataset) return null;

  // Friday and official holidays share the same timetable rows, but the
  // visible reason differs: Friday is weekly, others are calendar holidays.
  const weekday = (() => {
    try {
      return tehranParts(Date.now()).dayType;
    } catch {
      return "saturday_wednesday" as const;
    }
  })();
  const scheduleLabel =
    weekday === "friday"
      ? t.scheduleFriday
      : scheduleDay === "holiday"
        ? t.scheduleHoliday
        : scheduleDay === "thursday"
          ? t.scheduleThursday
          : t.scheduleWeekday;

  const lastUpdateJalali = (() => {
    try {
      const greg = dataset.lastSuccessfulSync.slice(0, 10);
      return gregorianToJalali(greg).replaceAll("-", "/");
    } catch {
      return dataset.lastSuccessfulSync.slice(0, 10);
    }
  })();

  const fmtJalali = (jalali: string) =>
    persianDigits(jalali.replaceAll("-", "/"), lang);

  return (
    <section
      aria-label={t.holidaysTitle}
      className="flex flex-col gap-1.5 rounded-xl border border-border bg-card px-3 py-2.5 text-xs md:text-sm"
    >
      <div className="flex items-center gap-2">
        <CalendarDays className="size-4 shrink-0 text-primary" />
        <h3 className="font-bold">{t.holidaysTitle}</h3>
        <span className="ms-auto rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {t.todaySchedule}: {scheduleLabel}
        </span>
      </div>

      <p className="text-[11px] text-muted-foreground md:text-xs">
        {t.holidayLastUpdate}:{" "}
        <span className="tnum font-medium text-foreground">
          {persianDigits(lastUpdateJalali, lang)}
        </span>
      </p>

      {nextHoliday ? (
        <p className="truncate text-[11px] md:text-xs">
          <span className="text-muted-foreground">
            {isFa ? "نزدیک‌ترین: " : "Next: "}
          </span>
          <span className="tnum font-semibold">
            {fmtJalali(nextHoliday.jalaliDate)}
          </span>{" "}
          — {isFa ? nextHoliday.faName : nextHoliday.enName}
        </p>
      ) : null}

      {upcoming.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="flex items-center gap-1 self-start rounded-md px-1 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/5"
          >
            <ChevronDown
              className={cn("size-3.5 transition-transform", open && "rotate-180")}
            />
            {t.upcomingHolidays} ({persianDigits(upcoming.length, lang)})
          </button>
          {open && (
            <ul className="flex flex-col gap-1 border-t border-border pt-1.5">
              {upcoming.map((h) => (
                <li
                  key={h.gregorianDate}
                  className="flex items-baseline gap-2 text-[11px] md:text-xs"
                >
                  <span className="tnum shrink-0 font-semibold">
                    {fmtJalali(h.jalaliDate)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {isFa ? h.faName : h.enName}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <p className="text-[10px] leading-relaxed text-muted-foreground md:text-[11px]">
        {t.holidayCoverageNote}
      </p>
    </section>
  );
}
