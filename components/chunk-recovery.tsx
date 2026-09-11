"use client";

import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { useMetro } from "@/app/providers";
import { STRINGS } from "@/lib/i18n";
import {
  consumeChunkAutoRetry,
  isChunkLoadError,
  reloadFresh,
} from "@/lib/recovery";

/**
 * Stale-bundle safety net. Listens for Next.js chunk/dynamic-import
 * failures (stale HTML referencing evicted hashed chunks after a deploy):
 * - first failure this session → one automatic `location.reload()`;
 * - if failures persist after that → a visible recovery card with a manual
 *   "Reload fresh" action (clears stale document caches + unregisters the
 *   stale worker) instead of a blank page or a reload loop.
 * Renders nothing on the happy path.
 */
export function ChunkRecovery() {
  const { lang } = useMetro();
  const t = STRINGS[lang];
  const [unrecovered, setUnrecovered] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      let message: unknown = event.message;
      // Dynamic-import failures sometimes surface without ErrorEvent.message
      // (e.g. inside error objects on resource targets).
      if (!message && event.error instanceof Error) message = event.error.message;
      if (!isChunkLoadError(message)) return;
      try {
        event.preventDefault();
      } catch {
        // Ignore.
      }
      if (consumeChunkAutoRetry()) {
        window.location.reload();
      } else {
        setUnrecovered(true);
      }
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "";
      if (!isChunkLoadError(message)) return;
      try {
        event.preventDefault();
      } catch {
        // Ignore.
      }
      if (consumeChunkAutoRetry()) {
        window.location.reload();
      } else {
        setUnrecovered(true);
      }
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  if (!unrecovered) return null;

  const onReloadFresh = async () => {
    if (busy) return;
    setBusy(true);
    await reloadFresh();
  };

  return (
    <div
      data-testid="chunk-recovery"
      role="alert"
      className="fixed inset-x-3 bottom-[calc(70px+env(safe-area-inset-bottom,0px))] z-[60] mx-auto max-w-md rounded-xl border border-amber-500/40 bg-background/95 p-3 shadow-lg backdrop-blur md:bottom-6"
    >
      <div className="flex items-start gap-2">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-500" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{t.staleBundleTitle}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t.staleBundleBody}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={onReloadFresh}
              disabled={busy}
              className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {t.reloadFresh}
            </button>
            <button
              type="button"
              onClick={() => setUnrecovered(false)}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {t.close}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
