"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  Clock,
  Compass,
  Flag,
  Repeat,
  TrainFront,
  Footprints,
  Zap,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { LINE_COLORS } from "@/lib/metro/lines";
import { canBoardAtStation } from "@/lib/metro/selectors";
import { STATION_MAP, type RouteResult } from "@/lib/route";
import { STRINGS, persianDigits, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  getNextDepartures,
  getCurrentDayType,
  type TripResult,
} from "@/lib/schedule-utils";
import { useHolidayData } from "@/lib/holidays/use-holiday-data";
import { useScheduleData } from "@/lib/use-schedule-data";

export function RoutePanel({
  route,
  lang,
}: {
  route: RouteResult;
  lang: Lang;
}) {
  const loaded = useScheduleData();
  const t = STRINGS[lang];
  const isFa = lang === "fa";
  const scheduleLoading = !loaded;
  const name = (id: string) => {
    const s = STATION_MAP.get(id);
    return s ? (isFa ? s.name.fa : s.name.en) : id;
  };
  const mins = Math.round(route.estimatedSeconds / 60);
  // All connection timing comes from route.ts (source of truth); this panel
  // renders it and never recomputes the timetable.
  const firstWait = Math.round(route.initialWaitSeconds / 60);
  const restMins = mins - firstWait;
  const eta = route.estimatedArrival ?? "—";

  const originNoService = route.legTiming[0] === "no-service";
  const failedConn = route.connections.find((c) => c.status === "no-service");
  const longTransfer = route.connections.find(
    (c) => c.status === "ok" && c.waitSeconds > 15 * 60,
  );
  const longWait = !originNoService && !failedConn && firstWait > 60;

  // Pick the single most important warning (priority: no service > long transfer wait > long origin wait)
  const topWarning = useMemo(() => {
    // 1. No service for a leg (highest priority)
    if (originNoService || failedConn) {
      if (failedConn) {
        return {
          severity: "red" as const,
          message: isFa
            ? `خط ${persianDigits(failedConn.toLineId, lang)} در ${name(failedConn.stationId)} حرکتی ندارد`
            : `No service on L${failedConn.toLineId} at ${name(failedConn.stationId)}`,
        };
      }
      return {
        severity: "red" as const,
        message: isFa ? "حرکتی در ساعت آینده یافت نشد" : "No trains in the next hour",
      };
    }

    // 2. Long wait at transfer (from the propagated connection timing)
    if (longTransfer) {
      const wait = Math.round(longTransfer.waitSeconds / 60);
      return {
        severity: "amber" as const,
        message: isFa
          ? `انتظار ${persianDigits(wait, lang)} دقیقه در ${name(longTransfer.stationId)}`
          : `${wait} min wait at ${name(longTransfer.stationId)}`,
      };
    }

    // 3. Long wait at origin
    if (longWait) {
      return {
        severity: "amber" as const,
        message: isFa
          ? `اولین حرکت بعد از ${persianDigits(firstWait, lang)} دقیقه`
          : `First train in ${firstWait} min`,
      };
    }

    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, firstWait, isFa, lang]);

  return (
    <div className="flex flex-col gap-3 md:gap-4">
      {scheduleLoading && (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          {isFa ? "در حال بارگذاری زمان‌بندی..." : "Loading schedule..."}
        </div>
      )}
      <div className="grid grid-cols-3 gap-3 md:gap-4">
        <Stat
          icon={<TrainFront className="size-5 md:size-6" />}
          value={persianDigits(route.numStops + 1, lang)}
          label={isFa ? "ایستگاه" : "stops"}
        />
        <Stat
          icon={<Clock className="size-5" />}
          value={
            firstWait > 0 ? (
              <>
                <span className="text-lg font-semibold text-muted-foreground/70">{persianDigits(firstWait, lang)}</span>
                <span className="text-muted-foreground/40"> + </span>
                <span>{persianDigits(restMins, lang)}</span>
              </>
            ) : (
              persianDigits(mins, lang)
            )
          }
          label={
            firstWait > 0
              ? (isFa ? "انتظار + سفر" : "wait + travel")
              : (isFa ? "دقیقه سفر" : "travel time")
          }
        />
        <Stat
          icon={<Flag className="size-5" />}
          value={persianDigits(eta, lang)}
          label={isFa ? "رسیدن" : "arrival"}
        />
      </div>
      {topWarning && (
        <div
          className={
            topWarning.severity === "red"
              ? "flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400"
              : "flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-600 dark:text-amber-400"
          }
        >
          <AlertTriangle className="size-4 shrink-0" />
          <span>{topWarning.message}</span>
        </div>
      )}
      {route.numTransfers > 0 && (
        <div className="flex items-center justify-center gap-2 rounded-lg bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
          <Repeat className="size-3.5" />
          <span>{persianDigits(route.numTransfers, lang)} {isFa ? "تعویض خط" : "transfers"}</span>
        </div>
      )}

      {route.numTrainChanges > 0 && (
        <div className="flex items-center justify-center gap-2 rounded-lg bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
          <Repeat className="size-3.5" />
          <span>{persianDigits(route.numTrainChanges, lang)} {isFa ? "تعویض قطار" : "train changes"}</span>
        </div>
      )}

      <p className="text-xs text-muted-foreground">{t.timeNote}</p>

      <ol className="flex flex-col gap-3">
        {route.segments.map((seg, i) => (
          <li key={i} className="flex flex-col gap-2">
            {i > 0 && seg.changeFromPrevious.type === "line_transfer" && (
              <div className="flex flex-col gap-1 rounded-lg bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Footprints className="size-4 shrink-0" />
                  <span>
                    {t.transferTo} {persianDigits(seg.line, lang)} {t.via}{" "}
                    {name(seg.stations[0])}
                  </span>
                </div>
                {route.connections[i - 1]?.hasExplicitRule && (
                  <div className="flex items-center gap-2 ps-6">
                    <Footprints className="size-3.5 shrink-0" />
                    <span>
                      {t.walkToLine} {persianDigits(seg.line, lang)} · {t.about}{" "}
                      {persianDigits(
                        Math.round(
                          (route.connections[i - 1]?.walkSeconds ?? 0) / 60,
                        ),
                        lang,
                      )}{" "}
                      {t.minEst}
                    </span>
                  </div>
                )}
              </div>
            )}
            {i > 0 && seg.changeFromPrevious.type === "train_change" && (
              <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                <TrainFront className="size-4 shrink-0" />
                <span>
                  {isFa ? "تعویض قطار" : "Change trains"}{" "}
                  {t.via} {name(seg.stations[0])}
                </span>
              </div>
            )}
            <SegmentCard
              line={seg.line}
              stations={seg.stations}
              terminal={seg.terminal}
              name={name}
              lang={lang}
              showNextTrain={i === 0}
              trip={route.trips[i] ?? undefined}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}

function Stat({
  icon,
  value,
  label,
  tooltip,
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
  tooltip?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-border bg-card px-3 py-3 md:px-5 md:py-4">
      <span className="text-muted-foreground">{icon}</span>
      <span className="tnum text-2xl font-bold leading-none md:text-3xl" title={tooltip}>{value}</span>
      <span className="text-sm text-muted-foreground md:text-base">{label}</span>
    </div>
  );
}

function SegmentCard({
  line,
  stations,
  terminal,
  name,
  lang,
  showNextTrain = false,
  trip,
}: {
  line: number;
  stations: string[];
  terminal: string;
  name: (id: string) => string;
  lang: Lang;
  showNextTrain?: boolean;
  trip?: TripResult;
}) {
  const [open, setOpen] = useState(false);
  const loaded = useScheduleData();
  const { isHolidayDate } = useHolidayData();
  const t = STRINGS[lang];
  const isFa = lang === "fa";
  const color = LINE_COLORS[line];
  const intermediates = stations.slice(1, -1);
  const board = stations[0];
  const alight = stations[stations.length - 1];

  const nextDep = useMemo(() => {
    const deps = getNextDepartures(board, line, getCurrentDayType(undefined, isHolidayDate), 10);
    return deps;
  }, [board, line, loaded, isHolidayDate]);

  const next = nextDep[0] ?? null;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {/* Prominent next train callout - only for first segment */}
      {showNextTrain && (
        <div
          className="flex items-center gap-3 px-4 py-3 md:gap-4 md:px-5 md:py-4"
          style={{ backgroundColor: `${color}11` }}
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white md:size-12 md:text-base" style={{ backgroundColor: color }}>
            {persianDigits(line, lang)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="tnum text-2xl font-bold leading-none md:text-3xl" style={{ color }}>
                {persianDigits(trip ? trip.departTime : (next?.time ?? "—"), lang)}
              </span>
              {(trip?.train.isExpress || next?.isExpress) && (
                <span className="flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  <Zap className="size-3" />
                  {isFa ? "سریع السیر" : "Express"}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {isFa ? "به سمت" : "→"} {name(terminal)}
              {trip ? (
                <>
                  <span className="mx-1.5">·</span>
                  {isFa ? "رسیدن" : "arrive"} <span className="tnum font-semibold">{persianDigits(trip.arriveTime, lang)}</span>
                  <span className="mx-1.5">·</span>
                  {persianDigits(trip.travelMinutes, lang)}{isFa ? " دقیقه" : " min"}
                </>
              ) : next ? (
                <span className="mx-1.5 text-amber-600 dark:text-amber-400">
                  {isFa ? "حرکتی موجود نیست" : "no service today"}
                </span>
              ) : null}
            </p>
            {(() => {
              // Find next departure with a different time than the main one
              const nextDifferent = next ? nextDep.find((d) => d.time !== next.time) : null;
              if (!nextDifferent) return null;
              return (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {isFa ? "بعدی:" : "Then:"}{" "}
                  <span className="tnum font-semibold">{persianDigits(nextDifferent.time, lang)}</span>
                  {nextDifferent.isExpress && (
                    <span className="ms-1 text-amber-600 dark:text-amber-400">
                      ({isFa ? "سریع السیر" : "express"})
                    </span>
                  )}
                </p>
              );
            })()}
          </div>
        </div>
      )}

      <div className="flex gap-3 p-4 md:gap-4 md:p-5">
        <div className="flex flex-col items-center pt-1">
          <span
            className="size-4 rounded-full ring-2 ring-offset-2 ring-offset-card md:size-5"
            style={{ backgroundColor: color, color }}
          />
          <span
            className="my-1 w-0.5 flex-1 rounded"
            style={{ backgroundColor: color }}
          />
          <span
            className="size-4 rounded-full md:size-5"
            style={{ backgroundColor: color }}
          />
        </div>
        <div className="min-w-0 flex-1 flex flex-col gap-2 md:gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold text-white md:px-3 md:py-1.5 md:text-sm"
              style={{ backgroundColor: color }}
            >
              {t.line} {persianDigits(line, lang)}
            </span>
            <span
              className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold md:px-3 md:py-2 md:text-sm"
              style={{ backgroundColor: `${color}22`, color }}
            >
              <Compass className="size-4 shrink-0" />
              <span className="shrink-0">{t.towards}</span>
              <span className="truncate font-bold">{name(terminal)}</span>
            </span>
          </div>

          {/* route spine: board -- (intermediate ticks) -- alight */}
          <div className="flex items-center gap-2 text-sm md:gap-3 md:text-base">
            <span className="font-semibold truncate shrink-0 max-w-[38%]">
              {name(board)}
            </span>
            <div className="relative h-2 flex-1 md:h-3">
              <div
                className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2"
                style={{ backgroundColor: `${color}55` }}
              />
              {stations.length <= 1 ? null : stations.length <= 6 ? (
                <div className="absolute inset-0 flex items-center justify-between px-1">
                  {stations.map((id) => (
                    <span
                      key={id}
                      className="size-2 shrink-0 rounded-full ring-2 ring-offset-2 ring-offset-card md:size-3"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              ) : (
                <span
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-bold text-white md:px-3 md:py-1.5 md:text-xs"
                  style={{ backgroundColor: color }}
                >
                  {persianDigits(stations.length - 2, lang)}
                </span>
              )}
            </div>
            <ArrowRight
              className="size-4 shrink-0 rtl:rotate-180"
              style={{ color }}
            />
            <span className="font-semibold truncate shrink-0 max-w-[38%]">
              {name(alight)}
            </span>
          </div>

          {intermediates.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              >
                <ChevronDown
                  className={cn(
                    "size-4 transition-transform",
                    open && "rotate-180",
                  )}
                />
                <span>{isFa ? "ایستگاه‌های بین‌راهی" : "Intermediate stops"}</span>
                <span
                  className="h-px flex-1 opacity-40"
                  style={{ backgroundColor: color }}
                />
              </button>
              {open && (
                <ul className="ml-2 flex flex-col gap-1 border-l-2 border-dashed border-border pl-4 text-xs text-muted-foreground">
                  {intermediates.map((id) => (
                    <li key={id} className="truncate py-0.5">
                      {name(id)}
                      {!canBoardAtStation(id, line) && (
                        <span className="ms-1.5 text-[10px]">
                          {isFa ? "(عبور بدون توقف)" : "(passes through)"}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
