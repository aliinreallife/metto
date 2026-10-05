"use client";

import { useMemo, useState } from "react";
import { useMetro } from "@/app/providers";
import { persianDigits } from "@/lib/i18n";
import { LINES } from "@/lib/metro/lines";
import { searchStations } from "@/lib/metro/selectors";
import { cn } from "@/lib/utils";
import {
  CANVAS,
  buildLabels,
  lineColor,
  useWelcomeMap,
  type MapStation,
} from "./welcome-map-data";
import { SearchIcon, TrainIcon } from "./Icons";

const ALL_LINE_IDS = [1, 2, 3, 4, 5, 6, 7];

/** A train that runs along a real route, so it never leaves its track. */
function TrainOnRoute({
  lineId,
  routeId,
  dur,
  begin,
}: {
  lineId: number;
  routeId: string;
  dur: number;
  begin: string;
}) {
  const color = lineColor(lineId);

  return (
    <g filter="url(#metto-train-shadow)">
      <rect x="-6.5" y="-3.75" width="13" height="7.5" rx="2" fill={color} stroke="#fff" strokeWidth="1">
        <animateMotion
          dur={`${dur}s`}
          begin={begin}
          repeatCount="indefinite"
          rotate="auto"
          keyPoints="0;1;1;0;0"
          keyTimes="0;0.46;0.5;0.96;1"
          calcMode="spline"
          keySplines="0.4 0 0.6 1; 0 0 1 1; 0.4 0 0.6 1; 0 0 1 1"
        >
          <mpath href={`#${routeId}`} />
        </animateMotion>
      </rect>
    </g>
  );
}

