"use client";

import { ArrowLeft, ArrowRight, Check, Heart, Star } from "lucide-react";
import { useMetro } from "@/app/providers";
import { WELCOME_CONTENT } from "../content";
import { Reveal } from "./Reveal";

const SPONSORS_URL = "https://github.com/sponsors/aliinreallife";
const REPO_URL = "https://github.com/aliinreallife/metto";
const ISSUE_URL = "https://github.com/aliinreallife/metto/issues/new";

function Lines({ text }: { text: string }) {
  const parts = text
    .split(". ")
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <>
      {parts.map((part) => (
        <span key={part} className="block">
          {part.replace(/\.$/, "")}
          <span className="text-primary" aria-hidden>
            .
          </span>
        </span>
      ))}
    </>
  );
}

function CrossedAd() {
  const { lang } = useMetro();
  const t = WELCOME_CONTENT[lang].donate;

  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between text-[10px] font-bold">
        <span className="text-muted-foreground">{t.slotLabel}</span>
        <span className="relative rounded-md border border-border px-1.5 py-0.5 text-muted-foreground">
          {t.adBadge}
          <span className="absolute -inset-x-1 top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-primary" aria-hidden />
        </span>
      </div>

      <div className="relative mt-3 overflow-hidden rounded-lg border border-dashed border-border bg-muted/40 p-4">
        <div className="flex items-center gap-3 opacity-80" aria-hidden>
          <span className="h-14 w-14 shrink-0 rounded-lg bg-muted" />
          <div className="flex-1 space-y-2.5">
            <span className="block h-2.5 w-3/4 rounded-full bg-muted" />
            <span className="block h-2.5 w-1/2 rounded-full bg-muted" />
            <span className="block h-6 w-24 rounded-md bg-muted" />
          </div>
        </div>
        <div className="absolute inset-0 flex items-center justify-center" aria-hidden>
          <span className="relative flex h-24 w-24 items-center justify-center rounded-full border-[3px] border-primary bg-background/60">
            <span className="absolute h-[3px] w-24 -rotate-45 rounded-full bg-primary" />
          </span>
        </div>
      </div>

      <p className="mt-4 text-sm font-bold leading-7">{t.neverCaption}</p>
      <p className="mt-2 flex items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
        <Heart className="h-4 w-4 shrink-0 animate-pulse text-primary" />
        {t.thanks}
      </p>
    </div>
  );
}

export function Donate() {
  const { lang } = useMetro();
  const t = WELCOME_CONTENT[lang].donate;
  const isFa = lang === "fa";

  return (
    <section id="donate" className="border-t border-border py-16 sm:py-24">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-12 lg:gap-12">
        <Reveal className="lg:col-span-7">
          <span className="inline-flex items-center gap-2 text-[11px] font-bold tracking-widest text-primary uppercase">
            <Heart className="h-4 w-4 animate-pulse" />
            {t.eyebrow}
          </span>

          <h2 className="mt-3 text-[clamp(1.9rem,5vw,3.2rem)] font-black leading-[1.15] tracking-tight">
            <Lines text={t.title} />
          </h2>

          <p className="mt-4 max-w-xl text-sm leading-8 text-muted-foreground sm:text-base">{t.desc}</p>

          <div className="mt-6">
            <h3 className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{t.paysTitle}</h3>
            <ul className="mt-3 space-y-2.5">
              {t.pays.map((item) => (
                <li key={item} className="flex items-center gap-2.5 text-sm leading-7">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Check className="h-3 w-3" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <a
              href={SPONSORS_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-sm font-bold text-primary-foreground transition hover:brightness-110 active:scale-[0.98]"
            >
              <Heart className="h-4 w-4" />
              {t.primary}
              {isFa ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
            </a>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-border bg-card px-6 text-sm font-bold transition hover:border-foreground active:scale-[0.98]"
            >
              <Star className="h-4 w-4 text-primary" />
              {t.secondary}
            </a>
          </div>
          <p className="mt-2.5 text-[11px] text-muted-foreground">{t.primaryNote}</p>

          <div className="mt-7 border-t border-border pt-5">
            <p className="text-xs font-bold text-muted-foreground">{t.altTitle}</p>
            <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              {t.altWays.map((item, i) => (
                <li key={item} className="flex items-center gap-2 text-sm leading-6">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                  {i === 0 ? (
                    item
                  ) : (
                    <a
                      href={ISSUE_URL}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="underline decoration-border underline-offset-4 transition-colors hover:text-primary hover:decoration-primary"
                    >
                      {item}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>

        <Reveal delay={120} className="lg:col-span-5">
          <CrossedAd />
        </Reveal>
      </div>
    </section>
  );
}
