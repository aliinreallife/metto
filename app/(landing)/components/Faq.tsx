"use client";

import { useId, useState } from "react";
import { useMetro } from "@/app/providers";
import { WELCOME_CONTENT } from "../content";
import { persianDigits } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Reveal } from "./Reveal";
import { ArrowIcon, GithubIcon } from "./Icons";

export function Faq() {
  const { lang } = useMetro();
  const t = WELCOME_CONTENT[lang].faq;
  const baseId = useId();
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="py-16 sm:py-24">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 sm:px-6 lg:grid-cols-12 lg:gap-12">
        <Reveal className="lg:col-span-4">
          <div className="lg:sticky lg:top-28">
            <span className="text-[11px] font-bold tracking-widest text-primary uppercase">{t.eyebrow}</span>
            <h2 className="mt-2 text-[clamp(1.7rem,4vw,2.4rem)] font-black leading-tight tracking-tight">{t.title}</h2>
            <div className="mt-6 rounded-lg border border-border bg-card p-4">
              <p className="text-sm font-bold">{t.more}</p>
              <a
                href="https://github.com/aliinreallife/metto/issues/new"
                target="_blank"
                rel="noreferrer noopener"
                className="group mt-3 inline-flex items-center gap-2 text-xs font-bold text-primary transition-colors hover:text-foreground"
              >
                <GithubIcon className="h-4 w-4" />
                {t.ask}
                <ArrowIcon className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" />
              </a>
            </div>
          </div>
        </Reveal>

        <div className="lg:col-span-8">
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {t.items.map((item, i) => {
              const expanded = open === i;
              const qId = `${baseId}-q-${i}`;
              const aId = `${baseId}-a-${i}`;
              return (
                <li key={item.q}>
                  <Reveal delay={i * 50}>
                    <h3>
                      <button
                        type="button"
                        id={qId}
                        aria-expanded={expanded}
                        aria-controls={aId}
                        onClick={() => setOpen(expanded ? null : i)}
                        className="group flex w-full items-start gap-4 px-4 py-4 text-start transition-colors duration-200 hover:bg-muted/50 sm:px-5 sm:py-5"
                      >
                        <span className={cn("tnum latin mt-0.5 shrink-0 text-[11px] font-bold transition-colors duration-200", expanded ? "text-primary" : "text-muted-foreground group-hover:text-primary")}>
                          {persianDigits(`0${i + 1}`, lang)}
                        </span>
                        <span className={cn("flex-1 text-[15px] font-extrabold leading-7 tracking-tight transition-colors duration-200 sm:text-base", expanded && "text-primary")}>
                          {item.q}
                        </span>
                      <span className={cn("relative mt-1 h-4 w-4 shrink-0 transition-transform duration-300", expanded && "rotate-45")} aria-hidden>
                        <span className="absolute top-1/2 h-[2px] w-4 -translate-y-1/2 rounded-full bg-current" />
                        <span className="absolute start-1/2 h-4 w-[2px] -translate-x-1/2 rounded-full bg-current" />
                      </span>
                    </button>
                    </h3>
                    <div
                      id={aId}
                      role="region"
                      aria-labelledby={qId}
                      className={cn("grid transition-[grid-template-rows,opacity] duration-300 ease-out", expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}
                    >
                      <div className="overflow-hidden">
                        <p className="px-4 pb-5 text-sm leading-8 text-muted-foreground sm:px-5">
                          <span className="block sm:ms-[2.7rem]">{item.a}</span>
                        </p>
                      </div>
                    </div>
                    </Reveal>
                  </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
