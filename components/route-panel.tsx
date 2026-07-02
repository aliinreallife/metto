"use client";

import { useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  Clock,
  Compass,
  Repeat,
  TrainFront,
  Footprints,
} from "lucide-react";
import { LINE_COLORS } from "@/lib/metro-data";
import { STATION_MAP, type RouteResult } from "@/lib/route";
import { STRINGS, persianDigits, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

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
}: {
  line: number;
  stations: string[];
  terminal: string;
  name: (id: string) => string;
  lang: Lang;
}) {
  const [open, setOpen] = useState(false);
  const t = STRINGS[lang];
  const isFa = lang === "fa";
  const color = LINE_COLORS[line];
  const intermediates = stations.slice(1, -1);
  const board = stations[0];
  const alight = stations[stations.length - 1];

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
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
              {stations.length <= 1 ? null : stations.length <= 8 ? (
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
                  {persianDigits(stations.length, lang)}
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
