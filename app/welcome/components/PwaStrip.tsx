"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Download, TrainFront, WifiOff } from "lucide-react";
import { useMetro } from "@/app/providers";
import { WELCOME_CONTENT } from "../content";
import { persianDigits } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Reveal } from "./Reveal";

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

  return (
    <section id="install" className="relative overflow-hidden bg-foreground py-16 text-background sm:py-24">
      <div className="relative mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-12">
          <Reveal className="lg:col-span-7">
            <span className="inline-flex items-center gap-2 rounded-lg border border-background/25 px-2.5 py-1 text-[11px] font-bold">
              <WifiOff className="h-3.5 w-3.5 text-primary" />
              {t.eyebrow}
            </span>
            <h2 className="mt-4 max-w-2xl text-[clamp(1.8rem,4.6vw,2.9rem)] font-black leading-[1.15] tracking-tight">
              {t.title}
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-8 text-background/85 sm:text-base">{t.desc}</p>

            <div className="mt-8">
              <h3 className="text-xs font-bold tracking-wide text-background/70">{t.storyTitle}</h3>
              <ol className="mt-3 grid gap-3 sm:grid-cols-3">
                {t.story.map((step, i) => (
                  <li key={step.title} className="relative rounded-lg border border-background/15 bg-background/[0.06] p-3.5">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-[11px] font-black tabular-nums text-primary-foreground">
                      {persianDigits(i + 1, lang)}
                    </span>
                    <span className="mt-2.5 block text-sm font-extrabold leading-6">{step.title}</span>
                    <span className="mt-1 block text-xs leading-6 text-background/75">{step.desc}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-3 flex items-start gap-2 text-[11px] leading-6 text-background/70">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                {t.storyNote}
              </p>
            </div>
          </Reveal>

          <Reveal delay={120} className="lg:col-span-5">
            <div className="relative mx-auto w-64 max-w-full rounded-[1.9rem] border-4 border-background/80 bg-background p-2.5">
              <div className="rounded-[1.25rem] bg-foreground p-3 text-background">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
                    <TrainFront className="h-4 w-4" />
                  </span>
                  <span className="text-[11px] font-black">{isFa ? "متو" : "metto"}</span>
                  <span className="ms-auto rounded-md border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary">
                    {isFa ? "آفلاین · آماده" : "Offline · ready"}
                  </span>
                </div>
                <div className="mt-3 rounded-lg border border-background/15 bg-background/[0.06] p-2.5">
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className="h-2 w-2 rounded-full border-2 border-primary" aria-hidden />
                    <span className="font-bold">{isFa ? "تجریش" : "Tajrish"}</span>
                  </div>
                  <div className="ms-[3px] my-1 h-5 border-s-2 border-dashed border-background/25" aria-hidden />
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className="h-2 w-2 rounded-full bg-primary" aria-hidden />
                    <span className="font-bold">{isFa ? "صادقیه" : "Sadeghiyeh"}</span>
                  </div>
                </div>
                <ul className="mt-2.5 space-y-1 text-[9px]">
                  {[
                    { ok: true, t: isFa ? "مسیر و نقشه" : "Route & map" },
                    { ok: true, t: isFa ? "زمان‌بندی ایستگاه‌ها" : "Station timetables" },
                    { ok: false, t: isFa ? "قطار بعدی به‌صورت زنده" : "Live next train" },
                  ].map((row) => (
                    <li key={row.t} className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "flex h-3 w-3 items-center justify-center rounded-full",
                          row.ok ? "bg-primary text-primary-foreground" : "border border-background/30 text-background/50",
                        )}
                        aria-hidden
                      >
                        {row.ok && <Check className="h-2 w-2" />}
                      </span>
                      <span className={cn(!row.ok && "text-background/60")}>{row.t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Reveal>
        </div>

        <Reveal delay={60}>
          <div className="mt-14 grid gap-6 rounded-lg border border-background/15 bg-background/[0.05] p-5 sm:p-7 lg:grid-cols-12 lg:gap-10">
            <div className="lg:col-span-5">
              <h3 className="text-xl font-black leading-tight tracking-tight sm:text-2xl">{t.noInstallTitle}</h3>
              <p className="mt-3 text-sm leading-7 text-background/80">{t.noInstallDesc}</p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={install}
                  disabled={!installEvent && !installed}
                  className={cn(
                    "inline-flex h-12 items-center gap-2 rounded-lg px-6 text-sm font-bold transition",
                    installEvent
                      ? "bg-primary text-primary-foreground hover:brightness-110 active:scale-[0.98]"
                      : "cursor-default border border-background/30 text-background/80",
                  )}
                >
                  {installed ? <Check className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                  {installed ? t.installed : t.install}
                </button>
                <Link
                  href="/"
                  className="inline-flex h-12 items-center gap-2 rounded-lg border border-background/30 px-5 text-sm font-bold transition hover:bg-background hover:text-foreground"
                >
                  <TrainFront className="h-4 w-4" />
                  {heroCta}
                </Link>
              </div>
              <p className="mt-2.5 text-[11px] text-background/60">{t.note}</p>
            </div>

            <div className="lg:col-span-7">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h4 className="text-base font-black tracking-tight">{t.storesTitle}</h4>
                <p className="text-[11px] text-background/60">{t.storesSubtitle}</p>
              </div>
              <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
                <li>
                  <a href={INSTALL_TARGETS.twa} target="_blank" rel="noreferrer noopener" className="group flex items-center gap-3 rounded-lg border border-background/20 bg-background/[0.07] px-3.5 py-3 transition hover:-translate-y-0.5 hover:border-background/45">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/50 bg-primary text-primary-foreground" aria-hidden>
                      <Download className="h-[18px] w-[18px]" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-bold">{t.twa}</span>
                      <span className="text-[11px] text-background/65">{t.twaNote}</span>
                    </span>
                    {isFa ? <ArrowLeft className="h-4 w-4 shrink-0" /> : <ArrowRight className="h-4 w-4 shrink-0" />}
                  </a>
                </li>
                <li>
                  <a href={INSTALL_TARGETS.myket} target="_blank" rel="noreferrer noopener" className="group flex items-center gap-3 rounded-lg border border-background/20 bg-background/[0.07] px-3.5 py-3 transition hover:-translate-y-0.5 hover:border-background/45">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-background/25" aria-hidden>
                      <Download className="h-[18px] w-[18px]" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-bold">{t.myket}</span>
                      <span className="text-[11px] text-background/65">{t.myketNote}</span>
                    </span>
                    {isFa ? <ArrowLeft className="h-4 w-4 shrink-0" /> : <ArrowRight className="h-4 w-4 shrink-0" />}
                  </a>
                </li>
                {[
                  { title: t.bazar, note: t.bazarNote },
                  { title: t.play, note: t.playNote },
                ].map((s) => (
                  <li key={s.title}>
                    <span className="flex cursor-not-allowed items-center gap-3 rounded-lg border border-dashed border-background/15 px-3.5 py-3 text-background/55">
                      <span className="flex-1">
                        <span className="block truncate text-sm font-bold">{s.title}</span>
                        <span className="text-[11px]">{s.note}</span>
                      </span>
                      <span className="rounded-md border border-background/15 px-1.5 py-0.5 text-[10px] font-bold">
                        {isFa ? "به‌زودی" : "soon"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-5 border-t border-background/15 pt-4">
                <h5 className="text-[11px] font-bold tracking-wide text-background/70">{t.hintTitle}</h5>
                <ol className="mt-2 grid gap-1.5 sm:grid-cols-3">
                  {t.steps.map((step, i) => (
                    <li key={step} className="flex items-start gap-2 text-[11px] leading-6 text-background/80">
                      <span className="mt-0.5 font-bold tabular-nums text-primary">{persianDigits(i + 1, lang)}.</span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
