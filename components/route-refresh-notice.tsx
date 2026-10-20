"use client";

import { STRINGS, type Lang } from "@/lib/i18n";

export function RouteRefreshNotice({ lang, onRefresh, focusTarget = '[data-testid="route-summary-stats"]' }: {
  lang: Lang; onRefresh: () => void; focusTarget?: string;
}) {
  const t = STRINGS[lang];
  return (
    <div role="status" data-testid="route-stale-notice" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-card px-3 py-2">
      <p className="text-sm">{t.routeStale}</p>
      <button type="button" onClick={() => {
        onRefresh();
        requestAnimationFrame(() => {
          const target = document.querySelector<HTMLElement>(focusTarget) ?? document.getElementById("main-content");
          target?.focus();
        });
      }}
        className="min-h-[44px] rounded-lg bg-foreground px-3 py-2 text-sm font-bold text-background hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        {t.refreshRoute}
      </button>
    </div>
  );
}
