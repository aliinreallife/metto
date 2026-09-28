"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Map as MapIcon } from "lucide-react";
import { useMetro } from "@/app/providers";
import { WELCOME_CONTENT } from "../content";
import { persianDigits, type Lang } from "@/lib/i18n";
import { findRoute } from "@/lib/route";
import { getAllStations, getStation } from "@/lib/metro/selectors";
import { LINES } from "@/lib/metro/lines";
import { cn } from "@/lib/utils";
import { Reveal } from "./Reveal";

function useTehranClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return useMemo(() => {
    try {
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Tehran",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(new Date(now));
      let h = "00";
      let m = "00";
      for (const p of parts) {
        if (p.type === "hour") h = p.value;
        if (p.type === "minute") m = p.value;
      }
      const date = new Intl.DateTimeFormat("fa-IR", {
        timeZone: "Asia/Tehran",
        day: "numeric",
        month: "long",
        weekday: "long",
      }).format(new Date(now));
      return { time: `${h}:${m}`, date };
    } catch {
      return { time: "", date: "" };
    }
  }, [now]);
}

function pad(v: number) {
  return String(v).padStart(2, "0");
}

const HEADWAY = 360;

function secondsToClock(total: number, lang: Lang) {
  const w = ((total % 86400) + 86400) % 86400;
  const s = `${pad(Math.floor(w / 3600))}:${pad(Math.floor((w % 3600) / 60))}`;
  return persianDigits(s, lang);
}

function tehranSeconds(): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Tehran",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    let h = 0;
    let m = 0;
    let s = 0;
    for (const p of parts) {
      if (p.type === "hour") h = Number(p.value) % 24;
      if (p.type === "minute") m = Number(p.value);
      if (p.type === "second") s = Number(p.value);
    }
    return h * 3600 + m * 60 + s;
  } catch {
    return null;
  }
}

