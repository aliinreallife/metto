"use client";

import { useEffect, useState } from "react";
import { Clock, Minus, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { STRINGS, persianDigits, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { TEHRAN_TZ, formatTehranClock, tehranMidnightEpoch, tehranMinuteToInstant, tehranParts } from "@/lib/tehran-time";
import { nextTehranCalendarDate } from "@/lib/holidays/jalali";
import { shiftTehranDate, shiftTimeOfDay, type TimeMode } from "@/lib/route-planning";

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

/** Jalali-aware display label for a Tehran calendar date. */
export function formatDateLabel(lang: Lang, dateStr: string, nowMs: number): string {
  const t = STRINGS[lang];
  const today = tehranParts(nowMs).dateStr;
  const relative =
    dateStr === today
      ? t.today
      : dateStr === nextTehranCalendarDate(today)
        ? t.tomorrow
        : null;
  let absolute: string;
  try {
    absolute = new Intl.DateTimeFormat(lang === "fa" ? "fa-IR" : "en-GB", {
      timeZone: TEHRAN_TZ,
      day: "numeric",
      month: "short",
    }).format(new Date(tehranMidnightEpoch(dateStr) + 12 * 3_600_000));
  } catch {
    absolute = dateStr;
  }
  return relative ? `${relative} · ${absolute}` : absolute;
}

/**
 * Next 5-minute Tehran boundary strictly after now (never rounds down into
 * the past): entering a custom mode from Now always starts in the future.
 */
function nextQuarterHour(nowMs: number): { dateStr: string; hh: number; mm: number } {
  const parts = tehranParts(nowMs);
  const rounded = Math.ceil((parts.minuteOfDay + 1) / 5) * 5;
  if (rounded >= 24 * 60) {
    return { dateStr: nextTehranCalendarDate(parts.dateStr), hh: 0, mm: 0 };
  }
  return { dateStr: parts.dateStr, hh: Math.floor(rounded / 60), mm: rounded % 60 };
}

function seedDateTime(
  atMs: number | null,
  nowMs: number,
): { dateStr: string; hh: number; mm: number } {
  if (atMs !== null) {
    const parts = tehranParts(atMs);
    return {
      dateStr: parts.dateStr,
      hh: Math.floor(parts.minuteOfDay / 60),
      mm: parts.minuteOfDay % 60,
    };
  }
  return nextQuarterHour(nowMs);
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
  const [nowRef] = useState(() => Date.now());
  const [selMode, setSelMode] = useState<TimeMode>(mode);
  const [todayStr] = useState(() => tehranParts(nowRef).dateStr);
  // Picker horizon: the timetable repeats weekly; 30 days keeps plans honest.
  const maxDateStr = shiftTehranDate(todayStr, 30);
  const tomorrowStr = nextTehranCalendarDate(todayStr);
  const [dateStr, setDateStr] = useState(() => seedDateTime(atMs, nowRef).dateStr);
  const [hh, setHh] = useState(() => seedDateTime(atMs, nowRef).hh);
  const [mm, setMm] = useState(() => seedDateTime(atMs, nowRef).mm);

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

  /**
   * One continuous Tehran datetime: stepping past midnight rolls the date
   * (23:55 + 5 min becomes tomorrow 00:00, and back). Out-of-horizon steps
   * are ignored (buttons disable at the bounds).
   */
  function shiftTime(deltaMin: number): void {
    const next = shiftTimeOfDay(dateStr, hh, mm, deltaMin);
    if (next.dateStr < todayStr || next.dateStr > maxDateStr) return;
    setDateStr(next.dateStr);
    setHh(next.hh);
    setMm(next.mm);
  }

  function shiftDay(delta: number): void {
    const next = shiftTehranDate(dateStr, delta);
    if (next < todayStr || next > maxDateStr) return;
    setDateStr(next);
  }

  const atMinBound = dateStr <= todayStr && hh === 0 && mm === 0;
  const atMaxBound = dateStr >= maxDateStr;

  function apply() {
    if (selMode === "now") {
      onApply("now", null);
      return;
    }
    onApply(selMode, tehranMinuteToInstant(dateStr, hh * 60 + mm));
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
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <p id="plan-date-label" className="text-xs font-medium text-muted-foreground">
                {t.pickDate}
              </p>
              <div className="flex items-center gap-1" role="group" aria-labelledby="plan-date-label">
                <button
                  type="button"
                  onClick={() => shiftDay(-1)}
                  disabled={dateStr <= todayStr}
                  aria-label={t.previousDay}
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border transition-colors hover:bg-accent disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronLeft aria-hidden="true" className="size-4 rtl:rotate-180" />
                </button>
                <p aria-live="polite" className="min-w-0 flex-1 truncate text-center text-sm font-bold">
                  {formatDateLabel(lang, dateStr, nowRef)}
                </p>
                <button
                  type="button"
                  onClick={() => shiftDay(1)}
                  disabled={dateStr >= maxDateStr}
                  aria-label={t.nextDay}
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border transition-colors hover:bg-accent disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronRight aria-hidden="true" className="size-4 rtl:rotate-180" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDateStr(todayStr)}
                  aria-pressed={dateStr === todayStr}
                  className={cn(
                    "rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    dateStr === todayStr
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {t.today}
                </button>
                <button
                  type="button"
                  onClick={() => setDateStr(tomorrowStr)}
                  aria-pressed={dateStr === tomorrowStr}
                  className={cn(
                    "rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    dateStr === tomorrowStr
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {t.tomorrow}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2" role="group" aria-label={t.pickTime}>
              <StepperColumn
                label={t.hoursLabel}
                value={persianDigits(String(hh).padStart(2, "0"), lang)}
                testId="hour-value"
                onIncrease={() => shiftTime(60)}
                onDecrease={() => shiftTime(-60)}
                increaseLabel={t.increaseHours}
                decreaseLabel={t.decreaseHours}
                disableDecrease={atMinBound}
                disableIncrease={atMaxBound}
              />
              <StepperColumn
                label={t.minutesLabel}
                value={persianDigits(String(mm).padStart(2, "0"), lang)}
                testId="minute-value"
                onIncrease={() => shiftTime(5)}
                onDecrease={() => shiftTime(-5)}
                increaseLabel={t.increaseMinutes}
                decreaseLabel={t.decreaseMinutes}
                disableDecrease={atMinBound}
                disableIncrease={atMaxBound}
              />
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

function StepperColumn({
  label,
  value,
  testId,
  onIncrease,
  onDecrease,
  increaseLabel,
  decreaseLabel,
  disableIncrease,
  disableDecrease,
}: {
  label: string;
  value: string;
  testId: string;
  onIncrease: () => void;
  onDecrease: () => void;
  increaseLabel: string;
  decreaseLabel: string;
  disableIncrease: boolean;
  disableDecrease: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-border px-2 py-2">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <div className="flex w-full items-center justify-between gap-1">
        <button
          type="button"
          onClick={onDecrease}
          disabled={disableDecrease}
          aria-label={decreaseLabel}
          className="flex size-8 items-center justify-center rounded-lg border border-border transition-colors hover:bg-accent disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Minus aria-hidden="true" className="size-4" />
        </button>
        <span data-testid={testId} aria-live="polite" dir="ltr" className="tnum min-w-8 text-center text-xl font-bold">
          {value}
        </span>
        <button
          type="button"
          onClick={onIncrease}
          disabled={disableIncrease}
          aria-label={increaseLabel}
          className="flex size-8 items-center justify-center rounded-lg border border-border transition-colors hover:bg-accent disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus aria-hidden="true" className="size-4" />
        </button>
      </div>
    </div>
  );
}
