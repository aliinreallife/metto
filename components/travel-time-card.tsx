"use client";

import { Calendar, ChevronDown, ChevronLeft, ChevronRight, Clock, Minus, Plus } from "lucide-react";
import { STRINGS, persianDigits, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  formatDateLabel,
  formatPlanSummary,
  shiftPlanDay,
  shiftPlanTime,
  shiftTehranDate,
  type TimeMode,
} from "@/lib/route-planning";
import { tehranParts } from "@/lib/tehran-time";

/**
 * Compact "travel time" control: a collapsed summary card expanding inline
 * to a segmented now/depart/arrive picker with date + time steppers.
 * Presentational — HomePage owns timeMode/planAtMs; every change applies
 * immediately (no confirmation step) through the existing routing state.
 */
export function TravelTimeCard({
  lang,
  timeMode,
  planAtMs,
  nowMs,
  expanded,
  onToggle,
  onModeChange,
  onPlanAtMs,
}: {
  lang: Lang;
  timeMode: TimeMode;
  planAtMs: number | null;
  nowMs: number;
  expanded: boolean;
  onToggle: () => void;
  onModeChange: (mode: TimeMode) => void;
  onPlanAtMs: (ms: number) => void;
}) {
  const t = STRINGS[lang];
  const isFa = lang === "fa";
  const sep = isFa ? "، " : ", ";
  const planSummary =
    timeMode !== "now" && planAtMs !== null
      ? formatPlanSummary(lang, planAtMs, nowMs)
      : null;
  const summary =
    planSummary === null
      ? `${t.timeNow} · ${t.leaveNow}`
      : timeMode === "depart"
        ? `${t.leaveAt} · ${planSummary.dateLabel}${sep}${planSummary.timeLabel}`
        : `${t.arriveShort} · ${planSummary.dateLabel}${sep}${planSummary.timeLabel}`;
  return (
    <div data-testid="travel-time-card" className="overflow-hidden rounded-xl border border-border bg-background">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls="travel-time-panel"
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm transition-colors hover:bg-accent/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:text-base"
      >
        <Clock aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-start">
          <span className="font-semibold">{t.travelTime}</span>
          <span className="tnum truncate text-xs text-muted-foreground">{summary}</span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
            expanded && "rotate-180",
          )}
        />
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows,visibility] duration-200 ease-out",
          expanded ? "grid-rows-[1fr] visible" : "grid-rows-[0fr] invisible",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div id="travel-time-panel" className="flex flex-col gap-3 border-t border-border p-3">
            <fieldset>
              <legend className="sr-only">{t.travelTimeModes}</legend>
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted/60 p-1" role="presentation">
                <ModeOption
                  name="travel-time-mode"
                  checked={timeMode === "now"}
                  onChange={() => onModeChange("now")}
                  label={t.timeNow}
                />
                <ModeOption
                  name="travel-time-mode"
                  checked={timeMode === "depart"}
                  onChange={() => onModeChange("depart")}
                  label={t.departShort}
                />
                <ModeOption
                  name="travel-time-mode"
                  checked={timeMode === "arrive"}
                  onChange={() => onModeChange("arrive")}
                  label={t.arriveShort}
                />
              </div>
            </fieldset>

            {timeMode === "now" ? (
              <div className="rounded-xl bg-muted/40 px-3 py-2.5">
                <p className="text-sm font-semibold">{t.leaveNow}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{t.leaveNowHint}</p>
              </div>
            ) : (
              planAtMs !== null && (
                <PlannerControls
                  lang={lang}
                  atMs={planAtMs}
                  nowMs={nowMs}
                  helper={timeMode === "depart" ? t.departHelper : t.arriveHelper}
                  onPlanAtMs={onPlanAtMs}
                />
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ModeOption({
  name,
  checked,
  onChange,
  label,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label
      className={cn(
        "flex min-h-11 cursor-pointer items-center justify-center rounded-lg px-1 text-sm font-semibold transition-colors focus-within:ring-2 focus-within:ring-ring",
        checked
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      <span className="truncate">{label}</span>
    </label>
  );
}

function PlannerControls({
  lang,
  atMs,
  nowMs,
  helper,
  onPlanAtMs,
}: {
  lang: Lang;
  atMs: number;
  nowMs: number;
  helper: string;
  onPlanAtMs: (ms: number) => void;
}) {
  const t = STRINGS[lang];
  const todayStr = tehranParts(nowMs).dateStr;
  const maxDateStr = shiftTehranDate(todayStr, 30);
  const parts = tehranParts(atMs);
  const hh = Math.floor(parts.minuteOfDay / 60);
  const mm = parts.minuteOfDay % 60;

  function shiftTime(deltaMin: number): void {
    const next = shiftPlanTime(atMs, deltaMin, todayStr, maxDateStr);
    if (next !== null) onPlanAtMs(next);
  }
  function shiftDay(delta: number): void {
    const next = shiftPlanDay(atMs, delta, todayStr, maxDateStr);
    if (next !== null) onPlanAtMs(next);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">{helper}</p>
      <DayRow
        lang={lang}
        dateStr={parts.dateStr}
        todayStr={todayStr}
        maxDateStr={maxDateStr}
        nowMs={nowMs}
        onShiftDay={shiftDay}
      />
      <div className="grid grid-cols-2 gap-2" role="group" aria-label={t.pickTime}>
        <StepperColumn
          label={t.hoursLabel}
          value={persianDigits(String(hh).padStart(2, "0"), lang)}
          testId="hour-value"
          onIncrease={() => shiftTime(60)}
          onDecrease={() => shiftTime(-60)}
          increaseLabel={t.increaseHours}
          decreaseLabel={t.decreaseHours}
          disableDecrease={shiftPlanTime(atMs, -60, todayStr, maxDateStr) === null}
          disableIncrease={shiftPlanTime(atMs, 60, todayStr, maxDateStr) === null}
        />
        <StepperColumn
          label={t.minutesLabel}
          value={persianDigits(String(mm).padStart(2, "0"), lang)}
          testId="minute-value"
          onIncrease={() => shiftTime(5)}
          onDecrease={() => shiftTime(-5)}
          increaseLabel={t.increaseMinutes}
          decreaseLabel={t.decreaseMinutes}
          disableDecrease={shiftPlanTime(atMs, -5, todayStr, maxDateStr) === null}
          disableIncrease={shiftPlanTime(atMs, 5, todayStr, maxDateStr) === null}
        />
      </div>
    </div>
  );
}

function DayRow({
  lang,
  dateStr,
  todayStr,
  maxDateStr,
  nowMs,
  onShiftDay,
}: {
  lang: Lang;
  dateStr: string;
  todayStr: string;
  maxDateStr: string;
  nowMs: number;
  onShiftDay: (delta: number) => void;
}) {
  const t = STRINGS[lang];
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1" role="group" aria-label={t.pickDate}>
        <Calendar aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <button
          type="button"
          onClick={() => onShiftDay(-1)}
          disabled={dateStr <= todayStr}
          aria-label={t.previousDay}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border transition-colors hover:bg-accent disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft aria-hidden="true" className="size-4 rtl:rotate-180" />
        </button>
        <p aria-live="polite" className="min-w-0 flex-1 truncate text-center text-sm font-bold">
          {formatDateLabel(lang, dateStr, nowMs)}
        </p>
        <button
          type="button"
          onClick={() => onShiftDay(1)}
          disabled={dateStr >= maxDateStr}
          aria-label={t.nextDay}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border transition-colors hover:bg-accent disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight aria-hidden="true" className="size-4 rtl:rotate-180" />
        </button>
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
      <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
        <Clock aria-hidden="true" className="size-3" />
        {label}
      </span>
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
