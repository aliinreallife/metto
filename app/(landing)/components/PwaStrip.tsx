"use client";

import { useEffect, useState, type ReactElement } from "react";
import Link from "next/link";
import { useMetro } from "@/app/providers";
import { WELCOME_CONTENT } from "../content";
import { cn } from "@/lib/utils";
import { Reveal } from "./Reveal";
import {
  ArrowIcon,
  BagIcon,
  CheckIcon,
  DownloadIcon,
  OfflineIcon,
  PhoneIcon,
  PlayIcon,
  StoreIcon,
  TrainIcon,
} from "./Icons";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

const INSTALL_TARGETS = {
  twa: "https://github.com/aliinreallife/metto/releases/latest/download/metto.apk",
  myket: "https://myket.ir/app/ir.metto.app",
} as const;

/* ------------------------------------------------------------------ */
/* Slim install section: headline + PWA install + all four store slots */
/* ------------------------------------------------------------------ */

export function PwaStrip() {
  const { lang } = useMetro();
  const t = WELCOME_CONTENT[lang].pwa;
  const heroCta = WELCOME_CONTENT[lang].hero.ctaPrimary;
  const isFa = lang === "fa";
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setInstallEvent(null);
  };

  const stores: {
    key: string;
    title: string;
    note: string;
    Icon: (p: { className?: string }) => ReactElement;
    href?: string;
    disabled?: boolean;
    primary?: boolean;
  }[] = [
    {
      key: "twa",
      title: t.twa,
      note: t.twaNote,
      Icon: (p) => <DownloadIcon {...p} />,
      href: INSTALL_TARGETS.twa,
      primary: true,
    },
    { key: "myket", title: t.myket, note: t.myketNote, Icon: (p) => <BagIcon {...p} />, href: INSTALL_TARGETS.myket },
    { key: "bazar", title: t.bazar, note: t.bazarNote, Icon: (p) => <StoreIcon {...p} />, disabled: true },
    { key: "play", title: t.play, note: t.playNote, Icon: (p) => <PlayIcon {...p} />, disabled: true },
  ];

  return (
    <section id="install" className="relative overflow-hidden border-t border-border bg-foreground py-16 text-background sm:py-20">
      <div className="relative mx-auto w-full max-w-6xl px-4 sm:px-6">
        <Reveal>
          <span className="inline-flex items-center gap-2 rounded-lg border border-background/25 px-2.5 py-1 text-[11px] font-bold">
            <OfflineIcon className="h-3.5 w-3.5 text-primary" />
            {t.eyebrow}
          </span>
          <h2 className="mt-4 max-w-2xl text-[clamp(1.8rem,4.6vw,2.9rem)] font-black leading-[1.15] tracking-tight">
            {t.title}
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-8 text-background/85 sm:text-base">{t.desc}</p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={install}
              disabled={!installEvent && !installed}
              className={cn(
                "group inline-flex h-12 items-center gap-2 rounded-lg px-6 text-sm font-bold transition-all duration-200",
                installEvent
                  ? "bg-primary text-primary-foreground hover:brightness-110 active:scale-[0.98]"
                  : "cursor-default border border-background/30 text-background/80",
              )}
            >
              {installed ? <CheckIcon className="h-4 w-4" /> : <PhoneIcon className="h-4 w-4" />}
              {installed ? t.installed : t.install}
            </button>
            <Link
              href="/route"
              className="inline-flex h-12 items-center gap-2 rounded-lg border border-background/30 px-5 text-sm font-bold transition-colors duration-200 hover:bg-background hover:text-foreground"
            >
              <TrainIcon className="h-4 w-4" />
              {heroCta}
            </Link>
          </div>
          <p className="mt-2.5 text-[11px] text-background/60">{t.note}</p>
        </Reveal>

        <Reveal delay={60}>
          <div className="mt-10">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-base font-black tracking-tight">{t.storesTitle}</h3>
              <p className="text-[11px] text-background/60">{t.storesSubtitle}</p>
            </div>

            <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
              {stores.map(({ key, title, note, Icon, href, disabled, primary }) => {
                const inner = (
                  <>
                    <span
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors duration-200",
                        disabled
                          ? "border-background/10 text-background/35"
                          : primary
                            ? "border-primary/50 bg-primary text-primary-foreground"
                            : "border-background/25 text-background group-hover:border-background/50",
                      )}
                      aria-hidden
                    >
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-bold">{title}</span>
                      <span className={cn("text-[11px]", disabled ? "text-background/45" : "text-background/65")}>
                        {note}
                      </span>
                    </span>
                    {disabled ? (
                      <span className="shrink-0 rounded-md border border-background/15 px-1.5 py-0.5 text-[10px] font-bold text-background/50">
                        {isFa ? "به‌زودی" : "soon"}
                      </span>
                    ) : (
                      <ArrowIcon className="h-4 w-4 shrink-0 text-background/50 transition-all duration-300 group-hover:translate-x-1 group-hover:text-background rtl:rotate-180 rtl:group-hover:-translate-x-1" />
                    )}
                  </>
                );
                const cls = cn(
                  "group flex items-center gap-3 rounded-lg border px-3.5 py-3 text-start transition-all duration-200",
                  disabled
                    ? "cursor-not-allowed border-dashed border-background/15 text-background/55"
                    : "border-background/20 bg-background/[0.07] hover:-translate-y-0.5 hover:border-background/45 hover:bg-background/[0.13] active:scale-[0.99]",
                );
                return (
                  <li key={key}>
                    {disabled || !href ? (
                      <span className={cls} aria-disabled>
                        {inner}
                      </span>
                    ) : (
                      <a href={href} target="_blank" rel="noreferrer noopener" className={cls}>
                        {inner}
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
