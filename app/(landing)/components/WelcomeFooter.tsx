"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Heart, Star, TrainFront } from "lucide-react";
import { useMetro } from "@/app/providers";
import { WELCOME_CONTENT, WELCOME_NAV } from "../content";
import { persianDigits } from "@/lib/i18n";
import { getAllStations } from "@/lib/metro/selectors";
import { LINES } from "@/lib/metro/lines";

const AUTHOR_URL = "https://github.com/aliinreallife";
const DATA_URL = "https://github.com/mostafa-kheibary/tehran-metro-data";
const REPO_URL = "https://github.com/aliinreallife/metto";

export function WelcomeFooter() {
  const { lang } = useMetro();
  const t = WELCOME_CONTENT[lang].footer;
  const heroCta = WELCOME_CONTENT[lang].hero.ctaPrimary;
  const donateCta = WELCOME_CONTENT[lang].donate.eyebrow;
  const isFa = lang === "fa";
  const stations = getAllStations().length;
  const lines = LINES.length;

  return (
    <footer className="border-t border-border bg-muted/25">
      <div className="relative mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="grid gap-10 md:grid-cols-12">
          <div className="md:col-span-5">
            <span className="inline-flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground" aria-hidden>
                <TrainFront className="h-5 w-5" />
              </span>
              <span className="flex flex-col leading-none">
                <span className="text-base font-extrabold tracking-tight">{isFa ? "متو | metto" : "metto | متو"}</span>
                <span className="mt-1 text-[11px] text-muted-foreground">
                  {isFa ? "نقشه و مسیریابی مترو" : "Metro map & route planner"}
                </span>
              </span>
            </span>

            <p className="mt-5 max-w-sm text-sm leading-7 text-muted-foreground">{t.tagline}</p>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Link
                href="/route"
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground transition hover:brightness-110 active:scale-[0.98]"
              >
                {heroCta}
                {isFa ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
              </Link>
              <a
                href={REPO_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-bold transition hover:border-primary hover:text-primary"
              >
                <Star className="h-4 w-4" />
                {t.github}
              </a>
              <a
                href="#donate"
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 text-sm font-bold text-foreground transition hover:bg-primary hover:text-primary-foreground"
              >
                <Heart className="h-4 w-4" />
                {donateCta}
              </a>
            </div>
          </div>

          <nav className="md:col-span-3" aria-label={t.linksTitle}>
            <h2 className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">{t.linksTitle}</h2>
            <ul className="mt-4 space-y-2.5">
              {WELCOME_NAV.map((item) => (
                <li key={item.key}>
                  <Link href={item.href} className="text-sm font-medium transition-colors hover:text-primary">
                    {item.key === "route" && (isFa ? "مسیر" : "Route")}
                    {item.key === "stations" && (isFa ? "ایستگاه‌ها" : "Stations")}
                    {item.key === "nearby" && (isFa ? "نزدیک من" : "Nearby")}
                    {item.key === "map" && (isFa ? "نقشه" : "Map")}
                  </Link>
                </li>
              ))}
              <li>
                <a href="#donate" className="text-sm font-medium transition-colors hover:text-primary">
                  {donateCta}
                </a>
              </li>
            </ul>
          </nav>

          <div className="md:col-span-4">
            <h2 className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">
              {isFa ? "اعتبارها" : "Credits"}
            </h2>
            <p className="mt-4 text-sm leading-8 text-muted-foreground">
              {t.madeBy}{" "}
              <a href={AUTHOR_URL} target="_blank" rel="noreferrer noopener" className="font-bold text-foreground underline decoration-primary decoration-2 underline-offset-4 hover:text-primary">
                aliinreallife
              </a>
              <span className="mx-2 text-border">·</span>
              {t.dataSource}{" "}
              <a href={DATA_URL} target="_blank" rel="noreferrer noopener" className="font-bold text-foreground underline decoration-primary decoration-2 underline-offset-4 hover:text-primary">
                mostafa-kheibary
              </a>
            </p>

            <ul className="mt-5 space-y-2 border-t border-border pt-5 text-[11px] text-muted-foreground">
              <li className="tabular-nums">
                {persianDigits(`${stations} ایستگاه · ${lines} خط`, lang)}
              </li>
              <li>{t.cityNote}</li>
              <li>{t.rights}</li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col-reverse items-start justify-between gap-3 border-t border-border pt-6 text-[11px] text-muted-foreground sm:flex-row sm:items-center">
          <p>© {persianDigits(new Date().getFullYear(), lang)} metto.ir</p>
          <Link href="/route" className="inline-flex items-center gap-1.5 font-bold transition-colors hover:text-primary">
            {heroCta}
            {isFa ? <ArrowLeft className="h-3 w-3" /> : <ArrowRight className="h-3 w-3" />}
          </Link>
        </div>
      </div>
    </footer>
  );
}
