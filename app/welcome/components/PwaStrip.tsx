"use client";

import { useEffect, useState, type ReactElement } from "react";
import Link from "next/link";
import { useMetro } from "@/app/providers";
import { WELCOME_CONTENT } from "../content";
import { persianDigits } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Reveal } from "./Reveal";
import { useTehranClock } from "./tehran-clock";
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
/* Phone in a tunnel — zero bars, app still alive                      */
/* ------------------------------------------------------------------ */

function TunnelPhone() {
  const { lang } = useMetro();
  const isFa = lang === "fa";
  const clock = useTehranClock();

  return (
    <div className="relative mx-auto w-[16rem] max-w-full">
      <div
        className="pointer-events-none absolute -inset-x-12 -top-10 bottom-4 rounded-t-[9rem] border border-background/10"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -inset-x-6 -top-5 bottom-8 rounded-t-[8rem] border border-background/[0.07]"
        aria-hidden
      />

      <div className="drift-y relative rounded-[1.9rem] border-4 border-background/80 bg-background p-2.5 shadow-[0_40px_70px_-40px_rgba(0,0,0,0.9)]">
        <span className="absolute top-1.5 start-1/2 h-1 w-14 -translate-x-1/2 rounded-full bg-background/40" aria-hidden />

        <div className="rounded-[1.25rem] bg-foreground p-3 text-background">
          <div className="flex items-center justify-between text-[9px] text-background/80">
            <span className="tnum font-bold">{clock.time || (isFa ? "۹:۴۱" : "9:41")}</span>
            <span className="flex items-center gap-1.5">
              <span className="flex items-end gap-[2px]" aria-hidden>
                {[3, 5, 7, 9].map((h) => (
                  <span key={h} className="w-[3px] rounded-[1px] bg-background/25" style={{ height: h }} />
                ))}
              </span>
              <span className="rounded bg-primary/20 px-1 py-0.5 text-[8px] font-bold text-primary">
                {isFa ? "بدون آنتن" : "No signal"}
              </span>
            </span>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <TrainIcon className="h-4 w-4" />
            </span>
            <span className="text-[11px] font-black">{isFa ? "متو" : "metto"}</span>
            <span className="ms-auto flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary soft-pulse" />
              {isFa ? "آفلاین · آماده" : "Offline · ready"}
            </span>
          </div>

          <div className="mt-3 rounded-lg border border-background/15 bg-background/[0.06] p-2.5">
            <div className="flex items-center gap-2 text-[10px]">
              <span className="h-2 w-2 rounded-full border-2 border-primary" aria-hidden />
              <span className="font-bold">{isFa ? "تجریش" : "Tajrish"}</span>
              <span className="ms-auto tnum text-background/60">{persianDigits("06:42", lang)}</span>
            </div>
            <div className="ms-[3px] my-1 h-5 border-s-2 border-dashed border-background/25" aria-hidden />
            <div className="flex items-center gap-2 text-[10px]">
              <span className="h-2 w-2 rounded-full bg-primary" aria-hidden />
              <span className="font-bold">{isFa ? "صادقیه" : "Sadeghiyeh"}</span>
              <span className="ms-auto tnum text-background/60">{persianDigits("07:36", lang)}</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1 border-t border-background/10 pt-2 text-center">
              {[
                { v: persianDigits(54, lang), l: isFa ? "دقیقه" : "min" },
                { v: persianDigits(23, lang), l: isFa ? "ایستگاه" : "stops" },
                { v: persianDigits(1, lang), l: isFa ? "تعویض" : "change" },
              ].map((m) => (
                <span key={m.l} className="flex flex-col">
                  <span className="tnum text-[11px] font-black">{m.v}</span>
                  <span className="text-[8px] text-background/60">{m.l}</span>
                </span>
              ))}
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
                  {row.ok ? <CheckIcon className="h-2 w-2" /> : <span className="h-[1px] w-1.5 bg-current" />}
                </span>
                <span className={cn(!row.ok && "text-background/60")}>{row.t}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="mt-3 text-center text-[11px] text-background/70">
        {isFa ? "سه طبقه زیر زمین — همه چیز سر جایش است" : "Three floors down — everything's still there"}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Section                                                             */
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
    <section id="install" className="relative overflow-hidden bg-foreground py-16 text-background sm:py-24">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "88px 88px",
          maskImage: "radial-gradient(120% 90% at 50% 0%, black 30%, transparent 78%)",
        }}
        aria-hidden
      />

      <div className="relative mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-12">
          <Reveal className="lg:col-span-7">
            <span className="inline-flex items-center gap-2 rounded-lg border border-background/25 px-2.5 py-1 text-[11px] font-bold">
              <OfflineIcon className="h-3.5 w-3.5 text-primary" />
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
                  <li
                    key={step.title}
                    className="relative rounded-lg border border-background/15 bg-background/[0.06] p-3.5"
                  >
                    <span className="tnum latin flex h-6 w-6 items-center justify-center rounded-md bg-primary text-[11px] font-black text-primary-foreground">
                      {persianDigits(i + 1, lang)}
                    </span>
                    <span className="mt-2.5 block text-sm font-extrabold leading-6">{step.title}</span>
                    <span className="mt-1 block text-xs leading-6 text-background/75">{step.desc}</span>
                    {i < t.story.length - 1 && (
                      <ArrowIcon
                        className="absolute top-1/2 z-10 hidden h-4 w-4 -translate-y-1/2 text-background/40 sm:block rtl:rotate-180"
                        style={{ insetInlineEnd: "-1.1rem" }}
                        aria-hidden
                      />
                    )}
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
            <TunnelPhone />
          </Reveal>
        </div>

        <Reveal delay={60}>
          <div className="mt-14 grid gap-6 rounded-lg border border-background/15 bg-background/[0.05] p-5 sm:p-7 lg:grid-cols-12 lg:gap-10">
            <div className="lg:col-span-5">
              <h3 className="text-xl font-black leading-tight tracking-tight sm:text-2xl">{t.noInstallTitle}</h3>
              <p className="mt-3 text-sm leading-7 text-background/80">{t.noInstallDesc}</p>

              <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
                <span className="flex items-start gap-2.5 rounded-lg border border-primary/40 bg-primary/10 p-3">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0">
                    <span className="block text-xs font-bold">{t.waySite}</span>
                    <span className="mt-0.5 block text-[11px] leading-5 text-background/70">{t.waySiteNote}</span>
                  </span>
                </span>
                <span className="flex items-start gap-2.5 rounded-lg border border-background/20 p-3">
                  <PhoneIcon className="mt-0.5 h-4 w-4 shrink-0 text-background/70" />
                  <span className="min-w-0">
                    <span className="block text-xs font-bold">{t.wayApp}</span>
                    <span className="mt-0.5 block text-[11px] leading-5 text-background/70">{t.wayAppNote}</span>
                  </span>
                </span>
              </div>
              <p className="mt-3 flex items-center gap-2 text-[11px] font-bold text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-primary soft-pulse" aria-hidden />
                {t.bothOffline}
              </p>

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
                  href="/"
                  className="inline-flex h-12 items-center gap-2 rounded-lg border border-background/30 px-5 text-sm font-bold transition-colors duration-200 hover:bg-background hover:text-foreground"
                >
                  <TrainIcon className="h-4 w-4" />
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

              <div className="mt-5 border-t border-background/15 pt-4">
                <h5 className="text-[11px] font-bold tracking-wide text-background/70">{t.hintTitle}</h5>
                <ol className="mt-2 grid gap-1.5 sm:grid-cols-3">
                  {t.steps.map((step, i) => (
                    <li key={step} className="flex items-start gap-2 text-[11px] leading-6 text-background/80">
                      <span className="tnum latin mt-0.5 font-bold text-primary">{persianDigits(i + 1, lang)}.</span>
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
