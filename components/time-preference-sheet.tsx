"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { STRINGS, persianDigits, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { TEHRAN_TZ, formatTehranClock, tehranMinuteToInstant, tehranParts } from "@/lib/tehran-time";
import { nextTehranCalendarDate } from "@/lib/holidays/jalali";
import type { TimeMode } from "@/lib/route-planning";

/** Compact summary of a planned instant: "Today · 08:30" parts. */
export function formatPlanSummary(
  lang: Lang,
  atMs: number,
  nowMs: number,
): { dateLabel: string; timeLabel: string } {
  const t = STRINGS[lang];
  const today = tehranParts(nowMs).dateStr;
  const tomorrow = nextTehranCalendarDate(today);
  const dateStr = tehranParts(atMs).dateStr;
  let dateLabel: string;
  if (dateStr === today) dateLabel = t.today;
  else if (dateStr === tomorrow) dateLabel = t.tomorrow;
  else {
    try {
      dateLabel = new Intl.DateTimeFormat(lang === "fa" ? "fa-IR" : "en-GB", {
        timeZone: TEHRAN_TZ,
        day: "numeric",
        month: "short",
      }).format(new Date(atMs));
    } catch {
      dateLabel = dateStr;
    }
  }
  return { dateLabel, timeLabel: persianDigits(formatTehranClock(atMs), lang) };
}

function nextQuarterHour(nowMs: number): { dateStr: string; time: string } {
  const parts = tehranParts(nowMs);
  const rounded = Math.ceil((parts.minuteOfDay + 1) / 5) * 5;
  if (rounded >= 24 * 60) {
    const tomorrow = nextTehranCalendarDate(parts.dateStr);
    return { dateStr: tomorrow, time: "00:00" };
  }
  const hh = String(Math.floor(rounded / 60)).padStart(2, "0");
  const mm = String(rounded % 60).padStart(2, "0");
  return { dateStr: parts.dateStr, time: `${hh}:${mm}` };
}

export function TimePreferenceSheet({
  lang,
  mode,
  atMs,
  onApply,
  onClose,
}: {
  lang: Lang;
  mode: TimeMode;
  atMs: number | null;
  onApply: (mode: TimeMode, nextAtMs: number | null) => void;
  onClose: () => void;
}) {
  const t = STRINGS[lang];
  // The sheet mounts fresh on every open (parent renders conditionally), so
  // lazy initializers seed from the current plan exactly once — no effects.
  const [selMode, setSelMode] = useState<TimeMode>(mode);
  const [todayStr] = useState(() => tehranParts(Date.now()).dateStr);
  const tomorrowStr = nextTehranCalendarDate(todayStr);
  const [dateSel, setDateSel] = useState<"today" | "tomorrow" | "custom">(() => {
    if (atMs === null) return "today";
    const atDate = tehranParts(atMs).dateStr;
    return atDate === todayStr ? "today" : atDate === tomorrowStr ? "tomorrow" : "custom";
  });
  const [customDate, setCustomDate] = useState(() =>
    atMs !== null ? tehranParts(atMs).dateStr : tomorrowStr,
  );
  const [time, setTime] = useState(() =>
    atMs !== null ? formatTehranClock(atMs) : nextQuarterHour(Date.now()).time,
  );

  // Escape closes; background scroll locks while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const effectiveDate =
    dateSel === "today" ? todayStr : dateSel === "tomorrow" ? tomorrowStr : customDate;

  function apply() {
    if (selMode === "now") {
      onApply("now", null);
      return;
    }
    if (!effectiveDate) return;
    const [hh, mm] = time.split(":").map(Number);
    if (!Number.isInteger(hh) || !Number.isInteger(mm)) return;
    onApply(selMode, tehranMinuteToInstant(effectiveDate, hh * 60 + mm));
  }

  const choices: { value: Exclude<TimeMode, "now">; label: string; hint: string }[] = [
    { value: "depart", label: t.timeDepartChoice, hint: t.timeDepartHint },
    { value: "arrive", label: t.timeArriveChoice, hint: t.timeArriveHint },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-4">
      <button
        type="button"
        aria-label={t.close}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.planTrip}
        className="relative flex max-h-[85vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-2xl border border-border bg-card p-4 shadow-xl transition-transform duration-150 md:rounded-2xl md:p-5"
      >
        <div className="flex items-center gap-2">
          <Clock aria-hidden="true" className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-bold md:text-base">{t.planTrip}</h2>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">{t.when}</legend>
          <label
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors focus-within:ring-2 focus-within:ring-ring",
              selMode === "now" ? "border-primary bg-primary/5" : "border-border",
            )}
          >
            <input
              type="radio"
              name="time-mode"
              checked={selMode === "now"}
              onChange={() => setSelMode("now")}
              className="size-4 accent-primary"
            />
            <span className="font-semibold">{t.timeNow}</span>
          </label>

          {choices.map((c) => (
            <label
              key={c.value}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors focus-within:ring-2 focus-within:ring-ring",
                selMode === c.value ? "border-primary bg-primary/5" : "border-border",
              )}
            >
              <input
                type="radio"
                name="time-mode"
                checked={selMode === c.value}
                onChange={() => setSelMode(c.value)}
                className="size-4 accent-primary"
              />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{c.label}</span>
                <span className="block text-xs text-muted-foreground">{c.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {selMode !== "now" && (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2" role="group" aria-label={t.pickDate}>
              <button
                type="button"
                onClick={() => setDateSel("today")}
                aria-pressed={dateSel === "today"}
                className={cn(
                  "rounded-xl border px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  dateSel === "today"
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground",
                )}
              >
                {t.today}
              </button>
              <button
                type="button"
                onClick={() => setDateSel("tomorrow")}
                aria-pressed={dateSel === "tomorrow"}
                className={cn(
                  "rounded-xl border px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  dateSel === "tomorrow"
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground",
                )}
              >
                {t.tomorrow}
              </button>
            </div>
            <div className="flex gap-2">
              <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
                {t.pickTime}
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  dir="ltr"
                  className="rounded-xl border border-border bg-background px-3 py-2 text-center text-base text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
              <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
                {t.pickDate}
                <input
                  type="date"
                  value={dateSel === "custom" ? customDate : dateSel === "today" ? todayStr : tomorrowStr}
                  min={todayStr}
                  onChange={(e) => {
                    setCustomDate(e.target.value);
                    setDateSel("custom");
                  }}
                  onFocus={() => setDateSel("custom")}
                  dir="ltr"
                  className="rounded-xl border border-border bg-background px-3 py-2 text-center text-base text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-border px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t.close}
          </button>
          <button
            type="button"
            onClick={apply}
            className="flex-1 rounded-xl bg-primary px-3 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t.done}
          </button>
        </div>
      </div>
    </div>
  );
}
