"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useMetro } from "@/app/providers";
import { WELCOME_CONTENT } from "../content";
import { persianDigits } from "@/lib/i18n";
import { Reveal } from "./Reveal";

export function HowItWorks() {
  const { lang } = useMetro();
  const t = WELCOME_CONTENT[lang].steps;
  const isFa = lang === "fa";

  return (
    <section id="how" className="relative overflow-hidden border-y border-border bg-muted/25 py-16 sm:py-24">
      <div className="relative mx-auto w-full max-w-6xl px-4 sm:px-6">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="text-[11px] font-bold tracking-widest text-primary uppercase">{t.eyebrow}</span>
              <h2 className="mt-2 text-[clamp(1.7rem,4vw,2.6rem)] font-black leading-tight tracking-tight">{t.title}</h2>
            </div>
            <Link
              href="/"
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-border bg-card px-5 text-sm font-bold transition hover:border-primary hover:text-primary active:scale-[0.98]"
            >
              {t.cta}
              {isFa ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
            </Link>
          </div>
        </Reveal>

        <Reveal delay={90}>
          <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
            {t.items.map((step, i) => (
              <li key={step.title} className="relative flex gap-4 md:block">
                <span
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border-2 border-primary bg-background text-lg font-black tabular-nums text-primary"
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
