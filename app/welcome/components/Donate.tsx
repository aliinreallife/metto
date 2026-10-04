"use client";

import { useMetro } from "@/app/providers";
import { WELCOME_CONTENT } from "../content";
import { Reveal } from "./Reveal";
import { ArrowIcon, CheckIcon, HeartIcon, StarIcon } from "./Icons";

const SPONSORS_URL = "https://github.com/sponsors/aliinreallife";
const REPO_URL = "https://github.com/aliinreallife/metto";
const ISSUE_URL = "https://github.com/aliinreallife/metto/issues/new";

/** Title like «رایگان. بدون تبلیغ. برای همیشه.» — each clause on its own line, red full stop. */
function Lines({ text }: { text: string }) {
  const parts = text
    .split(". ")
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <>
      {parts.map((part, i) => (
        <span key={part} className="block">
          {part.replace(/\.$/, "")}
          {(i < parts.length - 1 || text.endsWith(".")) && (
            <span className="latin text-primary" aria-hidden>
              .
            </span>
          )}
        </span>
      ))}
    </>
  );
}

/** A fake banner ad, crossed out — because it will never exist here. */
function CrossedAd() {
  const { lang } = useMetro();
  const t = WELCOME_CONTENT[lang].donate;

  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between text-[10px] font-bold">
        <span className="text-muted-foreground">{t.slotLabel}</span>
        <span className="relative rounded-md border border-border px-1.5 py-0.5 text-muted-foreground">
          {t.adBadge}
          <span
            className="absolute -inset-x-1 top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-primary"
            aria-hidden
          />
        </span>
      </div>

      <div className="relative mt-3 overflow-hidden rounded-lg border border-dashed border-border bg-muted/40 p-4">
        <div className="flex items-center gap-3 opacity-80" aria-hidden>
          <span className="h-14 w-14 shrink-0 rounded-lg bg-track/60" />
          <div className="flex-1 space-y-2.5">
            <span className="block h-2.5 w-3/4 rounded-full bg-track/70" />
            <span className="block h-2.5 w-1/2 rounded-full bg-track/70" />
            <span className="block h-6 w-24 rounded-md bg-track/80" />
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
        <HeartIcon className="heart-beat h-4 w-4 shrink-0 text-primary" />
        {t.thanks}
      </p>
    </div>
  );
}

export function Donate() {
  const { lang } = useMetro();
  const t = WELCOME_CONTENT[lang].donate;

  return (
    <section id="donate" className="border-t border-border py-16 sm:py-24">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-12 lg:gap-12">
        <Reveal className="lg:col-span-7">
          <span className="inline-flex items-center gap-2 text-[11px] font-bold tracking-widest text-primary uppercase">
            <HeartIcon className="heart-beat h-4 w-4" />
            {t.eyebrow}
          </span>

          <h2 className="mt-3 text-[clamp(1.9rem,5vw,3.2rem)] font-black leading-[1.15] tracking-tight">
            <Lines text={t.title} />
          </h2>

          <p className="mt-4 max-w-xl text-sm leading-8 text-muted-foreground sm:text-base">
            {t.desc}
          </p>

          <div className="mt-6">
            <h3 className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
              {t.paysTitle}
            </h3>
            <ul className="mt-3 space-y-2.5">
              {t.pays.map((item) => (
                <li key={item} className="flex items-center gap-2.5 text-sm leading-7">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-wash text-primary">
                    <CheckIcon className="h-3 w-3" />
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
              className="group inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-sm font-bold text-primary-foreground shadow-[0_10px_28px_-14px_var(--primary)] transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
            >
              <HeartIcon className="h-4 w-4 transition-transform duration-300 group-hover:scale-125" />
              {t.primary}
              <ArrowIcon className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" />
            </a>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="group inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-border bg-card px-6 text-sm font-bold transition-all duration-200 hover:border-foreground hover:bg-muted active:scale-[0.98]"
            >
              <StarIcon className="h-4 w-4 text-primary transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12" />
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
                      className="underline decoration-border decoration-1 underline-offset-4 transition-colors hover:text-primary hover:decoration-primary"
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
