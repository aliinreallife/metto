"use client";
import { Building2, X } from "lucide-react";
import { STRINGS, type Lang } from "@/lib/i18n";
import { displayPlaceLabel } from "@/lib/geocoding";
import { formatDistance, formatWalkTime, estimateWalkMinutes, isLongWalk } from "@/lib/geo";
import type { WalkingRoute } from "@/lib/walking/route";

export function RoutePlaceCard({ lang, placeName, stationName, distanceKm: approximateKm, onClear, walkingRoute }: {
  lang: Lang; placeName: string; stationName: string; distanceKm: number;
  onClear: () => void; walkingRoute?: WalkingRoute | null;
}) {
  const t = STRINGS[lang];
  const distanceKm = walkingRoute ? walkingRoute.distanceMeters / 1000 : approximateKm;
  const walkMin = walkingRoute ? walkingRoute.durationSeconds / 60 : estimateWalkMinutes(approximateKm);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm md:gap-3 md:px-4 md:py-2.5 md:text-base">
      <Building2 aria-hidden="true" className="size-4 shrink-0 text-primary md:size-5" />
      <div className="min-w-0 flex-1">
        <div className="truncate">
          <span className="font-medium">{displayPlaceLabel(placeName, lang)}</span>
          <span aria-hidden="true" className="mx-1.5 text-muted-foreground">→</span>
          <span>
            {t.nearestStation}: <span className="font-medium">{stationName}</span>
          </span>
          <span className="ms-1.5 text-muted-foreground">
            {" "}({formatDistance(distanceKm, lang)} · {walkingRoute ? "" : "~"}{formatWalkTime(walkMin, lang)} {t.walkTime})
          </span>
        </div>
        {isLongWalk(distanceKm, walkMin) && (
          <p className="mt-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
            {t.longWalkConsiderTransport}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onClear}
        aria-label={t.clear}
        className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <X aria-hidden="true" className="size-3.5" />
      </button>
    </div>
  );
}
