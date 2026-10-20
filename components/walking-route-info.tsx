"use client";

import { STRINGS, type Lang } from "@/lib/i18n";

export function WalkingRouteInfo({ lang, loading, hasPath, saved, onMap = false }: {
  lang: Lang; loading: boolean; hasPath: boolean; saved: boolean; onMap?: boolean;
}) {
  const t = STRINGS[lang];
  return (
    <div data-testid="walking-route-info" role="status" className={`text-xs leading-relaxed text-muted-foreground ${onMap ? "rounded-lg border border-border bg-background/95 px-3 py-2 shadow-sm" : ""}`}>
      {loading ? t.walkRouteLoading : hasPath ? `${saved ? `${t.walkRouteSaved} ` : ""}${onMap ? t.walkRouteStreet : t.walkRouteMeasured}` : t.walkRouteApproximate}
      {hasPath && (
        <span className="ms-1 inline-flex flex-wrap gap-x-1">
          <a href="https://openrouteservice.org/" target="_blank" rel="noopener noreferrer" className="underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">openrouteservice<span className="sr-only"> — {t.opensInNewTab}</span></a>
          · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">OpenStreetMap<span className="sr-only"> — {t.opensInNewTab}</span></a>
        </span>
      )}
    </div>
  );
}
