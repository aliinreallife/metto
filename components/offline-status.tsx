"use client";

import { useEffect, useRef } from "react";
import { CheckCircle2, RefreshCw, WifiOff, X } from "lucide-react";
import { useOfflineReadiness } from "@/lib/offline/use-offline-readiness";
import { useHolidayData } from "@/lib/holidays/use-holiday-data";
import { ensurePersistentStorage } from "@/lib/offline/storage";
import type { Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    __mettoOffline?: Record<string, unknown>;
  }
}

/**
 * Offline status shell. Offline caching runs silently in the background:
 * normal online usage shows NO preparation/readiness text. Readiness
 * transitions are logged to the console (and mirrored to
 * `window.__mettoOffline`) for debugging and Playwright.
 *
 * Visible UI appears only when the user must act:
 * - a waiting service worker (refresh requires a user action);
 * - offline with core data missing (one online visit needed);
 * - a genuinely new holiday dataset was just installed (one-time notice).
 */
export function OfflineStatus({ lang }: { lang: Lang }) {
  const isFa = lang === "fa";
  const readiness = useOfflineReadiness();
  const { justUpdated, dismissUpdateNotice } = useHolidayData();

  useEffect(() => {
    // Best-effort once per session; never prompts, never blocks.
    void ensurePersistentStorage();
  }, []);

  const {
    phase,
    online,
    swControlling,
    swWaiting,
    scheduleLoaded,
    holidayLoaded,
    precacheReady,
    applyUpdate,
  } = readiness;

  // Debug-only transition log: fires only when a meaningful value changes,
  // never on every render.
  const lastLoggedRef = useRef<string>("");
  useEffect(() => {
    const snapshot = {
      state: phase,
      serviceWorkerControlled: swControlling,
      precacheReady,
      scheduleReady: scheduleLoaded,
      holidaysReady: holidayLoaded,
      online,
    };
    const key = JSON.stringify(snapshot);
    if (lastLoggedRef.current === key) return;
    lastLoggedRef.current = key;
    console.debug("[Metto Offline]", snapshot);
    try {
      window.__mettoOffline = { ...snapshot, at: new Date().toISOString() };
    } catch {
      // Diagnostics must never break the app.
    }
  }, [phase, swControlling, precacheReady, scheduleLoaded, holidayLoaded, online]);

  return (
    <div
      aria-live="polite"
      data-testid="offline-status"
      data-phase={phase}
      className="z-10 flex flex-col items-stretch gap-1 px-4 pt-1 md:px-6"
    >
      {swWaiting && (
        <StatusRow tone="update">
          <RefreshCw className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            {isFa ? "نسخه جدید متو آماده است" : "A new version is available"}
          </span>
          <button
            type="button"
            onClick={applyUpdate}
            className="shrink-0 rounded-md bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground hover:opacity-90"
          >
            {isFa ? "به‌روزرسانی" : "Update"}
          </button>
        </StatusRow>
      )}

      {phase === "offline-incomplete" && (
        <StatusRow tone="warn">
          <WifiOff className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1">
            {isFa
              ? "این دستگاه هنوز برای استفاده آفلاین آماده نشده است. برای دریافت اطلاعات لازم یک‌بار به اینترنت متصل شوید."
              : "Offline data hasn't finished downloading on this device. Connect to the Internet once to prepare Metto for offline use."}
          </span>
        </StatusRow>
      )}

      {justUpdated && (
        <StatusRow tone="ready">
          <CheckCircle2 className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            {isFa
              ? "اطلاعات تعطیلات متو به‌روزرسانی شد."
              : "Holiday information has been updated."}
          </span>
          <button
            type="button"
            onClick={dismissUpdateNotice}
            aria-label={isFa ? "بستن" : "Dismiss"}
            className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </StatusRow>
      )}
    </div>
  );
}

function StatusRow({
  tone,
  children,
}: {
  tone: "ready" | "warn" | "update";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium md:text-xs",
        tone === "ready" &&
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        tone === "warn" &&
          "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
        tone === "update" &&
          "border-primary/30 bg-primary/5 text-foreground",
      )}
    >
      {children}
    </div>
  );
}
