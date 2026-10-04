"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useMetro } from "@/app/providers";
import { WELCOME_CONTENT } from "../content";
import { persianDigits, type Lang } from "@/lib/i18n";
import { findRoute } from "@/lib/route";
import {
  getAllStations,
  getStation,
  getStationLines,
  isInterchange,
} from "@/lib/metro/selectors";
import { LINES } from "@/lib/metro/lines";
import { cn } from "@/lib/utils";
import { Reveal } from "./Reveal";
import { ArrowIcon, MapIcon, TrainIcon } from "./Icons";
import { useTehranClock } from "./tehran-clock";

function pad(v: number) {
  return String(v).padStart(2, "0");
}

const HEADWAY = 360; // seconds between departures on the demo corridor

function secondsToClock(total: number, lang: Lang) {
  const w = ((total % 86400) + 86400) % 86400;
  const s = `${pad(Math.floor(w / 3600))}:${pad(Math.floor((w % 3600) / 60))}`;
  return persianDigits(s, lang);
}

function LineBadge({ line, tone = "solid" }: { line: number; tone?: "solid" | "ghost" }) {
  const { lang } = useMetro();
  const t = WELCOME_CONTENT[lang].hero.panel;
  return (
    <span
      className={cn(
        "tnum inline-flex items-center gap-1 rounded-lg border px-1.5 py-0.5 text-[10px] font-bold leading-none",
        tone === "solid"
          ? "border-primary/40 bg-primary-wash text-primary"
          : "border-border bg-muted text-muted-foreground",
      )}
    >
      <span className="hidden sm:inline">{t.lineLabel}</span>
      {persianDigits(line, lang)}
    </span>
  );
}

