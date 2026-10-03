"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useMetro } from "@/app/providers";
import { WELCOME_CONTENT } from "../content";
import { persianDigits } from "@/lib/i18n";
import { ROUTES } from "@/lib/metro/routes";
import { getStation } from "@/lib/metro/selectors";
import { cn } from "@/lib/utils";
import { Reveal } from "./Reveal";
import { TehranMap } from "./TehranMap";
import { useTehranClock } from "./tehran-clock";
import {
  AtmIcon,
  ClockIcon,
  ElevatorIcon,
  MapIcon,
  OfflineIcon,
  PhoneIcon,
  PinIcon,
  RestroomIcon,
  RouteIcon,
  SearchIcon,
  StationListIcon,
  SwapIcon,
  WifiIcon,
} from "./Icons";

function pad(v: number) {
  return String(v).padStart(2, "0");
}

function clockOf(total: number, lang: "fa" | "en") {
  const w = ((total % 86400) + 86400) % 86400;
  return persianDigits(`${pad(Math.floor(w / 3600))}:${pad(Math.floor((w % 3600) / 60))}`, lang);
}

/* ---------------- card visuals ---------------- */

function PlaceSearchVisual() {
  const { lang } = useMetro();
  const isFa = lang === "fa";
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-2.5 py-2">
        <SearchIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate text-xs font-bold">{isFa ? "ایران‌مال" : "Iran Mall"}</span>
        <span className="ms-auto flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="h-3 w-[2px] animate-pulse bg-primary" aria-hidden />
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2 border-t border-border pt-2 text-[11px]">
        <PinIcon className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="text-muted-foreground">
          {isFa ? "نزدیک‌ترین ایستگاه" : "Nearest station"}
        </span>
        <span className="ms-auto flex items-center gap-1.5">
          <SwapIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="tnum rounded-md border border-border px-1.5 py-0.5 text-[10px] font-bold">
            {isFa ? `خط ${persianDigits(3, lang)}` : "Line 3"}
          </span>
        </span>
      </div>
    </div>
  );
}

const SERVICE_DAYS = [
  { key: "weekday", headway: 360, fa: "روز کاری", en: "Weekday" },
  { key: "thursday", headway: 480, fa: "پنجشنبه", en: "Thursday" },
  { key: "friday", headway: 600, fa: "جمعه و تعطیلات", en: "Friday & holidays" },
] as const;

function TimetableVisual() {
  const { lang } = useMetro();
  const isFa = lang === "fa";
  const clock = useTehranClock();
  const [day, setDay] = useState<(typeof SERVICE_DAYS)[number]["key"]>("weekday");
  const headway = SERVICE_DAYS.find((d) => d.key === day)!.headway;
  const base = clock.seconds - (clock.seconds % headway);
  const departures = [1, 2, 3, 4].map((k) => clockOf(base + k * headway, lang));

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex gap-1" role="tablist" aria-label="service">
        {SERVICE_DAYS.map((d) => (
          <button
            key={d.key}
            role="tab"
            type="button"
            aria-selected={day === d.key}
            onClick={() => setDay(d.key)}
            className={cn(
              "flex-1 rounded-md border px-1.5 py-1 text-[10px] font-bold transition-all duration-200",
              day === d.key
                ? "border-primary bg-primary-wash text-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {isFa ? d.fa : d.en}
          </button>
        ))}
      </div>
      <div className="tnum mt-2.5 grid grid-cols-4 gap-1.5">
        {departures.map((d, i) => (
          <span
            key={d}
            className={cn(
              "rounded-md border py-1.5 text-center text-[11px] font-bold transition-colors duration-300",
              i === 0 ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground",
            )}
          >
            {d}
          </span>
        ))}
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <ClockIcon className="h-3 w-3" />
        {isFa
          ? `هر ${persianDigits(Math.round(headway / 60), lang)} دقیقه · خط ۵ تندرو`
          : `Every ${Math.round(headway / 60)} min · Line 5 express`}
      </p>
    </div>
  );
}

function lineStations(lineId: number) {
  const routes = ROUTES.filter((r) => r.lineId === lineId);
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const r of routes) {
    for (const stop of r.stops) {
      if (seen.has(stop.stationId)) continue;
      seen.add(stop.stationId);
      ordered.push(stop.stationId);
    }
  }
  return ordered;
}