function RoutePanel() {
  const { lang } = useMetro();
  const t = WELCOME_CONTENT[lang].hero.panel;
  const clock = useTehranClock();

  const demo = useMemo(() => findRoute("tajrish", "tehran-sadeghiyeh"), []);
  const origin = getStation("tajrish");
  const dest = getStation("tehran-sadeghiyeh");

  const nowSec = tehranSeconds();
  const sinceLast = nowSec == null ? 0 : nowSec % HEADWAY;
  const nextIn = HEADWAY - sinceLast;
  const progress = (sinceLast / HEADWAY) * 100;
  const base = (nowSec ?? 0) - sinceLast;
  const arrivals = [1, 2, 3].map((k) => secondsToClock(base + k * HEADWAY, lang));
  const countdown =
    nowSec == null
      ? "--:--"
      : persianDigits(`${pad(Math.floor(nextIn / 60))}:${pad(nextIn % 60)}`, lang);

  const minutes = demo ? Math.max(1, Math.round(demo.totalSeconds / 60)) : 50;
  const stops = demo?.numStops ?? 22;
  const changes = demo?.numTransfers ?? 1;
  const transfer = demo?.segments?.[1]
    ? getStation(demo.path[Math.floor(demo.path.length / 2)] ?? "imam-khomeini")
    : getStation("imam-khomeini");

  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-2.5">
        <span className="inline-flex items-center gap-2 text-[11px] font-bold text-primary">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          {t.live}
        </span>
        <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>{t.localTime}</span>
          <span className="font-bold tabular-nums text-foreground">
            {clock.time ? persianDigits(clock.time, lang) : t.waiting}
          </span>
        </span>
      </div>

      <div className="px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex items-center gap-3">
          <span className="h-3.5 w-3.5 rounded-full border-[3px] border-primary bg-background" />
          <span className="min-w-0 flex-1 truncate text-[15px] font-bold">
            {lang === "fa" ? origin?.name.fa : origin?.name.en}
          </span>
          <span className="flex shrink-0 flex-col items-end gap-0.5">
            <span className="text-[10px] leading-none text-muted-foreground">{t.depart}</span>
            <span className="text-sm font-bold tabular-nums leading-none">
              {secondsToClock(base + HEADWAY, lang)}
            </span>
          </span>
        </div>

        <div className="relative ms-[13px] h-28">
          <span className="absolute start-0 top-0 h-[52%] w-[3px] rounded-full bg-primary" aria-hidden />
          <span className="absolute start-0 bottom-0 h-[50%] w-[3px] rounded-full bg-foreground/25" aria-hidden />
          <div className="absolute top-[52%] flex -translate-y-1/2 items-center gap-2">
            <span className="h-3.5 w-3.5 rounded-full border-[3px] border-foreground bg-card" aria-hidden />
            <span className="flex items-center gap-2 whitespace-nowrap rounded-lg border border-border bg-card px-2 py-1 text-[10px] font-bold shadow-sm">
              {t.transferAt} {lang === "fa" ? transfer?.name.fa : transfer?.name.en}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="h-3.5 w-3.5 rounded-full border-[3px] border-foreground bg-primary" />
          <span className="min-w-0 flex-1 truncate text-[15px] font-bold">
            {lang === "fa" ? dest?.name.fa : dest?.name.en}
          </span>
          <span className="flex shrink-0 flex-col items-end gap-0.5">
            <span className="text-[10px] leading-none text-muted-foreground">{t.arrive}</span>
            <span className="text-sm font-bold tabular-nums leading-none">
              {demo?.estimatedArrival ? persianDigits(demo.estimatedArrival, lang) : secondsToClock(base + HEADWAY + minutes * 60, lang)}
            </span>
          </span>
        </div>

        <dl className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border bg-border">
          {[
            { v: persianDigits(minutes, lang), l: t.duration, u: t.minutes },
            { v: persianDigits(stops, lang), l: t.stops, u: "" },
            { v: persianDigits(changes, lang), l: t.changes, u: "" },
          ].map((m) => (
            <div key={m.l} className="bg-muted/40 px-2 py-2.5 text-center">
              <dt className="text-[10px] leading-tight text-muted-foreground">{m.l}</dt>
              <dd className="mt-1 flex items-baseline justify-center gap-1 text-base font-extrabold leading-none tabular-nums">
                {m.v}
                {m.u && <span className="text-[9px] font-normal text-muted-foreground">{m.u}</span>}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-4 rounded-lg border border-border bg-background p-3.5">
          <div className="flex items-end justify-between gap-3">
            <span className="text-[11px] font-bold text-muted-foreground">{t.nextTrain}</span>
            <span className="text-3xl font-black leading-none tracking-tight tabular-nums text-primary">{countdown}</span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full bg-primary transition-[width] duration-1000" style={{ width: `${Math.max(2, progress)}%` }} />
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
            <span className="text-[10px] text-muted-foreground">{t.following}</span>
            <span className="flex items-center gap-2 text-xs font-bold tabular-nums">
              {arrivals.map((a, i) => (
                <span key={`${a}-${i}`} className={cn(i === 0 ? "text-foreground" : "text-muted-foreground")}>
                  {a}
                </span>
              ))}
            </span>
          </div>
        </div>

        <p className="mt-4 text-[10px] text-muted-foreground">
          {clock.date} · {t.note}
        </p>
      </div>
    </div>
  );
}

const TICKER: { fa: string; en: string; line: number }[] = [
  { fa: "تجریش", en: "Tajrish", line: 1 },
  { fa: "شهید بهشتی", en: "Shahid Beheshti", line: 1 },
  { fa: "امام خمینی", en: "Imam Khomeini", line: 1 },
  { fa: "شهرری", en: "Shahr-e Rey", line: 1 },
  { fa: "فرهنگسرا", en: "Farhangsara", line: 2 },
  { fa: "صادقیه", en: "Sadeghiyeh", line: 2 },
  { fa: "قائم", en: "Qa'em", line: 3 },
  { fa: "تئاتر شهر", en: "Teatr-e Shahr", line: 3 },
  { fa: "آزادگان", en: "Azadegan", line: 3 },
  { fa: "میدان آزادی", en: "Meydan-e Azadi", line: 4 },
  { fa: "ارم سبز", en: "Eram-e Sabz", line: 4 },
  { fa: "کرج", en: "Karaj", line: 5 },
  { fa: "گلشهر", en: "Golshahr", line: 5 },
  { fa: "کوهسار", en: "Kouhsar", line: 6 },
  { fa: "میدان کتاب", en: "Meydan-e Ketab", line: 7 },
  { fa: "برج میلاد", en: "Milad Tower", line: 7 },
];

export function Hero() {
  const { lang } = useMetro();
  const t = WELCOME_CONTENT[lang].hero;
  const isFa = lang === "fa";
  const stationCount = getAllStations().length;
  const lineCount = LINES.length;

  return (
    <section className="relative overflow-hidden" id="hero">
      <div className="relative mx-auto w-full max-w-6xl px-4 pb-10 pt-10 sm:px-6 sm:pb-14 sm:pt-16">
        <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-7">
            <Reveal>
              <span className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg border border-border bg-card px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 font-bold text-primary">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" aria-hidden />
                  {t.eyebrow}
                </span>
                <span className="text-border" aria-hidden>|</span>
                <span>{t.city}</span>
                <span className="text-border" aria-hidden>·</span>
                <span className="tabular-nums">
                  {persianDigits(`${stationCount} ایستگاه · ${lineCount} خط`, lang)}
                </span>
              </span>
            </Reveal>

            <Reveal delay={70}>
              <h1 className="mt-5 text-[clamp(2.3rem,7vw,4.2rem)] font-black leading-[1.06] tracking-tight">
                {t.h1a}
                <br />
                <span className="text-primary">{t.h1b}</span>
              </h1>
            </Reveal>

            <Reveal delay={140}>
              <p className="mt-5 max-w-xl text-base leading-8 text-muted-foreground sm:text-lg sm:leading-9">{t.sub}</p>
              <p className="mt-2 max-w-xl text-base font-medium sm:text-lg">{WELCOME_CONTENT[lang].hero.slogan}</p>
            </Reveal>

            <Reveal delay={210}>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-sm font-bold text-primary-foreground transition hover:brightness-110 active:scale-[0.98]"
                >
                  {t.ctaPrimary}
                  {isFa ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
                </Link>
                <Link
                  href="/map"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-border bg-card px-6 text-sm font-bold transition hover:border-foreground active:scale-[0.98]"
                >
                  <MapIcon className="h-4 w-4 text-primary" />
                  {t.ctaSecondary}
                </Link>
              </div>
            </Reveal>

            <Reveal delay={270}>
              <p className="mt-5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
                {t.trust.map((item, i) => (
                  <span key={item} className="inline-flex items-center gap-2.5">
                    {i > 0 && <span className="text-primary/60" aria-hidden>·</span>}
                    <span className="font-medium">{item}</span>
                  </span>
                ))}
              </p>
            </Reveal>

            <Reveal delay={330}>
              <dl className="mt-9 flex flex-wrap items-stretch gap-px overflow-hidden rounded-lg border border-border bg-border">
                {[
                  { v: persianDigits(stationCount, lang), l: isFa ? "ایستگاه" : "stations" },
                  { v: persianDigits(lineCount, lang), l: isFa ? "خط" : "lines" },
                ].map((s) => (
                  <div key={s.l} className="flex-1 bg-card px-4 py-3 sm:px-6">
                    <dt className="text-2xl font-black leading-none tracking-tight tabular-nums sm:text-3xl">{s.v}</dt>
                    <dd className="mt-1.5 text-[11px] text-muted-foreground">{s.l}</dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          </div>

          <div className="lg:col-span-5">
            <Reveal delay={180} className="lg:ms-auto lg:max-w-sm">
              <RoutePanel />
            </Reveal>
          </div>
        </div>
      </div>

      <div className="relative overflow-hidden border-y border-border bg-muted/30 py-2.5" dir={isFa ? "rtl" : "ltr"}>
        <div className="flex w-max items-center gap-8 pe-8">
          {TICKER.map((s) => (
            <span key={s.en} className="flex items-center gap-8 whitespace-nowrap text-xs font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-primary/70" aria-hidden />
              <span>{isFa ? s.fa : s.en}</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