function StationRow({
  label,
  name,
  lines,
  time,
  variant,
}: {
  label: string;
  name: string;
  lines: number[];
  time: string;
  variant: "start" | "end";
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="relative flex h-7 w-7 shrink-0 items-center justify-center">
        <span
          className={cn(
            "h-3.5 w-3.5 rounded-full border-[3px]",
            variant === "start" ? "border-primary bg-background" : "border-foreground bg-primary",
          )}
        />
        {variant === "end" && (
          <span className="absolute h-3.5 w-3.5 rounded-full bg-primary/30 soft-pulse" aria-hidden />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <span className="truncate text-[15px] font-bold">{name}</span>
        {lines.map((l) => (
          <LineBadge key={l} line={l} />
        ))}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="text-[10px] leading-none text-muted-foreground">{label}</span>
        <span className="tnum text-sm font-bold leading-none">{time}</span>
      </span>
    </div>
  );
}

function RoutePanel() {
  const { lang } = useMetro();
  const t = WELCOME_CONTENT[lang].hero.panel;
  const clock = useTehranClock();

  const demo = useMemo(() => findRoute("tajrish", "tehran-sadeghiyeh"), []);
  const origin = getStation("tajrish");
  const dest = getStation("tehran-sadeghiyeh");
  const originLines = origin ? getStationLines(origin.id) : [1];
  const destLines = dest ? getStationLines(dest.id) : [2, 5];

  const sinceLast = clock.seconds % HEADWAY;
  const nextIn = HEADWAY - sinceLast;
  const progress = sinceLast / HEADWAY;
  const base = clock.seconds - sinceLast;

  const arrivals = [1, 2, 3].map((k) => secondsToClock(base + k * HEADWAY, lang));
  const countdown = persianDigits(`${pad(Math.floor(nextIn / 60))}:${pad(nextIn % 60)}`, lang);

  const minutes = demo ? Math.max(1, Math.round(demo.totalSeconds / 60)) : 50;
  const stops = demo?.numStops ?? 22;
  const changes = demo?.numTransfers ?? 1;
  const walkMin = demo ? Math.max(1, Math.round(demo.transferWalkSeconds / 60)) : 3;
  const transferSeg = demo?.segments?.[1];
  const transferId = transferSeg?.stations?.[0] ?? "imam-khomeini";
  const transfer = getStation(transferId);
  const transferLine = transferSeg?.line ?? 2;
  const arriveAt = demo?.estimatedArrival
    ? persianDigits(demo.estimatedArrival, lang)
    : secondsToClock(base + HEADWAY + minutes * 60, lang);

  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-2.5">
        <span className="inline-flex items-center gap-2 text-[11px] font-bold text-primary">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-primary soft-pulse" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          {t.live}
        </span>
        <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>{t.localTime}</span>
          <span className="tnum font-bold text-foreground">{clock.time || t.waiting}</span>
        </span>
      </div>

      <div className="px-4 py-4 sm:px-5 sm:py-5">
        <StationRow
          variant="start"
          label={t.depart}
          name={lang === "fa" ? (origin?.name.fa ?? "تجریش") : (origin?.name.en ?? "Tajrish")}
          lines={originLines}
          time={secondsToClock(base + HEADWAY, lang)}
        />

        <div className="relative ms-3.5 h-40">
          <span className="absolute -start-[1.5px] top-0 h-[52%] w-[3px] rounded-full bg-primary" aria-hidden />
          <span
            className="absolute -start-[1.5px] bottom-0 h-[50%] w-[3px] rounded-full bg-foreground/25"
            aria-hidden
          />
          {[8, 17, 26, 35, 42, 63, 73, 83, 93].map((pct) => (
            <span
              key={pct}
              className="absolute -start-[5px] h-[2.5px] w-[10px] rounded-full bg-card"
              style={{ top: `${pct}%` }}
              aria-hidden
            />
          ))}

          <div className="absolute top-[52%] -translate-y-1/2 -start-[7px] flex items-center gap-2">
            <span className="h-3.5 w-3.5 rounded-full border-[3px] border-foreground bg-card" aria-hidden />
            <span className="flex items-center gap-2 rounded-lg border border-border bg-card px-2 py-1 text-[10px] font-bold shadow-sm">
              <ArrowIcon className="h-3 w-3 shrink-0 text-primary rtl:rotate-180" />
              <span className="whitespace-nowrap">
                {t.transferAt} {lang === "fa" ? transfer?.name.fa : transfer?.name.en}
              </span>
              <LineBadge line={transferLine} tone="ghost" />
            </span>
          </div>

          <span
            className="run-rail-v absolute -start-[10px] flex h-5 w-5 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-[0_4px_10px_-4px_rgba(0,0,0,0.6)]"
            aria-hidden
          >
            <TrainIcon className="h-3.5 w-3.5" />
          </span>
        </div>

        <StationRow
          variant="end"
          label={t.arrive}
          name={lang === "fa" ? (dest?.name.fa ?? "صادقیه") : (dest?.name.en ?? "Sadeghiyeh")}
          lines={destLines}
          time={arriveAt}
        />

        <dl className="mt-5 grid grid-cols-4 gap-px overflow-hidden rounded-lg border border-border bg-border">
          {[
            { v: persianDigits(minutes, lang), l: t.duration, u: t.minutes },
            { v: persianDigits(stops, lang), l: t.stops, u: "" },
            { v: persianDigits(changes, lang), l: t.changes, u: "" },
            { v: persianDigits(walkMin, lang), l: t.walk, u: t.minutes },
          ].map((m) => (
            <div key={m.l} className="bg-muted/40 px-2 py-2.5 text-center">
              <dt className="text-[10px] leading-tight text-muted-foreground">{m.l}</dt>
              <dd className="tnum mt-1 flex items-baseline justify-center gap-1 text-base font-extrabold leading-none">
                {m.v}
                {m.u && <span className="text-[9px] font-normal text-muted-foreground">{m.u}</span>}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-4 rounded-lg border border-border bg-background p-3.5">
          <div className="flex items-end justify-between gap-3">
            <span className="text-[11px] font-bold text-muted-foreground">{t.nextTrain}</span>
            <span className="tnum text-3xl font-black leading-none tracking-tight text-primary">
              {clock.time ? countdown : "--:--"}
            </span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-track">
            <span
              className="block h-full rounded-full bg-primary transition-[width] duration-1000 ease-linear"
              style={{ width: `${Math.max(2, progress * 100)}%` }}
            />
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
            <span className="text-[10px] text-muted-foreground">{t.following}</span>
            <span className="tnum flex items-center gap-2 text-xs font-bold">
              {arrivals.map((a, i) => (
                <span key={`${a}-${i}`} className={cn(i === 0 ? "text-foreground" : "text-muted-foreground")}>
                  {a}
                </span>
              ))}
            </span>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
            {clock.weekday}
            {clock.date ? ` · ${clock.date}` : ""}
          </span>
          <Link
            href="/stations"
            className="group inline-flex items-center gap-1 font-bold text-foreground transition-colors hover:text-primary"
          >
            {t.note}
          </Link>
        </div>
      </div>
    </div>
  );
}

const TICKER_STATIONS: { fa: string; en: string; line: number }[] = [
  { fa: "تجریش", en: "Tajrish", line: 1 },
  { fa: "قیطریه", en: "Gheytariyeh", line: 1 },
  { fa: "میرداماد", en: "Mirdamad", line: 1 },
  { fa: "شهید بهشتی", en: "Shahid Beheshti", line: 1 },
  { fa: "شهدای هفتم تیر", en: "Haft-e Tir", line: 1 },
  { fa: "دروازه دولت", en: "Darvazeh Dolat", line: 1 },
  { fa: "امام خمینی", en: "Imam Khomeini", line: 1 },
  { fa: "پانزده خرداد", en: "Panzdah-e Khordad", line: 1 },
  { fa: "شهرری", en: "Shahr-e Rey", line: 1 },
  { fa: "کهریزک", en: "Kahrizak", line: 1 },
  { fa: "فرودگاه امام خمینی", en: "IKIA Airport", line: 1 },
  { fa: "فرهنگسرا", en: "Farhangsara", line: 2 },
  { fa: "تهرانپارس", en: "Tehranpars", line: 2 },
  { fa: "دانشگاه علم و صنعت", en: "Elm-o San'at", line: 2 },
  { fa: "امام حسین", en: "Imam Hossein", line: 2 },
  { fa: "دروازه شمیران", en: "Darvazeh Shemiran", line: 2 },
  { fa: "دانشگاه شریف", en: "Sharif University", line: 2 },
  { fa: "صادقیه", en: "Sadeghiyeh", line: 2 },
  { fa: "قائم", en: "Qa'em", line: 3 },
  { fa: "نوبنیاد", en: "Nobonyad", line: 3 },
  { fa: "میدان ولی‌عصر", en: "Vali Asr", line: 3 },
  { fa: "تئاتر شهر", en: "Teatr-e Shahr", line: 3 },
  { fa: "راه‌آهن", en: "Rahahan", line: 3 },
  { fa: "آزادگان", en: "Azadegan", line: 3 },
  { fa: "شهید کلاهدوز", en: "Kolahdooz", line: 4 },
  { fa: "میدان شهدا", en: "Meydan-e Shohada", line: 4 },
  { fa: "میدان انقلاب", en: "Enghelab", line: 4 },
  { fa: "میدان آزادی", en: "Meydan-e Azadi", line: 4 },
  { fa: "ارم سبز", en: "Eram-e Sabz", line: 4 },
  { fa: "کرج", en: "Karaj", line: 5 },
  { fa: "گلشهر", en: "Golshahr", line: 5 },
  { fa: "کوهسار", en: "Kouhsar", line: 6 },
  { fa: "دانشگاه تربیت مدرس", en: "Tarbiat Modarres", line: 6 },
  { fa: "حرم حضرت عبدالعظیم", en: "Haram-e Abdol Azim", line: 6 },
  { fa: "میدان کتاب", en: "Meydan-e Ketab", line: 7 },
  { fa: "برج میلاد", en: "Milad Tower", line: 7 },
  { fa: "میدان صنعت", en: "Meydan-e San'at", line: 7 },
  { fa: "ورزشگاه تختی", en: "Takhti", line: 7 },
];

function Ticker() {
  const { lang } = useMetro();
  const isFa = lang === "fa";
  const copy = (
    <div className="flex shrink-0 items-center gap-6 pe-6 sm:gap-8 sm:pe-8">
      {TICKER_STATIONS.map((s) => (
        <span key={s.en} className="flex items-center gap-6 whitespace-nowrap sm:gap-8">
          <span className="h-1.5 w-1.5 rounded-full bg-primary/70" aria-hidden />
          <span className="flex items-center gap-1.5 text-xs font-medium">
            <span>{isFa ? s.fa : s.en}</span>
            <span className="tnum rounded bg-muted px-1 text-[10px] font-bold text-muted-foreground">
              {isFa ? `خط ${persianDigits(s.line, lang)}` : `L${s.line}`}
            </span>
          </span>
        </span>
      ))}
    </div>
  );
  return (
    <div
      className="ticker-host mask-fade-x relative overflow-hidden border-y border-border bg-muted/30 py-2.5"
      title={isFa ? "برای توقف ماوس را نگه دارید" : "Hover or tap to pause"}
    >
      <div className="ticker-track" aria-hidden>
        {copy}
        {copy}
      </div>
    </div>
  );
}

export function Hero() {
  const { lang } = useMetro();
  const t = WELCOME_CONTENT[lang].hero;
  const isFa = lang === "fa";
  const stationCount = getAllStations().length;
  const lineCount = LINES.length;
  const interchangeCount = getAllStations().filter((s) => isInterchange(s.id)).length;

  return (
    <section className="relative overflow-hidden" id="hero">
      <div className="bg-blueprint mask-fade-b pointer-events-none absolute inset-0" aria-hidden />
      <div
        className="bg-hatch pointer-events-none absolute -top-24 end-0 h-64 w-64 rounded-lg opacity-70 sm:w-80"
        aria-hidden
      />

      <div className="relative mx-auto w-full max-w-6xl px-4 pb-10 pt-10 sm:px-6 sm:pb-14 sm:pt-16">
        <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-7">
            <Reveal>
              <span className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg border border-border bg-card px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 font-bold text-primary">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary soft-pulse" aria-hidden />
                  {t.eyebrow}
                </span>
                <span className="text-border" aria-hidden>
                  |
                </span>
                <span>{t.city}</span>
                <span className="text-border" aria-hidden>
                  ·
                </span>
                <span className="tnum">
                  {isFa
                    ? `${persianDigits(stationCount, lang)} ایستگاه · ${persianDigits(lineCount, lang)} خط`
                    : `${stationCount} stations · ${lineCount} lines`}
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
              <p className="mt-5 max-w-xl text-base leading-8 text-muted-foreground sm:text-lg sm:leading-9">
                {t.sub}
              </p>
            </Reveal>

            <Reveal delay={210}>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/"
                  className="group inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-sm font-bold text-primary-foreground shadow-[0_10px_28px_-14px_var(--primary)] transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
                >
                  {t.ctaPrimary}
                  <ArrowIcon className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" />
                </Link>
                <Link
                  href="/map"
                  className="group inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-border bg-card px-6 text-sm font-bold transition-all duration-200 hover:border-foreground hover:bg-muted active:scale-[0.98]"
                >
                  <MapIcon className="h-4 w-4 text-primary transition-transform duration-300 group-hover:scale-110" />
                  {t.ctaSecondary}
                </Link>
              </div>
            </Reveal>

            <Reveal delay={270}>
              <p className="mt-5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
                {t.trust.map((item, i) => (
                  <span key={item} className="inline-flex items-center gap-2.5">
                    {i > 0 && (
                      <span className="text-primary/60" aria-hidden>
                        ·
                      </span>
                    )}
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
                  { v: persianDigits(interchangeCount, lang), l: isFa ? "تقاطع" : "interchanges" },
                ].map((s) => (
                  <div
                    key={s.l}
                    className="group flex-1 bg-card px-4 py-3 transition-colors duration-300 hover:bg-muted sm:px-6"
                  >
                    <dt className="tnum text-2xl font-black leading-none tracking-tight transition-colors duration-300 group-hover:text-primary sm:text-3xl">
                      {s.v}
                    </dt>
                    <dd className="mt-1.5 text-[11px] text-muted-foreground">{s.l}</dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          </div>

          <div className="lg:col-span-5">
            <Reveal delay={180} className="lg:ms-auto lg:max-w-sm">
              <div className="drift-y">
                <RoutePanel />
              </div>
              <p className="mt-3 text-center text-[11px] text-muted-foreground">
                {isFa
                  ? "نمایش واقعی زمان‌بندی — همین حالا در تهران"
                  : "Real timetable, right now in Tehran"}
              </p>
            </Reveal>
          </div>
        </div>
      </div>

      <Ticker />
    </section>
  );
}
