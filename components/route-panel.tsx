"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  Clock,
  Compass,
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

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat
          icon={<TrainFront className="size-5" />}
          value={persianDigits(route.numStops + 1, lang)}
          label={t.stops}
        />
        <Stat
          icon={<Repeat className="size-5" />}
          value={persianDigits(route.numTransfers, lang)}
          label={route.numTransfers === 1 ? t.transfer : t.transfers}
        />
        <Stat
          icon={<Clock className="size-5" />}
          value={"~" + persianDigits(mins, lang)}
          label={t.minEst}
        />
      </div>

      {/* Warnings */}
      {noTrainWarning && (
        <div className="flex items-center gap-2.5 rounded-xl border border-l-4 border-l-red-500 border-red-200/50 bg-red-50 px-3.5 py-3 dark:border-red-800/30 dark:border-l-red-500 dark:bg-red-950/60">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30">
            <AlertTriangle className="size-4 text-red-600 dark:text-red-400" />
          </div>
          <span className="text-xs font-medium text-red-700 dark:text-red-300">
            {isFa
              ? "حرکتی در ساعت آینده یافت نشد"
              : "No trains in the next hour"}
          </span>
        </div>
      )}
      {longWait && !noTrainWarning && (
        <div className="flex items-center gap-2.5 rounded-xl border border-l-4 border-l-amber-500 border-amber-200/50 bg-amber-50 px-3.5 py-3 dark:border-amber-800/30 dark:border-l-amber-500 dark:bg-amber-950/60">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
            <Clock className="size-4 text-amber-600 dark:text-amber-400" />
          </div>
          <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
            {isFa
              ? `اولین حرکت بعد از ${persianDigits(originDeps[0].minutesUntil, lang)} دقیقه`
              : `First train in ${originDeps[0].minutesUntil} min`}
          </span>
        </div>
      )}

      {connectionWarnings.map((w, i) => {
        const waitMin = w.nextDepMin !== null
          ? w.nextDepMin - (w.arriveMin + 4) // 4 = transfer walk minutes
          : null;
        return (
          <div
            key={i}
            className="flex items-center gap-2.5 rounded-xl border border-l-4 border-l-amber-500 border-amber-200/50 bg-amber-50 px-3.5 py-3 dark:border-amber-800/30 dark:border-l-amber-500 dark:bg-amber-950/60"
          >
            <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
              <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
            </div>
            <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
              {w.nextDepMin === null
                ? isFa
                  ? `خط ${persianDigits(w.line, lang)} در ${name(w.station)} حرکتی ندارد`
                  : `No service on L${w.line} at ${name(w.station)}`
                : waitMin !== null && waitMin > 15
                  ? isFa
                    ? `انتظار ${persianDigits(waitMin, lang)} دقیقه در ${name(w.station)}`
                    : `${waitMin} min wait at ${name(w.station)}`
                  : null}
            </span>
          </div>
        );
      })}

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
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-border bg-card px-3 py-3">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-xl font-bold leading-none">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
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
}: {
  line: number;
  stations: string[];
  terminal: string;
  name: (id: string) => string;
  lang: Lang;
  showNextTrain?: boolean;
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

  // Fast train suggestion: if current is local, check if an express gets there faster
  const fastSuggestion = useMemo(() => {
    if (!next || next.isExpress || line !== 5) return null;
    if (nextDep.length < 2) return null;

    // Find next express train
    const express = nextDep.find((d) => d.isExpress);
    if (!express) return null;

    // Compare: local arrival vs express arrival at the destination
    // Use the schedule to find actual arrival times
    const dayType = getCurrentDayType();
    const localArrival = getArrivalFromOrigin(board, alight, line, timeToMinutes(next.time), dayType);
    const expressArrival = getArrivalFromOrigin(board, alight, line, timeToMinutes(express.time), dayType);

    if (localArrival === null || expressArrival === null) return null;

    const diffMin = localArrival - expressArrival;
    if (diffMin <= 0) return null; // Express is not faster

    return {
      time: express.time,
      savedMinutes: diffMin,
      waitExtra: express.minutesUntil - next.minutesUntil,
    };
  }, [next, nextDep, board, alight, line]);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {/* Prominent next train callout - only for first segment */}
      {showNextTrain && next && (
        <div
          className="flex items-center gap-3 px-4 py-3"
          style={{ backgroundColor: `${color}11` }}
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white" style={{ backgroundColor: color }}>
            {persianDigits(line, lang)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold font-mono leading-none" style={{ color }}>
                {next.time}
              </span>
              {next.isExpress && (
                <span className="flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  <Zap className="size-3" />
                  {isFa ? "سریع" : "Express"}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {isFa ? "به سمت" : "→"} {name(terminal)}
              {next.minutesUntil <= 2 ? (
                <span className="me-2 font-bold text-green-600 dark:text-green-400">
                  {isFa ? "الان" : "Now"}
                </span>
              ) : (
                <span className="me-2">
                  {isFa ? " در " : " in "}{persianDigits(next.minutesUntil, lang)}{isFa ? " دقیقه" : " min"}
                </span>
              )}
            </p>
            {nextDep.length > 1 && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {isFa ? "بعدی:" : "Then:"}{" "}
                {nextDep.slice(1, 3).map((d) => d.time).join(", ")}
              </p>
            )}
            {fastSuggestion && (
              <button
                type="button"
                onClick={() => {}}
                className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200/50 px-2.5 py-1.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950/60 dark:border-amber-800/30 dark:text-amber-300"
              >
                <Zap className="size-3 shrink-0" />
                {isFa
                  ? `سریع ${fastSuggestion.time} — ${persianDigits(fastSuggestion.savedMinutes, lang)} دقیقه زودتر`
                  : `Express ${fastSuggestion.time} — ${fastSuggestion.savedMinutes} min faster`}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex gap-3 p-4">
        <div className="flex flex-col items-center pt-1">
          <span
            className="size-4 rounded-full ring-2 ring-offset-2 ring-offset-card"
            style={{ backgroundColor: color, color }}
          />
          <span
            className="my-1 w-0.5 flex-1 rounded"
            style={{ backgroundColor: color }}
          />
          <span
            className="size-4 rounded-full"
            style={{ backgroundColor: color }}
          />
        </div>
        <div className="min-w-0 flex-1 flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold text-white"
              style={{ backgroundColor: color }}
            >
              {t.line} {persianDigits(line, lang)}
            </span>
            <span
              className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
              style={{ backgroundColor: `${color}22`, color }}
            >
              <Compass className="size-4 shrink-0" />
              <span className="shrink-0">{t.towards}</span>
              <span className="truncate font-bold">{name(terminal)}</span>
            </span>
          </div>

          {/* route spine: board -- (intermediate ticks) -- alight */}
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold truncate shrink-0 max-w-[38%]">
              {name(board)}
            </span>
            <div className="relative h-2 flex-1">
              <div
                className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2"
                style={{ backgroundColor: `${color}55` }}
              />
              {stations.length <= 1 ? null : stations.length <= 6 ? (
                <div className="absolute inset-0 flex items-center justify-between px-1">
                  {stations.map((id) => (
                    <span
                      key={id}
                      className="size-2 shrink-0 rounded-full ring-2 ring-offset-2 ring-offset-card"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              ) : (
                <span
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-bold text-white"
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
