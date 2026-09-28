"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpDown, Check, Copy, Search } from "lucide-react";
import { useMetro } from "@/app/providers";
import { WELCOME_CONTENT } from "../content";
import { persianDigits } from "@/lib/i18n";
import { findRoute } from "@/lib/route";
import {
  canBoardAtStation,
  getAllStations,
  getStation,
  searchStations,
} from "@/lib/metro/selectors";
import type { MetroStation } from "@/lib/metro/types";
import { cn } from "@/lib/utils";
import { Reveal } from "./Reveal";

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
  const value = open ? query : lang === "fa" ? station.name.fa : station.name.en;

  return (
    <div ref={wrap} className="relative flex-1">
      <label htmlFor={id} className="mb-1.5 block text-[10px] font-bold tracking-wide text-muted-foreground">
        {label}
      </label>
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border bg-background px-3 transition-colors",
          open ? "border-primary" : "border-border",
        )}
      >
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
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
      </div>

      <ul
        id={`${id}-list`}
        role="listbox"
        aria-label={label}
        className={cn(
          "absolute inset-x-0 top-full z-30 mt-2 max-h-60 overflow-y-auto rounded-lg border border-border bg-popover shadow-xl transition-all",
          open ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0",
        )}
      >
        {matches.length === 0 ? (
          <li className="px-3 py-3 text-xs text-muted-foreground">{t.noMatch}</li>
        ) : (
          matches.map((s) => (
            <li key={s.id}>
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
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-start text-sm transition-colors hover:bg-accent"
              >
                <span className="truncate font-medium">{lang === "fa" ? s.name.fa : s.name.en}</span>
              </button>
            </li>
          ))
        )}
      </ul>
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

  const trip = useMemo(() => findRoute(from.id, to.id), [from, to]);
  const href = `/?from=${from.id}&to=${to.id}`;

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);

  const swap = () => {
    setFrom(to);
    setTo(from);
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
                className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition hover:border-primary hover:text-primary active:scale-90 lg:h-11 lg:w-11"
              >
                <ArrowUpDown className="h-[18px] w-[18px]" />
              </button>
              <Field id="demo-to" label={t.toLabel} station={to} onSelect={setTo} placeholder={t.toPlaceholder} />
              <Link
                href={href}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-bold text-primary-foreground transition hover:brightness-110 active:scale-[0.98]"
              >
                {t.cta}
                {isFa ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
              </Link>
            </div>

            <div className="rounded-b-lg border-t border-border bg-background px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm font-bold tabular-nums">
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
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground transition hover:border-foreground hover:text-foreground active:scale-95"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? t.copied : t.copy}
                </button>
              </div>
              <p className="mt-2 text-[11px] leading-6 text-muted-foreground">{t.hint}</p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
