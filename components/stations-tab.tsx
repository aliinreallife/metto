"use client";

import { useMemo, useState } from "react";
import { Search, ChevronRight, MapPin, Navigation, Flag } from "lucide-react";
import { LINE_COLORS, STATIONS, type Station } from "@/lib/metro-data";
import { orderLineStations } from "@/lib/route";
import { AMENITY_LABELS, STRINGS, persianDigits, type Lang } from "@/lib/i18n";
import { AMENITY_ICON_MAP } from "@/lib/amenity-icons";
import { geoUrl } from "@/lib/geo";
import { cn } from "@/lib/utils";

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
  const [openId, setOpenId] = useState<string | null>(null);
  const [branchIndex, setBranchIndex] = useState(0);

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
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col gap-3 p-4">
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.searchStations}
          className="w-full rounded-xl border border-border bg-card py-2.5 ps-9 pe-3 text-sm outline-none ring-primary/30 focus:ring-2"
        />
      </div>

      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t.filterLine}
        </p>
        <div className="flex flex-wrap gap-1.5">
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
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t.towards}
          </p>
          <div className="flex gap-1.5">
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

      <ul className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pb-2">
        {results.length === 0 && (
          <li className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            {t.noResults}
          </li>
        )}
        {results.map((s) => (
          <StationRow
            key={s.id}
            station={s}
            lang={lang}
            open={openId === s.id}
            onToggle={() => setOpenId((prev) => (prev === s.id ? null : s.id))}
            onSetOrigin={() => onSetOrigin(s.id)}
            onSetDest={() => onSetDest(s.id)}
          />
        ))}
      </ul>
    </div>
  );
}

function StationRow({
  station,
  lang,
  open,
  onToggle,
  onSetOrigin,
  onSetDest,
}: {
  station: Station;
  lang: Lang;
  open: boolean;
  onToggle: () => void;
  onSetOrigin: () => void;
  onSetDest: () => void;
}) {
  const t = STRINGS[lang];
  const isFa = lang === "fa";
  const activeAmenities = Object.entries(station.amenities).filter(
    ([, v]) => v,
  );

  return (
    <li className="shrink-0 overflow-hidden rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-start transition-colors hover:bg-accent"
        aria-expanded={open}
      >
        <span className="flex shrink-0 gap-1">
          {station.lines.map((l) => (
            <span
              key={l}
              className="size-2.5 rounded-full"
              style={{ backgroundColor: LINE_COLORS[l] }}
            />
          ))}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">
            {isFa ? station.fa : station.name}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {isFa ? station.name : station.fa}
          </span>
        </span>
        <ChevronRight
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-border px-3 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {station.lines.map((l) => (
              <span
                key={l}
                className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold text-white"
                style={{ backgroundColor: LINE_COLORS[l] }}
              >
                {t.line} {persianDigits(l, lang)}
              </span>
            ))}
            {station.lines.length > 1 && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {t.interchange}
              </span>
            )}
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t.amenities}
            </p>
            {activeAmenities.length > 0 ? (
              <ul className="grid grid-cols-2 gap-1.5">
                {activeAmenities.map(([key]) => (
                  <li key={key} className="flex items-center gap-1.5 text-sm">
                    {(() => {
                      const Icon = AMENITY_ICON_MAP[key];
                      return Icon ? (
                        <Icon className="size-3.5 shrink-0 text-primary" />
                      ) : null;
                    })()}
                    <span className="truncate">
                      {AMENITY_LABELS[key]?.[lang] ?? key}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t.noAmenities}</p>
            )}
          </div>

          <a
            href={geoUrl(
              { lat: station.lat, lng: station.lng },
              isFa ? station.fa : station.name,
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-fit items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
          >
            <MapPin className="size-3.5 text-primary" />
            {t.navigate}
          </a>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onSetOrigin}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
            >
              <Navigation className="size-3.5" />
              {t.from}
            </button>
            <button
              type="button"
              onClick={onSetDest}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
            >
              <Flag className="size-3.5" />
              {t.to}
            </button>
          </div>
        </div>
      )}
    </li>
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
        "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card hover:bg-accent",
      )}
    >
      {dot && (
        <span
          className="size-2 rounded-full"
          style={{ backgroundColor: dot }}
        />
      )}
      {children}
    </button>
  );
}
