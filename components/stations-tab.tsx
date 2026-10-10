"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { LINE_COLORS } from "@/lib/metro/lines";
import { getAllStations } from "@/lib/metro/selectors";
import { getStation, getStationLines } from "@/lib/metro/selectors";
import type { MetroStation } from "@/lib/metro/types";
import { orderLineStations } from "@/lib/route";
import { STRINGS, persianDigits, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { StationCard } from "@/components/station-card";
import { StationTimesheet } from "@/components/station-timesheet";

const LINE_NUMBERS = Object.keys(LINE_COLORS)
  .map(Number)
  .sort((a, b) => a - b);

type Props = {
  lang: Lang;
  onSetDest: (id: string) => void;
};

export function StationsTab({ lang, onSetDest }: Props) {
  const t = STRINGS[lang];
  const isFa = lang === "fa";
  const [query, setQuery] = useState("");
  const [lineFilter, setLineFilter] = useState<number | null>(null);
  const [branchIndex, setBranchIndex] = useState(0);
  const [timetableStation, setTimetableStation] = useState<MetroStation | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  // Backdrop click closes the sheet; Escape covers keyboard users.
  // Focus trap (#43): while open, Tab cycles inside the dialog and focus
  // returns to the opener on close. No visual change for mouse users.
  useEffect(() => {
    if (!timetableStation) return;
    prevFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setTimetableStation(null);
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    // Move focus into the dialog on open (first control, else the panel).
    requestAnimationFrame(() => {
      const first = dialogRef.current?.querySelector<HTMLElement>("button:not([disabled])");
      (first ?? dialogRef.current)?.focus();
    });
    return () => {
      window.removeEventListener("keydown", onKey);
      prevFocusRef.current?.focus();
    };
  }, [timetableStation]);

  const lineOrder = useMemo(
    () => (lineFilter !== null ? orderLineStations(lineFilter) : null),
    [lineFilter],
  );
  const isForked = (lineOrder?.chains.length ?? 0) > 1;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = getAllStations().filter((s) => {
      if (lineFilter !== null && !getStationLines(s.id).includes(lineFilter)) return false;
      if (!q) return true;
      return s.name.en.toLowerCase().includes(q) || s.name.fa.includes(query.trim());
    });

    if (lineFilter === null) {
      return filtered.sort((a, b) =>
        isFa ? a.name.fa.localeCompare(b.name.fa, "fa") : a.name.en.localeCompare(b.name.en),
      );
    }

    const chain = isForked
      ? (lineOrder?.chains[branchIndex] ?? [])
      : (lineOrder?.chains[0] ?? []);
    const orderMap = new Map<string, number>();
    chain.forEach((id, idx) => orderMap.set(id, idx));
    return filtered.sort((a, b) => {
      const oa = orderMap.get(a.id);
      const ob = orderMap.get(b.id);
      if (oa !== undefined && ob !== undefined) return oa - ob;
      if (oa !== undefined) return -1;
      if (ob !== undefined) return 1;
      return isFa ? a.name.fa.localeCompare(b.name.fa, "fa") : a.name.en.localeCompare(b.name.en);
    });
  }, [query, lineFilter, isFa, branchIndex, isForked, lineOrder]);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-xl flex-col gap-4 overflow-x-hidden p-4">
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.searchStations}
          aria-label={t.searchStations}
          className="ios-no-zoom-input w-full rounded-xl border border-border bg-card py-3 ps-9 pe-3 text-sm outline-none ring-primary/30 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        />
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t.filterLine}
        </p>
        <div className="flex flex-wrap gap-2">
          <FilterChip
            active={lineFilter === null}
            onClick={() => { setLineFilter(null); setBranchIndex(0); }}
          >
            {t.all}
          </FilterChip>
          {LINE_NUMBERS.map((l) => (
            <FilterChip
              key={l}
              active={lineFilter === l}
              onClick={() => { setLineFilter(l); setBranchIndex(0); }}
              dot={LINE_COLORS[l]}
            >
              {t.line} {persianDigits(l, lang)}
            </FilterChip>
          ))}
        </div>
      </div>

      {isForked && lineOrder && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t.towards}
          </p>
          <div className="flex flex-wrap gap-2">
            {lineOrder.terminals.map((termId, i) => {
              const s = getStation(termId);
              const label = s ? (isFa ? s.name.fa : s.name.en) : termId;
              return (
                <FilterChip
                  key={i}
                  active={branchIndex === i}
                  onClick={() => setBranchIndex(i)}
                >
                  {isFa ? "تا " : "To "}{label}
                </FilterChip>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {persianDigits(results.length, lang)} {isFa ? "ایستگاه" : "stations"}
      </p>

      <ul className="no-scrollbar flex flex-col gap-3 overflow-x-hidden pb-2">
        {results.length === 0 && (
          <li className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            {t.noResults}
          </li>
        )}
        {results.map((s) => (
          <li key={s.id}>
            <StationCard
              station={s}
              lang={lang}
              onSetDest={() => onSetDest(s.id)}
              onShowTimetable={() => setTimetableStation(s)}
            />
          </li>
        ))}
      </ul>

      {timetableStation && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 md:items-center"
          onClick={() => setTimetableStation(null)}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={isFa ? timetableStation.name.fa : timetableStation.name.en}
            tabIndex={-1}
            className="max-h-[85vh] w-full max-w-lg overflow-hidden outline-none"
            onClick={(e) => e.stopPropagation()}
          >
            <StationTimesheet
              station={timetableStation}
              lang={lang}
              onClose={() => setTimetableStation(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  dot,
  children,
}: {
  active: boolean;
  onClick: () => void;
  dot?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card hover:bg-accent",
      )}
    >
      {dot && (
        <span
          className="size-2.5 rounded-full"
          style={{ backgroundColor: dot }}
        />
      )}
      {children}
    </button>
  );
}
