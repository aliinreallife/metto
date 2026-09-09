"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Navigation } from "lucide-react";
import type { MetroStation } from "@/lib/metro/types";
import { STRINGS, type Lang } from "@/lib/i18n";
import { geoUrl, googleMapsDirectionsUrl } from "@/lib/geo";

type NavigatorWithUserAgentData = Navigator & {
  userAgentData?: { mobile?: boolean };
};

// Conservative phone/tablet check. Deliberately NOT using
// `(pointer: coarse) + maxTouchPoints`: touchscreen Windows laptops satisfy
// that and would get a `geo:` URL that desktops handle poorly.
// SSR/default is always desktop (HTTPS) — mobile is opt-in after mount.
function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as NavigatorWithUserAgentData;
  if (typeof nav.userAgentData?.mobile === "boolean") {
    return nav.userAgentData.mobile;
  }
  const ua = typeof nav.userAgent === "string" ? nav.userAgent : "";
  return /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(ua);
}

async function copyTextWithFallback(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    throw new Error("clipboard unavailable");
  } catch {
    // Legacy non-secure-context fallback (HTTP, older browsers).
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "0";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      if (ok) return true;
      throw new Error("execCommand failed");
    } catch {
      // Last resort: native share sheet (mobile). A user-cancelled sheet
      // rejects — treat that as "do nothing", not as a failure.
      try {
        if (typeof navigator.share === "function") {
          await navigator.share({ url: text });
          return true;
        }
      } catch {
        return false;
      }
      return false;
    }
  }
}

const actionBaseClass =
  "flex min-w-0 items-center justify-center gap-1 rounded-xl border border-border bg-background px-1.5 py-3 text-[11px] font-medium whitespace-nowrap transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background min-[360px]:gap-1.5 min-[360px]:px-2 min-[360px]:text-xs md:gap-2 md:py-3.5 md:text-sm";

export function RouteActions({
  origin,
  lang,
}: {
  origin: MetroStation;
  lang: Lang;
}) {
  const t = STRINGS[lang];
  const isFa = lang === "fa";
  const stationName = isFa ? origin.name.fa : origin.name.en;

  const [isMobile, setIsMobile] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setIsMobile(isMobileDevice());
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function flashState(next: "copied" | "failed") {
    setCopyState(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopyState("idle"), 1800);
  }

  const directionsHref = isMobile
    ? geoUrl({ lat: origin.location.lat, lng: origin.location.lng }, stationName)
    : googleMapsDirectionsUrl({
        lat: origin.location.lat,
        lng: origin.location.lng,
      });

  async function handleCopy() {
    const ok = await copyTextWithFallback(window.location.href);
    // copyTextWithFallback returns false both for "share cancelled" and for
    // "all methods failed". Only show the failure state when there was no
    // share sheet to fall back to — otherwise a cancelled sheet would flash
    // an error, which is worse than staying idle.
    if (ok) {
      flashState("copied");
    } else if (typeof navigator.share !== "function") {
      flashState("failed");
    }
  }

  return (
    <div className="grid grid-cols-5 gap-2 md:gap-3">
      <a
        href={directionsHref}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${t.directionsToStart} — ${stationName} (${t.opensInNewTab})`}
        className={`${actionBaseClass} col-span-3`}
      >
        <Navigation className="size-3.5 shrink-0 md:size-4" aria-hidden="true" />
        <span>{t.directionsToStart}</span>
        <span className="sr-only"> ({t.opensInNewTab})</span>
      </a>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copyState === "copied" ? t.copied : t.copyLink}
        aria-live="polite"
        className={`${actionBaseClass} col-span-2`}
      >
        {copyState === "copied" ? (
          <>
            <Check
              className="size-3.5 shrink-0 text-green-500 md:size-4"
              aria-hidden="true"
            />
            <span className="text-green-600 dark:text-green-400">
              {t.copiedShort}
            </span>
          </>
        ) : copyState === "failed" ? (
          <>
            <Copy className="size-3.5 shrink-0 md:size-4" aria-hidden="true" />
            <span>{t.copyFailed}</span>
          </>
        ) : (
          <>
            <Copy className="size-3.5 shrink-0 md:size-4" aria-hidden="true" />
            <span>{t.copyLink}</span>
          </>
        )}
      </button>
    </div>
  );
}