function StationListVisual() {
  const { lang } = useMetro();
  const isFa = lang === "fa";
  const [line, setLine] = useState(1);
  const ids = useMemo(() => lineStations(line), [line]);
  const list = ids.slice(0, 4);
  const total = ids.length;

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="tnum flex flex-wrap gap-1">
        {[1, 2, 3, 4, 5, 6, 7].map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLine(l)}
            aria-pressed={line === l}
            className={cn(
              "h-6 w-6 rounded-md border text-[10px] font-bold transition-all duration-200 active:scale-90",
              line === l
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:border-foreground hover:text-foreground",
            )}
          >
            {persianDigits(l, lang)}
          </button>
        ))}
      </div>
      <ul className="mt-2.5 space-y-1 border-t border-border pt-2">
        {list.map((id, i) => {
          const s = getStation(id);
          if (!s) return null;
          return (
            <li key={id} className="flex items-center gap-2 text-[11px]">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
              <span className="truncate font-medium">{isFa ? s.name.fa : s.name.en}</span>
              <span className="tnum ms-auto text-[10px] text-muted-foreground">
                {clockOf(6 * 3600 + 42 * 60 + i * 6 * 60, lang)}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="tnum mt-2 text-[10px] text-muted-foreground">
        {isFa ? `+ ${persianDigits(total - list.length, lang)} ایستگاه دیگر` : `+ ${total - list.length} more stations`}
      </p>
    </div>
  );
}

function MapVisual() {
  return <TehranMap />;
}

function NearMeVisual() {
  const { lang } = useMetro();
  const isFa = lang === "fa";
  const amenities = [
    { Icon: RestroomIcon, fa: "سرویس بهداشتی", en: "Restroom" },
    { Icon: ElevatorIcon, fa: "آسانسور", en: "Elevator" },
    { Icon: AtmIcon, fa: "عابربانک", en: "ATM" },
    { Icon: WifiIcon, fa: "وای‌فای", en: "Wi-Fi" },
  ];
  const nearest = [
    { s: getStation("shahid-beheshti"), m: 320 },
    { s: getStation("mosalla-ye-imam-khomeini"), m: 780 },
  ].filter((x): x is { s: NonNullable<ReturnType<typeof getStation>>; m: number } => Boolean(x.s));

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="grid grid-cols-4 gap-1.5">
        {amenities.map(({ Icon, fa, en }) => (
          <span
            key={en}
            className="group/am flex flex-col items-center gap-1 rounded-md border border-border py-2 text-muted-foreground transition-colors duration-200 hover:border-primary hover:text-primary"
          >
            <Icon className="h-4 w-4" />
            <span className="px-1 text-center text-[9px] leading-tight">{isFa ? fa : en}</span>
          </span>
        ))}
      </div>
      <ul className="mt-2.5 space-y-1 border-t border-border pt-2">
        {nearest.map(({ s, m }) => (
          <li key={s.id} className="flex items-center gap-2 text-[11px]">
            <PinIcon className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="truncate font-medium">{isFa ? s.name.fa : s.name.en}</span>
            <span className="tnum ms-auto shrink-0 text-[10px] text-muted-foreground">
              {isFa ? `${persianDigits(m, lang)} متر` : `${m} m`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OfflineVisual() {
  const { lang } = useMetro();
  const isFa = lang === "fa";
  const clock = useTehranClock();

  const chips = [
    isFa ? "بدون نصب" : "No install",
    isFa ? "آفلاین" : "Offline",
    isFa ? "تاریخ شمسی" : "Jalali dates",
  ];

  return (
    <div className="rounded-lg border border-border bg-background p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
        <span className="relative flex h-14 w-11 shrink-0 items-center justify-center self-start rounded-lg border-2 border-foreground/80">
          <OfflineIcon className="h-5 w-5 text-primary" />
          <span className="absolute -top-[3px] h-[2px] w-4 rounded-full bg-foreground/80" aria-hidden />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-sm font-extrabold leading-6 tracking-tight">
            {isFa ? "همین سایت، بدون نصب" : "This very site, nothing to install"}
          </span>
          <span className="mt-1 block text-xs leading-6 text-muted-foreground">
            {isFa
              ? "همین صفحه در مرورگر باز می‌شود؛ بار اول که آنلاین بیایی، پوسته و داده ایستگاه‌ها ذخیره می‌شوند."
              : "This page opens in your browser; the first time you are online, the shell and station data are saved."}
          </span>
        </span>

        <span className="flex shrink-0 flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <span
              key={chip}
              className="rounded-md border border-border bg-muted/50 px-2 py-1 text-[10px] font-bold text-muted-foreground"
            >
              {chip}
            </span>
          ))}
          <span className="tnum inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary-wash px-2 py-1 text-[10px] font-bold text-primary">
            <PhoneIcon className="h-3 w-3" />
            {clock.date || (isFa ? "امروز" : "today")}
          </span>
        </span>
      </div>
    </div>
  );
}

/* ---------------- cards ---------------- */

type Card = {
  icon: (p: { className?: string }) => ReactNode;
  visual: () => ReactNode;
  span: string;
};

const CARDS: Card[] = [
  { icon: (p) => <RouteIcon {...p} />, visual: PlaceSearchVisual, span: "md:col-span-1 lg:col-span-7" },
  { icon: (p) => <ClockIcon {...p} />, visual: TimetableVisual, span: "md:col-span-1 lg:col-span-5" },
  { icon: (p) => <StationListIcon {...p} />, visual: StationListVisual, span: "md:col-span-1 lg:col-span-5" },
  { icon: (p) => <PinIcon {...p} />, visual: NearMeVisual, span: "md:col-span-1 lg:col-span-7" },
  { icon: (p) => <OfflineIcon {...p} />, visual: OfflineVisual, span: "md:col-span-2 lg:col-span-12" },
  { icon: (p) => <MapIcon {...p} />, visual: MapVisual, span: "md:col-span-2 lg:col-span-12" },
];

export function Features() {
  const { lang } = useMetro();
  const t = WELCOME_CONTENT[lang].features;

  return (
    <section id="features" className="relative py-16 sm:py-24">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <Reveal>
          <div className="max-w-2xl">
            <span className="text-[11px] font-bold tracking-widest text-primary uppercase">
              {t.eyebrow}
            </span>
            <h2 className="mt-2 text-[clamp(1.7rem,4vw,2.6rem)] font-black leading-tight tracking-tight">
              {t.title}
            </h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground sm:text-base">{t.desc}</p>
          </div>
        </Reveal>

        <div className="mt-9 grid gap-4 md:grid-cols-2 lg:grid-cols-12">
          {t.items.map((item, i) => {
            const card = CARDS[i];
            if (!card) return null;
            const Icon = card.icon;
            const Visual = card.visual;
            return (
              <Reveal
                key={item.title}
                delay={i * 60}
                className={cn("h-full", card.span)}
              >
                <article className="group lift relative flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card p-5 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_28px_50px_-32px_rgba(0,0,0,0.45)]">
                  <span
                    className="absolute inset-x-0 top-0 h-[2px] origin-start scale-x-0 bg-primary transition-transform duration-500 group-hover:scale-x-100"
                    aria-hidden
                  />
                  <div className="flex items-start justify-between gap-3">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background text-primary transition-colors duration-300 group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="tnum latin text-xs font-bold text-muted-foreground/80">{item.tag}</span>
                  </div>

                  <h3 className="mt-4 text-lg font-extrabold leading-snug tracking-tight">{item.title}</h3>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">{item.desc}</p>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {item.chips.map((chip) => (
                      <span
                        key={chip}
                        className="rounded-md border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-bold text-muted-foreground transition-colors duration-300 group-hover:border-border"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>

                  <div className="mt-auto pt-5">
                    <Visual />
                  </div>
                </article>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
