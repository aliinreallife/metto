"use client";

import { Building2, AlertTriangle, X } from "lucide-react";
import { STRINGS, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Bottom confirmation card for an arbitrary map pick (exact coordinates).
 * Mirrors the map place-card shape; the two endpoint actions stay available
 * with primary emphasis on the more useful one. No autofocus, no focus trap.
 */
export function MapPickCard({
  lang,
  title,
  stationName,
  distanceText,
  walkText,
  tooFar,
  destPrimary,
  onChooseOrigin,
  onChooseDest,
  onClose,
}: {
  lang: Lang;
  /** Resolved place label, or coordinate fallback while geocoding. */
  title: string;
  stationName: string;
  distanceText: string;
  walkText: string;
  tooFar: boolean;
  /** True to emphasize "destination" (an origin already exists). */
  destPrimary: boolean;
  onChooseOrigin: () => void;
  onChooseDest: () => void;
  onClose: () => void;
}) {
  const t = STRINGS[lang];
  return (
    <div
      data-testid="map-pick-card"
      className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-sm"
    >
      <div className="flex items-start gap-2">
        {tooFar ? (
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber-500" />
        ) : (
          <Building2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t.useThisPoint}
          </p>
          <h3 className="mt-0.5 truncate text-sm font-bold">{title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t.nearestStation}: {stationName} · {distanceText} · ~{walkText} {t.walkTime}
          </p>
          {tooFar && (
            <p className="mt-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
              {t.tooFarFromStation} (~{walkText})
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.close}
          className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onChooseOrigin}
          className={cn(
            "min-h-[44px] flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            destPrimary
              ? "border border-border text-foreground hover:bg-accent"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          {t.setAsOrigin}
        </button>
        <button
          type="button"
          onClick={onChooseDest}
          className={cn(
            "min-h-[44px] flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            destPrimary
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "border border-border text-foreground hover:bg-accent",
          )}
        >
          {t.setDestination}
        </button>
      </div>
    </div>
  );
}
