"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Download, Share, X } from "lucide-react";
import { IosInstallGuide } from "@/components/ios-install-guide";
import type { Lang } from "@/lib/i18n";
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
  lang: Lang;
  closeLabel: string;
};

const buttonClass =
  "flex items-center justify-center gap-1.5 rounded-lg border border-transparent bg-primary px-2.5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:px-3 md:py-2.5 md:text-base";

export function InstallNavButton({
  label,
  lang,
  closeLabel,
}: Props) {
  const [platform, setPlatform] = useState<"unknown" | "ios" | "other">("unknown");
  const [installed, setInstalled] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [twaInstalled, setTwaInstalled] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

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
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Native modal semantics keep keyboard focus inside and make the
    // background inert. showModal also handles Escape and focus restoration.
    const dialog = dialogRef.current;
    dialog?.showModal();

    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
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

  const guidePortal =
    guideOpen && typeof document !== "undefined"
      ? createPortal(
          <dialog
            ref={dialogRef}
            aria-labelledby="ios-install-guide-title"
            onClose={() => setGuideOpen(false)}
            onCancel={(event) => {
              event.preventDefault();
              setGuideOpen(false);
            }}
            onClick={(event) => {
              if (event.target === event.currentTarget) setGuideOpen(false);
            }}
            className="m-auto w-[calc(100%-2rem)] max-w-sm overflow-y-auto overscroll-contain rounded-2xl border border-border bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/50"
            style={{
              maxHeight: "calc(100dvh - 2rem - env(safe-area-inset-top) - env(safe-area-inset-bottom))",
            }}
          >
            <div className="relative p-5 sm:p-6">
              <button
                type="button"
                autoFocus
                onClick={() => setGuideOpen(false)}
                aria-label={closeLabel}
                className="absolute end-2 top-2 flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
              <IosInstallGuide lang={lang} titleId="ios-install-guide-title" headingLevel={2} />
              <button
                type="button"
                onClick={() => setGuideOpen(false)}
                className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {closeLabel}
              </button>
            </div>
          </dialog>,
          document.body,
        )
      : null;

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
      {guidePortal}
    </>
  );
}
