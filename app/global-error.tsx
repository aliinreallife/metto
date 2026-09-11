"use client";

import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { reloadFresh } from "@/lib/recovery";

/**
 * Root error boundary. Must be self-contained (own <html>/<body>, no
 * providers, no layout) because it renders when everything else failed.
 * Static fa+en copy. "Try again" resets normally; only "Reload fresh"
 * clears stale document caches / unregisters the worker.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const onReloadFresh = async () => {
    if (busy) return;
    setBusy(true);
    await reloadFresh();
  };

  return (
    <html lang="fa" dir="rtl">
      <body className="flex min-h-dvh items-center justify-center bg-background p-4 font-sans text-foreground antialiased">
        <div
          data-testid="app-error"
          role="alert"
          className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-sm"
        >
          <div className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 size-6 shrink-0 text-amber-500" />
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold">
                خطایی در بارگذاری این صفحه رخ داد
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                لطفاً دوباره تلاش کنید. اگر مشکل ادامه داشت، با بارگذاری تازه
                فایل‌های قدیمی ذخیره‌شده پاک می‌شوند.
              </p>
              <p className="mt-2 text-sm font-medium">
                Something went wrong loading this page
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Please try again. If the problem keeps happening, reload fresh
                to clear stale cached files.
              </p>
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
                  تلاش مجدد · Try again
                </button>
                <button
                  type="button"
                  onClick={onReloadFresh}
                  disabled={busy}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                >
                  بارگذاری تازه · Reload fresh
                </button>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
