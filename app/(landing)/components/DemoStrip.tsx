"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMetro } from "@/app/providers";
import { WELCOME_CONTENT } from "../content";
import { persianDigits } from "@/lib/i18n";
import { findRoute } from "@/lib/route";
import {
  canBoardAtStation,
  getAllStations,
  getStation,
  getStationLines,
  searchStations,
} from "@/lib/metro/selectors";
import type { MetroStation } from "@/lib/metro/types";
import { cn } from "@/lib/utils";
import { Reveal } from "./Reveal";
import {
  ArrowIcon,
  CheckIcon,
  CopyIcon,
  SearchIcon,
  SwapIcon,
  TrainIcon,
} from "./Icons";

function Field({
  id,
  label,
  station,
  onSelect,
  placeholder,
}: {
  id: string;
  label: string;
  station: MetroStation;
  onSelect: (s: MetroStation) => void;
  placeholder: string;
}) {
  const { lang } = useMetro();
  const t = WELCOME_CONTENT[lang].demo;
  const isFa = lang === "fa";
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const matches = useMemo(() => (open ? searchStations(query, 6) : []), [open, query]);
  const value = open ? query : isFa ? station.name.fa : station.name.en;
  const lines = getStationLines(station.id);

  return (
    <div ref={wrap} className="relative flex-1">
      <label htmlFor={id} className="mb-1.5 block text-[10px] font-bold tracking-wide text-muted-foreground">
        {label}
      </label>
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border bg-background px-3 transition-colors duration-200",
          open ? "border-primary" : "border-border hover:border-input",
        )}
      >
        <SearchIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? `${id}-list` : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setQuery("");
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && matches[0]) {
              onSelect(matches[0]);
              setQuery("");
              setOpen(false);
            }
          }}
          className="h-11 w-full min-w-0 bg-transparent text-sm font-bold outline-none placeholder:font-normal placeholder:text-muted-foreground/85"
        />
        <span className="tnum hidden shrink-0 rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground sm:inline">
          {isFa ? `خط ${persianDigits(lines.join("، "), lang)}` : `L${lines.join("/")}`}
        </span>
      </div>

      {/* Mounted only while open: a closed (opacity-0) listbox must not
          linger in the accessibility tree with no valid owned options. */}
      {open && (
      <ul
        id={`${id}-list`}
        role="listbox"
        aria-label={label}
        className="absolute inset-x-0 top-full z-30 mt-2 max-h-60 overflow-y-auto rounded-lg border border-border bg-popover shadow-[0_24px_48px_-24px_rgba(0,0,0,0.35)]"
      >
        {matches.length === 0 ? (
          <li
            role="option"
            aria-selected="false"
            aria-disabled="true"
            className="px-3 py-3 text-xs text-muted-foreground"
          >
            {t.noMatch}
          </li>
        ) : (
          matches.map((s) => (
            <li key={s.id} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={s.id === station.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect(s);
                  setQuery("");
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 px-3 py-2.5 text-start text-sm transition-colors duration-150 hover:bg-primary-wash hover:text-primary",
                  s.id === station.id && "bg-muted font-bold",
                )}
              >
                <span className="truncate font-medium">{isFa ? s.name.fa : s.name.en}</span>
                <span className="tnum shrink-0 text-[10px] text-muted-foreground">
                  {persianDigits(getStationLines(s.id).join(" · "), lang)}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
      )}
    </div>
  );
}

export function DemoStrip() {
  const { lang } = useMetro();
  const t = WELCOME_CONTENT[lang].demo;
  const isFa = lang === "fa";

  const boardable = useMemo(() => getAllStations().filter((s) => canBoardAtStation(s.id)), []);
  const [from, setFrom] = useState<MetroStation>(() => getStation("tajrish") ?? boardable[0]);
  const [to, setTo] = useState<MetroStation>(() => getStation("tehran-sadeghiyeh") ?? boardable[1]);
  const [copied, setCopied] = useState(false);
  const [spin, setSpin] = useState(false);

  const trip = useMemo(() => findRoute(from.id, to.id), [from, to]);
  const href = `/route?from=${from.id}&to=${to.id}`;

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);

  const swap = () => {
    setFrom(to);
    setTo(from);
    setSpin(true);
    window.setTimeout(() => setSpin(false), 400);
  };

  const copy = async () => {
    const url = `https://metto.ir${href}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setCopied(true);
      } catch {
        setCopied(false);
      }
    }
  };

  const minutes = trip ? Math.max(1, Math.round(trip.totalSeconds / 60)) : null;
  const transfers = useMemo(() => {
    if (!trip) return [];
    return trip.segments.slice(1).map((seg) => ({
      stationId: seg.stations[0],
      line: seg.line,
    }));
  }, [trip]);

  return (
    <section id="demo" className="relative border-b border-border bg-muted/25 py-14 sm:py-20">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="text-[11px] font-bold tracking-widest text-primary uppercase">{t.eyebrow}</span>
              <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">{t.title}</h2>
            </div>
            <p className="max-w-sm text-sm leading-7 text-muted-foreground">{t.desc}</p>
          </div>
        </Reveal>

        <Reveal delay={90}>
          <div className="relative mt-7 rounded-lg border border-border bg-card">
            <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[1fr_auto_1fr_auto] lg:items-end lg:gap-5">
              <Field id="demo-from" label={t.fromLabel} station={from} onSelect={setFrom} placeholder={t.fromPlaceholder} />
              <button
                type="button"
                onClick={swap}
                aria-label={t.swap}
                title={t.swap}
                className="mx-auto mb-0.5 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-all duration-200 hover:border-primary hover:text-primary active:scale-90 lg:h-11 lg:w-11"
              >
                <SwapIcon
                  className={cn("h-[18px] w-[18px] transition-transform duration-300", spin && "rotate-180")}
                />
              </button>
              <Field id="demo-to" label={t.toLabel} station={to} onSelect={setTo} placeholder={t.toPlaceholder} />
              <Link
                href={href}
                className="group inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-bold text-primary-foreground transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
              >
                {t.cta}
                <ArrowIcon className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" />
              </Link>
            </div>

            <div className="rounded-b-lg border-t border-border bg-background px-4 py-4 sm:px-5">
              <div className="flex items-center gap-3">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-primary bg-background" aria-hidden />
                <div className="relative h-[3px] flex-1 overflow-visible rounded-full bg-track">
                  <span
                    className="run-rail absolute top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md bg-primary text-primary-foreground"
                    aria-hidden
                  >
                    <TrainIcon className="h-3.5 w-3.5" />
                  </span>
                </div>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary" aria-hidden />
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                <div className="tnum flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm font-bold">
                  {trip && minutes != null ? (
                    <>
                      <span>
                        {persianDigits(minutes, lang)} <span className="font-normal text-muted-foreground">{t.minutes}</span>
                      </span>
                      <span className="text-border" aria-hidden>|</span>
                      <span>
                        {persianDigits(trip.numStops, lang)} <span className="font-normal text-muted-foreground">{t.stops}</span>
                      </span>
                      <span className="text-border" aria-hidden>|</span>
                      <span>
                        {persianDigits(trip.numTransfers, lang)} <span className="font-normal text-muted-foreground">{t.changes}</span>
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">{t.sameStation}</span>
                  )}
                  <span className="text-[10px] font-normal text-muted-foreground">({t.estimate})</span>
                </div>

                <button
                  type="button"
                  onClick={copy}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground transition-all duration-200 hover:border-foreground hover:text-foreground active:scale-95"
                >
                  {copied ? <CheckIcon className="h-3.5 w-3.5 text-primary" /> : <CopyIcon className="h-3.5 w-3.5" />}
                  {copied ? t.copied : t.copy}
                  <span className="latin hidden max-w-[15rem] truncate text-[10px] font-medium opacity-60 sm:inline">
                    metto.ir{href}
                  </span>
                </button>
              </div>

              {transfers.length > 0 && (
                <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-6 text-muted-foreground">
                  <span className="font-bold text-foreground">
                    {isFa ? "تعویض خط در" : "Change at"}:
                  </span>
                  {transfers.map((xfer) => {
                    const s = getStation(xfer.stationId);
                    if (!s) return null;
                    return (
                      <span
                        key={xfer.stationId}
                        className="rounded border border-border bg-muted/50 px-1.5 py-0.5 font-bold"
                      >
                        {isFa ? s.name.fa : s.name.en}
                        <span className="tnum ms-1 text-primary">
                          {isFa ? `خط ${persianDigits(xfer.line, lang)}` : `L${xfer.line}`}
                        </span>
                      </span>
                    );
                  })}
                </p>
              )}

              <p className="mt-2 text-[11px] leading-6 text-muted-foreground">{t.hint}</p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
