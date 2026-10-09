"use client";

import { useEffect, useState, type ReactElement } from "react";
import Link from "next/link";
import { useMetro } from "@/app/providers";
import { isAndroidTwa, isTwaPackageInstalled } from "@/lib/twa";
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
  twa: "https://github.com/aliinreallife/metto/releases/latest",
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
  // How we know what's installed (browsers can only tell us so much):
  // - pwaStandalone: this page is running inside the installed web app
  //   (display-mode: standalone / iOS navigator.standalone).
  // - installedEvent: the PWA install prompt was accepted in this session.
  // - inTwa: this page is running inside the installed Android app (TWA).
  // - twaOnDevice: the Android package is installed on this device while we
  //   are browsing (Chromium getInstalledRelatedApps, best-effort).
  const [pwaStandalone, setPwaStandalone] = useState(false);
  const [installedEvent, setInstalledEvent] = useState(false);
  const [inTwa, setInTwa] = useState(false);
  const [twaOnDevice, setTwaOnDevice] = useState(false);

  useEffect(() => {
    setPwaStandalone(isStandalone());
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalledEvent(true);
      setInstallEvent(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    let cancelled = false;
    void (async () => {
      const twaNow = await isAndroidTwa();
      if (cancelled) return;
      setInTwa(twaNow);
      if (twaNow) {
        setTwaOnDevice(true);
        return;
      }
      setTwaOnDevice(await isTwaPackageInstalled());
    })();
    return () => {
      cancelled = true;
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") setInstalledEvent(true);
    setInstallEvent(null);
  };

  // Running inside an installed surface: show the explicit status instead of
  // the PWA button (which would be a dead second install).
  const inInstalledContext = inTwa || pwaStandalone || installedEvent;
  const statusTitle = inTwa ? t.installedTwa : pwaStandalone || installedEvent ? t.installedPwa : t.twaOnDevice;
  const statusHint = inTwa ? t.installedTwaHint : pwaStandalone || installedEvent ? t.installedPwaHint : t.twaOnDeviceHint;
  const showStatus = inInstalledContext || twaOnDevice;
  const hintLine = inInstalledContext || twaOnDevice ? statusHint : installEvent ? t.installPwaNote : t.note;

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
    <section id="install" className="relative flex min-h-svh flex-col justify-center overflow-hidden bg-muted/50 py-16 text-foreground sm:py-20">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "88px 88px",
          maskImage: "radial-gradient(120% 90% at 50% 0%, black 30%, transparent 78%)",
        }}
        aria-hidden
      />
      <div className="relative mx-auto w-full max-w-6xl px-4 sm:px-6">
        <Reveal>
          <span className="inline-flex items-center gap-2 rounded-lg border border-border px-2.5 py-1 text-[11px] font-bold">
            <OfflineIcon className="h-3.5 w-3.5 text-primary" />
            {t.eyebrow}
          </span>
          <h2 className="mt-4 max-w-2xl text-[clamp(1.8rem,4.6vw,2.9rem)] font-black leading-[1.15] tracking-tight">
            {t.title}
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-8 text-muted-foreground sm:text-base">{t.desc}</p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {showStatus && (
              <span
                role="status"
                title={statusHint}
                aria-label={statusHint}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-6 text-sm font-bold sm:w-auto"
              >
                <CheckIcon className="h-4 w-4 shrink-0 text-primary" />
                {statusTitle}
              </span>
            )}
            {!inInstalledContext && (
              <button
                type="button"
                onClick={install}
                disabled={!installEvent}
                title={!installEvent ? t.note : undefined}
                className={cn(
                  "group inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg px-6 text-sm font-bold transition-all duration-200 sm:w-auto",
                  installEvent
                    ? "bg-primary text-primary-foreground hover:brightness-110 active:scale-[0.98]"
                    : "cursor-default border border-border text-muted-foreground",
                )}
              >
                <PhoneIcon className="h-4 w-4" />
                {t.install}
              </button>
            )}
            <Link
              href="/route"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-border px-5 text-sm font-bold transition-colors duration-200 hover:bg-card sm:w-auto"
            >
              <TrainIcon className="h-4 w-4" />
              {heroCta}
            </Link>
          </div>
          <p className="mt-2.5 max-w-xl text-[11px] leading-5 text-muted-foreground">{hintLine}</p>
          <p className="mt-1.5 max-w-xl text-[11px] leading-5 text-muted-foreground/80">{t.detectionNote}</p>

          <div className="mt-6 max-w-2xl rounded-lg border border-border bg-card p-4">
            <h3 className="text-sm font-black tracking-tight">{t.chooseTitle}</h3>
            <p className="mt-1.5 text-xs leading-6 text-muted-foreground">{t.chooseDesc}</p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              <li className="rounded-lg border border-border px-3 py-2.5">
                <p className="text-xs font-bold">{t.waySite}</p>
                <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">{t.waySiteNote}</p>
              </li>
              <li className="rounded-lg border border-border px-3 py-2.5">
                <p className="text-xs font-bold">{t.wayApp}</p>
                <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">{t.wayAppNote}</p>
              </li>
            </ul>
            <p className="mt-2.5 flex items-center gap-1.5 text-[11px] font-bold text-primary">
              <OfflineIcon className="h-3.5 w-3.5" />
              {t.bothOffline}
            </p>
          </div>
        </Reveal>

        <Reveal delay={60}>
          <div className="mt-10">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-base font-black tracking-tight">{t.storesTitle}</h3>
              <p className="text-[11px] text-muted-foreground">{t.storesSubtitle}</p>
            </div>

            <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
              {stores.map(({ key, title, note, Icon, href, disabled, primary }) => {
                const inner = (
                  <>
                    <span
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors duration-200",
                        disabled
                          ? "border-border text-muted-foreground"
                          : primary
                            ? "border-primary/50 bg-primary text-primary-foreground"
                            : "border-border text-foreground group-hover:border-foreground",
                      )}
                      aria-hidden
                    >
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-bold">{title}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {note}
                      </span>
                    </span>
                    {disabled ? (
                      <span className="shrink-0 rounded-md border border-border px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                        {isFa ? "به‌زودی" : "soon"}
                      </span>
                    ) : (
                      <ArrowIcon className="h-4 w-4 shrink-0 text-muted-foreground transition-all duration-300 group-hover:translate-x-1 group-hover:text-foreground rtl:rotate-180 rtl:group-hover:-translate-x-1" />
                    )}
                  </>
                );
                const cls = cn(
                  "group flex items-center gap-3 rounded-lg border px-3.5 py-3 text-start transition-all duration-200",
                  disabled
                    ? "cursor-not-allowed border-dashed border-border text-muted-foreground"
                    : "border-border bg-card hover:-translate-y-0.5 hover:border-foreground hover:bg-muted active:scale-[0.99]",
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
