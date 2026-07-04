"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { LINE_COLORS, STATIONS, type Station } from "@/lib/metro-data";
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
  onSetOrigin: (id: string) => void;
  onSetDest: (id: string) => void;
};

export function StationsTab({ lang, onSetOrigin, onSetDest }: Props) {
  const t = STRINGS[lang];
  const isFa = lang === "fa";
  const [query, setQuery] = useState("");
  const [lineFilter, setLineFilter] = useState<number | null>(null);
  const [branchIndex, setBranchIndex] = useState(0);
  const [timetableStation, setTimetableStation] = useState<Station | null>(null);

  const lineOrder = useMemo(
    () => (lineFilter !== null ? orderLineStations(lineFilter) : null),
    [lineFilter],
  );
  const isForked = (lineOrder?.chains.length ?? 0) > 1;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = STATIONS.filter((s) => {
      if (lineFilter !== null && !s.lines.includes(lineFilter)) return false;
      if (!q) return true;
      return s.name.toLowerCase().includes(q) || s.fa.includes(query.trim());
    });

    if (lineFilter === null) {
      return filtered.sort((a, b) =>
        isFa ? a.fa.localeCompare(b.fa, "fa") : a.name.localeCompare(b.name),
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
      return isFa ? a.fa.localeCompare(b.fa, "fa") : a.name.localeCompare(b.name);
    });
  }, [query, lineFilter, isFa, branchIndex, isForked, lineOrder]);

  return (
    <div className="mx-auto flex h-full w-full max-w-xl flex-col gap-4 p-4">
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.searchStations}
          className="w-full rounded-xl border border-border bg-card py-3 ps-9 pe-3 text-sm outline-none ring-primary/30 focus:ring-2"
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
          <div className="flex gap-2">
            {lineOrder.terminals.map((termId, i) => {
              const s = STATIONS.find((st) => st.id === termId);
              const label = s ? (isFa ? s.fa : s.name) : termId;
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

      <ul className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-2">
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
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 md:items-center">
          <div className="max-h-[85vh] w-full max-w-lg overflow-hidden">
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
