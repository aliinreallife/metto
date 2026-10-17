"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Download, Share, X } from "lucide-react";
import { isTwaPackageInstalled } from "@/lib/twa";
import {
  isIosDevice,
  isStandaloneDisplay,
  shouldHideInstallButton,
} from "@/components/pwa";

export type InstallHeaderAction = "landing-install" | "ios-guide";

export function resolveInstallHeaderAction(isIos: boolean): InstallHeaderAction {
  return isIos ? "ios-guide" : "landing-install";
}

type Props = {
  label: string;
  iosGuideTitle: string;
  iosGuideSteps: string;
  closeLabel: string;
};

const buttonClass =
  "flex items-center justify-center gap-1.5 rounded-lg border border-transparent bg-primary px-2.5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:px-3 md:py-2.5 md:text-base";

export function InstallNavButton({
  label,
  iosGuideTitle,
  iosGuideSteps,
  closeLabel,
}: Props) {
  const [platform, setPlatform] = useState<"unknown" | "ios" | "other">("unknown");
  const [installed, setInstalled] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [twaInstalled, setTwaInstalled] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    const nav = window.navigator;
    const standalone = isStandaloneDisplay({
      matchMediaStandalone:
        window.matchMedia?.("(display-mode: standalone)").matches ?? false,
      navigatorStandalone:
        (nav as Navigator & { standalone?: boolean }).standalone === true,
    });
    const ios = isIosDevice(
      nav.userAgent ?? "",
      (nav as Navigator & { platform?: string }).platform ?? "",
      nav.maxTouchPoints ?? 0,
    );

    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only platform/standalone detection; an initializer would hydrate different markup.
    setIsStandalone(standalone);
    setPlatform(ios ? "ios" : "other");

    const onInstalled = () => setInstalled(true);
    window.addEventListener("appinstalled", onInstalled);

    void isTwaPackageInstalled().then((hit) => {
      if (!cancelled && hit) setTwaInstalled(true);
    });

    return () => {
      cancelled = true;
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    if (!guideOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setGuideOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    requestAnimationFrame(() => closeRef.current?.focus());
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [guideOpen]);

  if (shouldHideInstallButton({ installed, isStandalone, twaInstalled })) {
    return null;
  }

  if (platform === "unknown") {
    return (
      <span
        aria-hidden="true"
        className={`${buttonClass} invisible pointer-events-none select-none`}
      >
        <Download className="size-4 shrink-0 md:size-5" />
        <span className="hidden leading-none sm:inline">{label}</span>
      </span>
    );
  }

  if (resolveInstallHeaderAction(platform === "ios") === "landing-install") {
    return (
      <Link href="/#install" className={buttonClass} aria-label={label}>
        <Download className="size-4 shrink-0 md:size-5" />
        <span className="hidden leading-none sm:inline">{label}</span>
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setGuideOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={guideOpen}
        aria-label={label}
        className={buttonClass}
      >
        <Share className="size-4 shrink-0 md:size-5" />
        <span className="hidden leading-none sm:inline">{label}</span>
      </button>

      {guideOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-4 sm:items-center"
          onClick={() => setGuideOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-guide-title"
            aria-describedby="ios-install-guide-steps"
            className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-5 text-foreground shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              ref={closeRef}
              type="button"
              onClick={() => setGuideOpen(false)}
              aria-label={closeLabel}
              className="absolute end-3 top-3 flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-5" />
            </button>

            <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Share className="size-5" />
            </div>
            <h2 id="ios-install-guide-title" className="mt-4 pe-10 text-lg font-bold">
              {iosGuideTitle}
            </h2>
            <p
              id="ios-install-guide-steps"
              className="mt-2 text-sm leading-7 text-muted-foreground"
            >
              {iosGuideSteps}
            </p>
            <button
              type="button"
              onClick={() => setGuideOpen(false)}
              className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
            >
              {closeLabel}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
