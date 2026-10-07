"use client";

import Link from "next/link";
import { useMetro } from "@/app/providers";
import { WELCOME_CONTENT } from "../content";
import { persianDigits } from "@/lib/i18n";
import { Reveal } from "./Reveal";
import { ArrowIcon, TrainIcon } from "./Icons";

export function HowItWorks() {
  const { lang } = useMetro();
  const t = WELCOME_CONTENT[lang].steps;

  return (
    <section id="how" className="relative overflow-hidden border-y border-border bg-muted/25 py-16 sm:py-24">
      <div className="bg-hatch pointer-events-none absolute inset-y-0 start-0 w-24 opacity-60" aria-hidden />
      <div className="relative mx-auto w-full max-w-6xl px-4 sm:px-6">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="text-[11px] font-bold tracking-widest text-primary uppercase">{t.eyebrow}</span>
              <h2 className="mt-2 text-[clamp(1.7rem,4vw,2.6rem)] font-black leading-tight tracking-tight">{t.title}</h2>
            </div>
            <Link
              href="/route"
              className="group inline-flex h-11 items-center gap-2 rounded-lg border border-border bg-card px-5 text-sm font-bold transition-all duration-200 hover:border-primary hover:text-primary active:scale-[0.98]"
            >
              {t.cta}
              <ArrowIcon className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" />
            </Link>
          </div>
        </Reveal>

        <Reveal delay={90}>
          <ol className="relative mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
            <span
              className="absolute start-[27px] top-6 bottom-6 w-[2px] bg-track md:hidden"
              aria-hidden
            />
            <span
              className="absolute top-[27px] hidden md:block"
              style={{ insetInlineStart: "28px", insetInlineEnd: "28px" }}
              aria-hidden
            >
              <span className="block h-[2px] w-full bg-track" />
              <span className="run-rail absolute -top-[9px] flex h-5 w-5 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <TrainIcon className="h-3.5 w-3.5" />
              </span>
            </span>

            {t.items.map((step, i) => (
              <li key={step.title} className="relative flex gap-4 md:block">
                <span
                  className="tnum relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border-2 border-primary bg-background text-lg font-black text-primary transition-transform duration-300 hover:scale-105"
                  aria-hidden
                >
                  {persianDigits(i + 1, lang)}
                </span>
                <div className="min-w-0 md:mt-5">
                  <h3 className="text-base font-extrabold leading-7 tracking-tight sm:text-lg">{step.title}</h3>
                  <p className="mt-1.5 text-sm leading-7 text-muted-foreground">{step.desc}</p>
                  <span className="mt-3 block h-[3px] w-10 rounded-full bg-primary/40" aria-hidden />
                </div>
              </li>
            ))}
          </ol>
        </Reveal>
      </div>
    </section>
  );
}
