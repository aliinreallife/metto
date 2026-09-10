"use client";

import { useEffect } from "react";
import { CheckCircle2, RefreshCw, WifiOff, X } from "lucide-react";
import { useOfflineReadiness } from "@/lib/offline/use-offline-readiness";
import { useHolidayData } from "@/lib/holidays/use-holiday-data";
import { ensurePersistentStorage } from "@/lib/offline/storage";
import type { Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function OfflineStatus({ lang }: { lang: Lang }) {
  const isFa = lang === "fa";
  const readiness = useOfflineReadiness();
  const { justUpdated, dismissUpdateNotice } = useHolidayData();

  useEffect(() => {
    // Best-effort once per session; never prompts, never blocks.
    void ensurePersistentStorage();
  }, []);

  const { phase, swWaiting, readyDismissed, dismissReady, applyUpdate } =
    readiness;

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

      {phase === "offline-ready" && (
        <StatusRow tone="offline">
          <WifiOff className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            {isFa
              ? "شما آفلاین هستید؛ مسیریابی مترو در دسترس است"
              : "You're offline; metro routing is available"}
          </span>
        </StatusRow>
      )}

      {phase === "offline-incomplete" && (
        <StatusRow tone="warn">
          <WifiOff className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1">
            {isFa
              ? "برای استفاده آفلاین، ابتدا یک‌بار با اینترنت وارد شوید"
              : "Connect online once to enable offline use"}
          </span>
        </StatusRow>
      )}

      {phase === "ready" && !readyDismissed && !swWaiting && (
        <StatusRow tone="ready">
          <CheckCircle2 className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            {isFa
              ? "متو برای استفاده آفلاین آماده است."
              : "Metto is ready for offline use."}
          </span>
          <button
            type="button"
            onClick={dismissReady}
            aria-label={isFa ? "بستن" : "Dismiss"}
            className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </StatusRow>
      )}

      {phase === "preparing" && (
        <p className="px-1 text-[11px] text-muted-foreground">
          {isFa ? "در حال آماده‌سازی آفلاین…" : "Preparing offline…"}
        </p>
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
  tone: "ready" | "offline" | "warn" | "update";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium md:text-xs",
        tone === "ready" &&
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        tone === "offline" &&
          "border-border bg-muted/60 text-muted-foreground",
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
