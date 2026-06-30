"use client";

import { useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  Clock,
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
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        <Stat
          icon={<TrainFront className="size-4" />}
          value={persianDigits(route.numStops, lang)}
          label={t.stops}
        />
        <Stat
          icon={<Repeat className="size-4" />}
          value={persianDigits(route.numTransfers, lang)}
          label={route.numTransfers === 1 ? t.transfer : t.transfers}
        />
        <Stat
          icon={<Clock className="size-4" />}
          value={"~" + persianDigits(mins, lang)}
          label={t.minEst}
        />
      </div>

      <ol className="flex flex-col gap-2">
        {route.segments.map((seg, i) => (
          <li key={i} className="flex flex-col gap-2">
            {i > 0 && (
              <div className="flex items-center gap-2 px-1 text-xs font-medium text-muted-foreground">
                <Footprints className="size-3.5" />
                <span>
                  {t.transferTo} {persianDigits(seg.line, lang)} {t.via}{" "}
                  {name(seg.stations[0])}
                </span>
              </div>
            )}
            <SegmentCard
              line={seg.line}
              stations={seg.stations}
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
    <div className="flex flex-col items-center gap-0.5 rounded-lg border border-border bg-card px-2 py-2.5">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-lg font-bold leading-none">{value}</span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}

function SegmentCard({
  line,
  stations,
  name,
  lang,
}: {
  line: number;
  stations: string[];
  name: (id: string) => string;
  lang: Lang;
}) {
  const [open, setOpen] = useState(false);
  const t = STRINGS[lang];
  const color = LINE_COLORS[line];
  const intermediates = stations.slice(1, -1);
  const board = stations[0];
  const alight = stations[stations.length - 1];
  const hops = stations.length - 1;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-stretch gap-3 p-3">
        <div className="flex flex-col items-center pt-0.5">
          <span
            className="size-3 rounded-full ring-2 ring-offset-1 ring-offset-card"
            style={{ backgroundColor: color, color }}
          />
          <span
            className="my-0.5 w-0.5 flex-1 rounded"
            style={{ backgroundColor: color }}
          />
          <span
            className="size-3 rounded-full"
            style={{ backgroundColor: color }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold text-white"
              style={{ backgroundColor: color }}
            >
              {t.line} {persianDigits(line, lang)}
            </span>
            <span className="text-xs text-muted-foreground">
              {persianDigits(hops, lang)} {t.stops}
            </span>
          </div>
          <div className="truncate text-sm font-semibold">{name(board)}</div>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="my-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            disabled={intermediates.length === 0}
          >
            <ChevronDown
              className={cn(
                "size-3.5 transition-transform",
                open && "rotate-180",
              )}
            />
            {intermediates.length > 0
              ? `${persianDigits(intermediates.length, lang)} ${t.stops}`
              : "—"}
          </button>
          {open && intermediates.length > 0 && (
            <ul className="mb-1.5 ml-1 flex flex-col gap-1 border-l border-dashed border-border pl-3 text-xs text-muted-foreground">
              {intermediates.map((id) => (
                <li key={id} className="truncate">
                  {name(id)}
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-1.5 truncate text-sm font-semibold">
            <ArrowRight className="size-3.5 shrink-0 text-muted-foreground rtl:rotate-180" />
            {name(alight)}
          </div>
        </div>
      </div>
    </div>
  );
}
