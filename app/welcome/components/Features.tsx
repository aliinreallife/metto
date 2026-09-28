"use client";

import Link from "next/link";
import { Clock3, LocateFixed, Map as MapIcon, Search, TrainFront, WifiOff } from "lucide-react";
import { useMetro } from "@/app/providers";
import { WELCOME_CONTENT } from "../content";
import { persianDigits } from "@/lib/i18n";
import { getAllStations } from "@/lib/metro/selectors";
import { LINES } from "@/lib/metro/lines";
import { cn } from "@/lib/utils";
import { Reveal } from "./Reveal";

const ICONS = [Search, Clock3, TrainFront, MapIcon, LocateFixed, WifiOff];
const HREFS = ["/", "/", "/stations", "/map", "/nearby", "/"];

export function Features() {
  const { lang } = useMetro();
  const t = WELCOME_CONTENT[lang].features;
  const stationCount = getAllStations().length;
  const lineCount = LINES.length;

  return (
    <section id="features" className="relative py-16 sm:py-24">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <Reveal>
          <div className="max-w-2xl">
            <span className="text-[11px] font-bold tracking-widest text-primary uppercase">{t.eyebrow}</span>
            <h2 className="mt-2 text-[clamp(1.7rem,4vw,2.6rem)] font-black leading-tight tracking-tight">{t.title}</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground sm:text-base">
              {t.desc}{" "}
              <span className="tabular-nums">
                {persianDigits(`${stationCount} ایستگاه`, lang)} · {persianDigits(`${lineCount} خط`, lang)}
              </span>
            </p>
          </div>
        </Reveal>

        <div className="mt-9 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {t.items.map((item, i) => {
            const Icon = ICONS[i % ICONS.length];
            const href = HREFS[i % HREFS.length];
            return (
              <Reveal key={item.title} delay={i * 60} className="h-full">
                <Link
                  href={href}
                  className={cn(
                    "group relative flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card p-5",
                    "transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg",
                  )}
                >
                  <span className="absolute inset-x-0 top-0 h-[2px] origin-start scale-x-0 bg-primary transition-transform duration-500 group-hover:scale-x-100" aria-hidden />
                  <div className="flex items-start justify-between gap-3">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background text-primary transition-colors group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="text-xs font-bold tabular-nums text-muted-foreground/80">
                      {persianDigits(String(i + 1).padStart(2, "0"), lang)}
                    </span>
                  </div>
                  <h3 className="mt-4 text-lg font-extrabold leading-snug tracking-tight">{item.title}</h3>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">{item.desc}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {item.chips.map((chip) => (
                      <span
                        key={chip}
                        className="rounded-md border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-bold text-muted-foreground"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                </Link>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
