"use client";

import { useMemo, type ReactNode } from "react";
import { X, Clock, Zap, Ban } from "lucide-react";
import { LINE_COLORS, lineOnColor } from "@/lib/metro/lines";
import type { MetroStation } from "@/lib/metro/types";
import { getStationLines, getOperationalStationLines } from "@/lib/metro/selectors";
import { AMENITY_ICON_MAP } from "@/lib/amenity-icons";
import { AMENITY_LABELS, STRINGS, persianDigits, type Lang } from "@/lib/i18n";
import {
  getStationDepartures,
  getCurrentDayType,
  type Departure,
} from "@/lib/schedule-utils";
import { useHolidayData } from "@/lib/holidays/use-holiday-data";
import { useScheduleData } from "@/lib/use-schedule-data";

export function StationDetail({
  station,
  lang,
  onClose,
}: {
  station: MetroStation;
  lang: Lang;
  onClose: () => void;
}) {
  const loaded = useScheduleData();
  const { isHolidayDate } = useHolidayData();
  const departures = useMemo(() => {
    const grouped = getStationDepartures(station.id, getCurrentDayType(undefined, isHolidayDate), 3);
    return grouped.flatMap((g) => g.departures);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `loaded` retriggers this memo after the async timetable finishes loading; it is intentionally not read inside.
  }, [station.id, loaded, isHolidayDate]);

  const boardableLines = getOperationalStationLines(station.id);
  return <StationDetailView station={station} lang={lang} onClose={onClose}
    lines={getStationLines(station.id).map(line => ({ id: String(line), label: line, color: LINE_COLORS[line], onColor: lineOnColor(line), boardable: boardableLines.includes(line) }))}
    scheduleLoading={!loaded}
    departures={loaded && departures.length > 0 ? <div className="flex flex-col gap-1.5">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{lang === "fa" ? "حرکت‌های بعدی" : "Next departures"}</h4>
      <ul className="flex flex-col gap-1">{departures.map((dep, i) => <DepartureRow key={i} dep={dep} lang={lang} />)}</ul>
    </div> : undefined} />;
}

/** Shared map station sheet; city wrappers supply available facts and timing. */
export function StationDetailView({ station, lang, onClose, lines, scheduleLoading = false, departures, reportedAmenities }: {
  station: Pick<MetroStation, "id" | "name" | "location"> & { status: string; amenities: Partial<MetroStation["amenities"]> };
  lang: Lang; onClose: () => void;
  lines: { id: string; label: number | string; color: string; onColor: string; boardable: boolean }[];
  scheduleLoading?: boolean; departures?: ReactNode;
  reportedAmenities?: Partial<MetroStation["amenities"]>;
}) {
  const t = STRINGS[lang]; const isFa = lang === "fa";
  const boardableLines = lines.filter(l => l.boardable);
  const unavailableLines = lines.filter(l => !l.boardable);
  const activeAmenities = Object.entries(reportedAmenities ?? station.amenities).filter(([, value]) => value === true);
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold leading-tight">
            {isFa ? station.name.fa : station.name.en}
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {isFa ? station.name.en : station.name.fa}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex gap-1.5">
            {lines.map((l) => (
              <span
                key={l.id}
                className="flex size-7 items-center justify-center rounded-full text-xs font-bold"
                style={{ backgroundColor: l.color, color: l.onColor, opacity: l.boardable ? 1 : 0.45 }}
                aria-label={isFa ? `خط ${persianDigits(l.label, lang)}${l.boardable ? "" : "، غیرفعال"}` : `Line ${l.label}${l.boardable ? "" : ", not open"}`}
              >
                {persianDigits(l.label, lang)}
              </span>
            ))}
          </div>
          <button
            type="button"
            aria-label={t.close}
            onClick={onClose}
            className="flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
      </div>

      {boardableLines.length > 1 && (
        <span className="inline-flex items-center gap-1 self-start rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground/80">
          {t.interchange}
        </span>
      )}

      {unavailableLines.length > 0 && station.status === "operational" && (
        <p className="text-xs text-muted-foreground" role="status">
          {isFa
            ? `خط ${unavailableLines.map((l) => persianDigits(l.label, lang)).join("، ")} هنوز در این ایستگاه مسافرگیری ندارد.`
            : `Boarding on line ${unavailableLines.map(l => l.label).join(", ")} is not yet available at this station.`}
        </p>
      )}

      {station.status !== "operational" && (
        <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive">
          <Ban aria-hidden="true" className="size-3.5" />
          {t.underConstruction}
        </span>
      )}

      {reportedAmenities && <p className="text-xs text-muted-foreground">{t.amenitiesReported}</p>}
      {activeAmenities.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {activeAmenities.map(([key]) => {
            const Icon = AMENITY_ICON_MAP[key];
            return (
              <span
                key={key}
                className="flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs text-foreground"
              >
                {Icon && <Icon aria-hidden="true" className="size-3.5 shrink-0 text-primary" />}
                {AMENITY_LABELS[key]?.[lang] ?? key}
              </span>
            );
          })}
        </div>
      )}

      {scheduleLoading && <div role="status" className="text-xs text-muted-foreground">{isFa ? "در حال بارگذاری زمان‌بندی..." : "Loading schedule..."}</div>}
      {departures}
    </div>
  );
}

function DepartureRow({ dep, lang }: { dep: Departure; lang: Lang }) {
  const isFa = lang === "fa";
  const color = LINE_COLORS[dep.line];

  return (
    <li className="flex items-center gap-2 rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs">
      <span
        aria-hidden="true"
        className="flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
        style={{ backgroundColor: color, color: lineOnColor(dep.line) }}
      >
        {persianDigits(dep.line, lang)}
      </span>
      <Clock aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />
      <span className="tnum font-semibold">{persianDigits(dep.time, lang)}</span>
      {dep.isExpress && (
        <span className="flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          <Zap aria-hidden="true" className="size-2.5" />
          {isFa ? "سریع السیر" : "Express"}
        </span>
      )}
      <span className="ms-auto truncate text-muted-foreground">
        {isFa ? "به سمت" : "→"} {dep.directionName}
      </span>
      {dep.minutesUntil <= 2 && (
        <span className="shrink-0 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-700 dark:bg-green-900/30 dark:text-green-400">
          {isFa ? "الان" : "Now"}
        </span>
      )}
    </li>
  );
}
