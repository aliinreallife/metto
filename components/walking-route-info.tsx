"use client";

import { STRINGS, type Lang } from "@/lib/i18n";

export function WalkingRouteInfo({ lang, loading, hasPath, saved, onMap = false }: {
  lang: Lang; loading: boolean; hasPath: boolean; saved: boolean; onMap?: boolean;
}) {
  const t = STRINGS[lang];
  return (
    <span data-testid="walking-route-info" role="status" className="sr-only">
      {loading ? t.walkRouteLoading : hasPath ? `${saved ? `${t.walkRouteSaved} ` : ""}${onMap ? t.walkRouteStreet : t.walkRouteMeasured}` : t.walkRouteApproximate}
    </span>
  );
}
