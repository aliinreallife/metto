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
} from "lucide-react";
import { LINE_COLORS } from "@/lib/metro-data";
import { STATION_MAP, type RouteResult } from "@/lib/route";
import { STRINGS, persianDigits, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  getNextDepartures,
  getCurrentDayType,
  getArrivalFromOrigin,
  type TripResult,
} from "@/lib/schedule-utils";

// Inline time helper
function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function RoutePanel({
  route,
  lang,
}: {
  route: RouteResult;
  lang: Lang;
}) {
  const t = STRINGS[lang];
  const isFa = lang === "fa";
  const name = (id: string) => {
    const s = STATION_MAP.get(id);
    return s ? (isFa ? s.fa : s.name) : id;
  };
  const mins = Math.round(route.estimatedSeconds / 60);
  const firstWait = route.trips.length > 0
    ? Math.max(0, timeToMinutes(route.trips[0].departTime) - (new Date().getHours() * 60 + new Date().getMinutes()))
    : 0;
  const restMins = mins - firstWait;

  // Check next train at origin
  const origin = route.segments[0]?.stations[0];
  const originLine = route.segments[0]?.line;
  const originDeps = useMemo(() => {
    if (!origin || !originLine) return [];
    return getNextDepartures(origin, originLine, getCurrentDayType(), 3);
  }, [origin, originLine]);

  const noTrainWarning = originDeps.length === 0;
  const longWait = originDeps.length > 0 && originDeps[0].minutesUntil > 60;

  // Compute arrival times at transfer points using actual timetable
  const connectionWarnings = useMemo(() => {
    if (route.segments.length <= 1) return [];
    if (originDeps.length === 0) return []; // No train at origin, skip connection checks
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const dayType = getCurrentDayType();
    const warnings: { station: string; line: number; arriveMin: number; nextDepMin: number | null }[] = [];

    // Start from the first train's departure time at the origin
    let currentDepartMin = nowMinutes + (originDeps[0]?.minutesUntil ?? 0);

    for (let i = 0; i < route.segments.length - 1; i++) {
      const seg = route.segments[i];
      const board = seg.stations[0];
      const transferStation = seg.stations[seg.stations.length - 1];
      const nextSeg = route.segments[i + 1];
      const nextLine = nextSeg.line;

      // Look up actual arrival time at transfer station from timetable
      const arrivalMin = getArrivalFromOrigin(
        board,
        transferStation,
        seg.line,
        currentDepartMin,
        dayType,
      );

      if (arrivalMin === null) {
        // Can't find a train — warn
        warnings.push({
          station: transferStation,
          line: nextLine,
          arriveMin: currentDepartMin,
          nextDepMin: null,
        });
        break;
      }

      const transferWalkMin = 4; // 4 min walk between platforms
      const readyMin = arrivalMin + transferWalkMin;

      // Find next departure on the connecting line after we're ready
      const allDeps = getNextDepartures(transferStation, nextLine, dayType, 10);
      const nextAvailable = allDeps.find(d => d.minutesUntil >= (readyMin - nowMinutes));

      if (!nextAvailable) {
        warnings.push({
          station: transferStation,
          line: nextLine,
          arriveMin: arrivalMin,
          nextDepMin: null,
        });
        break; // Can't continue checking further segments
      }

      const waitMin = nextAvailable.minutesUntil - (readyMin - nowMinutes);
      if (waitMin > 15) {
        warnings.push({
          station: transferStation,
          line: nextLine,
          arriveMin: arrivalMin,
          nextDepMin: nowMinutes + nextAvailable.minutesUntil,
        });
      }

      // For next segment, start from the connecting train's departure
      currentDepartMin = nowMinutes + nextAvailable.minutesUntil;
    }
    return warnings;
  }, [route, originDeps]);

  // Pick the single most important warning (priority: no train > no connection > long wait)
  const topWarning = useMemo(() => {
    // 1. No train at origin (highest priority)
    if (noTrainWarning) {
      return {
        severity: "red" as const,
        message: isFa ? "حرکتی در ساعت آینده یافت نشد" : "No trains in the next hour",
      };
    }

    // 2. No connection at any transfer
    const noConn = connectionWarnings.find((w) => w.nextDepMin === null);
    if (noConn) {
      return {
        severity: "red" as const,
        message: isFa
          ? `خط ${persianDigits(noConn.line, lang)} در ${name(noConn.station)} حرکتی ندارد`
          : `No service on L${noConn.line} at ${name(noConn.station)}`,
      };
    }

    // 3. Long wait at transfer
    const longTransfer = connectionWarnings.find((w) => {
      if (w.nextDepMin === null) return false;
      const wait = w.nextDepMin - (w.arriveMin + 4);
      return wait > 15;
    });
    if (longTransfer) {
      const wait = longTransfer.nextDepMin! - (longTransfer.arriveMin + 4);
      return {
        severity: "amber" as const,
        message: isFa
          ? `انتظار ${persianDigits(wait, lang)} دقیقه در ${name(longTransfer.station)}`
          : `${wait} min wait at ${name(longTransfer.station)}`,
      };
    }

    // 4. Long wait at origin
    if (longWait) {
      return {
        severity: "amber" as const,
        message: isFa
          ? `اولین حرکت بعد از ${persianDigits(originDeps[0].minutesUntil, lang)} دقیقه`
          : `First train in ${originDeps[0].minutesUntil} min`,
      };
    }

    return null;
  }, [noTrainWarning, longWait, connectionWarnings, originDeps, isFa, lang, name]);

  return (
    <div className="flex flex-col gap-3 md:gap-4">
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
          value={persianDigits(route.estimatedArrival, lang)}
          label={isFa ? "رسیدن" : "arrival"}
        />
      </div>
      {route.numTransfers > 0 && (
        <div className="flex items-center justify-center gap-2 rounded-lg bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
          <Repeat className="size-3.5" />
          <span>{persianDigits(route.numTransfers, lang)} {isFa ? "تعویض خط" : "transfers"}</span>
        </div>
      )}

      <p className="text-xs text-muted-foreground">{t.timeNote}</p>

      <ol className="flex flex-col gap-3">
        {route.segments.map((seg, i) => (
          <li key={i} className="flex flex-col gap-2">
            {i > 0 && (
              <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                <Footprints className="size-4 shrink-0" />
                <span>
                  {t.transferTo} {persianDigits(seg.line, lang)} {t.via}{" "}
                  {name(seg.stations[0])}
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
              trip={route.trips[i]}
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
      <span className="text-2xl font-bold leading-none md:text-3xl" title={tooltip}>{value}</span>
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
  const t = STRINGS[lang];
  const isFa = lang === "fa";
  const color = LINE_COLORS[line];
  const intermediates = stations.slice(1, -1);
  const board = stations[0];
  const alight = stations[stations.length - 1];

  const nextDep = useMemo(() => {
    const deps = getNextDepartures(board, line, getCurrentDayType(), 10);
    return deps;
  }, [board, line]);

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
              <span className="text-2xl font-bold font-mono leading-none md:text-3xl" style={{ color }}>
                {trip ? trip.departTime : next?.time ?? "—"}
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
                  {isFa ? "رسیدن" : "arrive"} <span className="font-mono font-semibold">{persianDigits(trip.arriveTime, lang)}</span>
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
                  <span className="font-mono font-semibold">{persianDigits(nextDifferent.time, lang)}</span>
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