export function TehranMap() {
  const { lang } = useMetro();
  const isFa = lang === "fa";
  const { stations, byId, lines } = useWelcomeMap();
  const labels = useMemo(() => buildLabels(byId), [byId]);

  const [satellite, setSatellite] = useState(false);
  const [activeLines, setActiveLines] = useState<number[]>(ALL_LINE_IDS);
  const [hovered, setHovered] = useState<MapStation | null>(null);
  const [selected, setSelected] = useState<MapStation | null>(null);
  const [query, setQuery] = useState("");

  const lineMeta = (id: number) => LINES.find((l) => l.id === id);

  const toggleLine = (id: number) =>
    setActiveLines((prev) =>
      prev.includes(id) ? (prev.length === 1 ? prev : prev.filter((l) => l !== id)) : [...prev, id].sort(),
    );

  const isolateLine = (id: number) => setActiveLines([id]);

  const active = selected ?? hovered;

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return searchStations(q, 6);
  }, [query]);

  const visibleLines = lines.filter((l) => activeLines.includes(l.id));
  const visibleStations = stations.filter((s) => s.lines.some((l) => activeLines.includes(l)));

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-2.5 py-2 sm:px-3">
        <button
          type="button"
          onClick={() => setActiveLines(ALL_LINE_IDS)}
          className={cn(
            "rounded-md border px-2 py-1 text-[11px] font-bold transition-colors",
            activeLines.length === ALL_LINE_IDS.length
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          {isFa ? `همه ${persianDigits(7, lang)} خط` : "All 7"}
        </button>

        <div className="flex flex-wrap items-center gap-1">
          {ALL_LINE_IDS.map((id) => {
            const on = activeLines.includes(id);
            const meta = lineMeta(id);
            return (
              <button
                key={id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleLine(id)}
                onDoubleClick={() => isolateLine(id)}
                title={
                  isFa
                    ? `${meta?.name.fa} — دوبار کلیک برای تنها نشان دادن این خط`
                    : `${meta?.name.en} — double-click to isolate`
                }
                className={cn(
                  "tnum inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-bold transition-all active:scale-95",
                  on
                    ? "border-border bg-card text-foreground"
                    : "border-border/60 bg-muted/40 text-muted-foreground/60 line-through",
                )}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: on ? lineColor(id) : "var(--track)" }}
                  aria-hidden
                />
                {isFa ? `خط ${persianDigits(id, lang)}` : `L${id}`}
              </button>
            );
          })}
        </div>

        <div className="ms-auto flex items-center gap-2">
          <div className="relative">
            <div className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1">
              <SearchIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={isFa ? "ایستگاه…" : "Station…"}
                className="w-20 bg-transparent text-xs outline-none placeholder:text-muted-foreground sm:w-28"
                aria-label={isFa ? "جستجوی ایستگاه" : "Find a station"}
              />
            </div>
            {results.length > 0 && (
              <ul className="absolute top-full end-0 z-30 mt-1 w-52 overflow-hidden rounded-md border border-border bg-popover p-1 shadow-lg">
                {results.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(byId.get(s.id) ?? null);
                        setQuery("");
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-start text-xs transition-colors hover:bg-muted"
                    >
                      <span className="truncate font-bold">{isFa ? s.name.fa : s.name.en}</span>
                      <span className="tnum shrink-0 text-[10px] text-muted-foreground">
                        {persianDigits(byId.get(s.id)?.lines.join("·") ?? "", lang)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            type="button"
            onClick={() => setSatellite((v) => !v)}
            aria-pressed={satellite}
            className={cn(
              "rounded-md border px-2.5 py-1 text-[11px] font-bold transition-colors",
              satellite
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            {isFa ? "ماهواره" : "Satellite"}
          </button>
        </div>
      </div>

      <div
        className={cn(
          "relative w-full overflow-hidden transition-colors duration-500",
          satellite ? "bg-[#0d1424]" : "bg-background",
        )}
        style={{ aspectRatio: `${CANVAS.width} / ${CANVAS.height}` }}
      >
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <svg className="h-full w-full" viewBox={`0 0 ${CANVAS.width} ${CANVAS.height}`} preserveAspectRatio="none">
            {satellite ? (
              <>
                <defs>
                  <pattern id="metto-sat-grid" width="28" height="28" patternUnits="userSpaceOnUse">
                    <path d="M 28 0 L 0 0 0 28" fill="none" stroke="rgba(255,255,255,0.045)" strokeWidth="1" />
                  </pattern>
                </defs>
                <rect width={CANVAS.width} height={CANVAS.height} fill="url(#metto-sat-grid)" />
                <path
                  d={`M 0 0 L ${CANVAS.width} 0 L ${CANVAS.width} 40 Q 480 26 320 36 Q 160 46 0 30 Z`}
                  fill="rgba(255,255,255,0.035)"
                />
                <g stroke="rgba(255,255,255,0.075)" strokeWidth="1.5" strokeDasharray="5 5" fill="none">
                  <line x1="0" y1="132" x2={CANVAS.width} y2="132" />
                  <line x1="0" y1="212" x2={CANVAS.width} y2="212" />
                  <line x1="268" y1="0" x2="268" y2={CANVAS.height} />
                  <line x1="392" y1="0" x2="392" y2={CANVAS.height} />
                </g>
              </>
            ) : (
              <>
                <defs>
                  <pattern id="metto-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                    <path d="M 20 0 L 0 0 0 20" fill="none" stroke="var(--hairline)" strokeWidth="1" />
                  </pattern>
                </defs>
                <rect width={CANVAS.width} height={CANVAS.height} fill="url(#metto-grid)" />
              </>
            )}
          </svg>
        </div>

        <svg
          viewBox={`0 0 ${CANVAS.width} ${CANVAS.height}`}
          className="relative h-full w-full select-none"
          role="img"
          aria-label={isFa ? "نقشه مترو" : "Metro map"}
        >
          <defs>
            <filter id="metto-train-shadow" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="1" stdDeviation="1.6" floodColor="#000" floodOpacity="0.45" />
            </filter>
          </defs>

          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            {visibleLines.map((line) =>
              line.routes.map((route, i) => (
                <path
                  key={`glow-${line.id}-${i}`}
                  d={route.d}
                  stroke={lineColor(line.id)}
                  strokeWidth="9"
                  strokeOpacity={satellite ? 0.18 : 0.13}
                />
              )),
            )}
          </g>

          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            {visibleLines.map((line) =>
              line.routes.map((route, i) => (
                <path
                  key={`track-${line.id}-${i}`}
                  id={i === 0 ? `metto-route-${line.id}` : undefined}
                  d={route.d}
                  stroke={lineColor(line.id)}
                  strokeWidth={route.kind === "branch" ? 2.6 : 3.6}
                />
              )),
            )}
          </g>

          {activeLines.includes(1) && (
            <TrainOnRoute lineId={1} routeId="metto-route-1" dur={16} begin="0s" />
          )}
          {activeLines.includes(2) && (
            <TrainOnRoute lineId={2} routeId="metto-route-2" dur={19} begin="-6s" />
          )}
          {activeLines.includes(3) && (
            <TrainOnRoute lineId={3} routeId="metto-route-3" dur={21} begin="-11s" />
          )}
          {activeLines.includes(6) && (
            <TrainOnRoute lineId={6} routeId="metto-route-6" dur={23} begin="-4s" />
          )}

          <g>
            {visibleStations
              .filter((s) => !s.isTransfer)
              .map((s) => {
                const color = lineColor(s.lines[0]);
                const on = active?.id === s.id;
                return (
                  <circle
                    key={s.id}
                    cx={s.x}
                    cy={s.y}
                    r={on ? 5 : 2.7}
                    fill={satellite ? "#0d1424" : "var(--background)"}
                    stroke={on ? "var(--primary)" : color}
                    strokeWidth={on ? 2.4 : 1.7}
                    className="cursor-pointer transition-[r] duration-150"
                    onMouseEnter={() => setHovered(s)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => setSelected(s.id === selected?.id ? null : s)}
                  />
                );
              })}
          </g>

          <g>
            {visibleStations
              .filter((s) => s.isTransfer)
              .map((s) => {
                const on = active?.id === s.id;
                return (
                  <g
                    key={`x-${s.id}`}
                    className="cursor-pointer"
                    onMouseEnter={() => setHovered(s)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => setSelected(s.id === selected?.id ? null : s)}
                  >
                    {on && (
                      <circle
                        cx={s.x}
                        cy={s.y}
                        r="11"
                        fill="var(--primary)"
                        opacity="0.22"
                        className="soft-pulse"
                      />
                    )}
                    <circle
                      cx={s.x}
                      cy={s.y}
                      r={on ? 7.4 : 5.6}
                      fill={satellite ? "#16203a" : "var(--background)"}
                      stroke={satellite ? "#e2e8f0" : "var(--foreground)"}
                      strokeWidth="1.9"
                    />
                    <circle cx={s.x} cy={s.y} r={on ? 3.2 : 2.1} fill="var(--primary)" />
                  </g>
                );
              })}
          </g>

          <g
            fontFamily="Vazirmatn, system-ui, sans-serif"
            fontSize="9.5"
            fontWeight="700"
            fill={satellite ? "#e6ecf5" : "var(--foreground)"}
            stroke={satellite ? "#0d1424" : "var(--background)"}
            strokeWidth="3"
            strokeLinejoin="round"
            paintOrder="stroke"
            className="pointer-events-none"
          >
            {labels
              .filter((l) => l.station.lines.some((id) => activeLines.includes(id)))
              .map((l) => (
                <text
                  key={l.station.id}
                  x={l.station.x + l.dx}
                  y={l.station.y + l.dy}
                  textAnchor={l.anchor}
                >
                  {isFa ? l.fa : l.en}
                </text>
              ))}
          </g>
        </svg>

        {active && (
          <div
            className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-[calc(100%+10px)] rounded-lg border border-border bg-popover/95 px-3 py-2 shadow-xl backdrop-blur-md"
            style={{
              left: `${(active.x / CANVAS.width) * 100}%`,
              top: `${(active.y / CANVAS.height) * 100}%`,
            }}
          >
            <div className="flex items-center gap-2 whitespace-nowrap">
              <span className="text-sm font-extrabold text-foreground">
                {isFa ? active.fa : active.en}
              </span>
              {active.isTransfer && (
                <span className="rounded bg-primary-wash px-1.5 py-0.5 text-[10px] font-bold text-primary">
                  {isFa ? "تقاطع" : "Interchange"}
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-1">
              {active.lines.map((l) => (
                <span
                  key={l}
                  className="tnum rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
                  style={{ backgroundColor: lineColor(l) }}
                >
                  {isFa ? `خط ${persianDigits(l, lang)}` : `L${l}`}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="absolute bottom-2.5 start-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-card/90 px-2.5 py-1.5 text-[10px] font-bold backdrop-blur-md">
          <span className="flex items-center gap-1.5">
            <span className="flex h-3 w-3 items-center justify-center rounded-full border border-foreground bg-background">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
            {isFa ? "تقاطع" : "Interchange"}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-primary" />
            {isFa ? "ایستگاه" : "Station"}
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <TrainIcon className="h-3.5 w-3.5 text-primary" />
            {isFa ? "قطار روی ریل" : "Train on track"}
          </span>
          <span className="tnum text-muted-foreground">
            {isFa
              ? `${persianDigits(visibleStations.length, lang)} از ${persianDigits(stations.length, lang)} ایستگاه`
              : `${visibleStations.length} of ${stations.length} stations`}
          </span>
        </div>
      </div>
    </div>
  );
}
