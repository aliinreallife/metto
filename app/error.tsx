"use client";

import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { STRINGS } from "@/lib/i18n";
import { reloadFresh } from "@/lib/recovery";

/**
 * Route-segment error boundary (fa-first static copy — no providers, so
 * this still renders when the failure is above them). Replaces what would
 * otherwise be a blank content area under intact tabs. "Try again" uses
 * the normal reset path and never touches the service worker; only the
 * explicit "Reload fresh" clears stale document caches / unregisters.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const fa = STRINGS.fa;
  const en = STRINGS.en;

  const onReloadFresh = async () => {
    if (busy) return;
    setBusy(true);
    await reloadFresh();
  };

  return (
    <div className="flex size-full items-center justify-center overflow-y-auto p-4 md:p-8">
      <div
        data-testid="route-error"
        role="alert"
        className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-sm"
      >
        <div className="flex items-start gap-3">
          <TriangleAlert className="mt-0.5 size-6 shrink-0 text-amber-500" />
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold">{fa.pageLoadErrorTitle}</p>
            <p className="mt-1 text-sm text-muted-foreground">{fa.pageLoadErrorBody}</p>
            <p className="mt-2 text-sm font-medium">{en.pageLoadErrorTitle}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{en.pageLoadErrorBody}</p>
            {error?.digest ? (
              <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                digest: {error.digest}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={reset}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                {fa.tryAgain} · {en.tryAgain}
              </button>
              <button
                type="button"
                onClick={onReloadFresh}
                disabled={busy}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                {fa.reloadFresh} · {en.reloadFresh}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
