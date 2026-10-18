"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ExternalLink, Star } from "lucide-react";
import { useMetro } from "@/app/providers";
import { RatePrompt } from "@/components/rate-prompt";
import { STRINGS } from "@/lib/i18n";
import { recordRatingAction } from "@/lib/app-rating";
import {
  getAvailableRatingStores,
  getPreferredRatingStore,
  isAndroidTwa,
  openAndroidRateAppWithFallback,
  openAndroidRatingStore,
  type RatingStore,
} from "@/lib/twa";

export function RatePage() {
  const { lang } = useMetro();
  const t = STRINGS[lang];
  const isFa = lang === "fa";
  const router = useRouter();
  const searchParams = useSearchParams();
  // Hidden QA surface: render the exact production card without touching its
  // automatic eligibility state. Useful for visual/device verification.
  const previewPrompt = searchParams.get("prompt") === "1";
  const [stores, setStores] = useState<RatingStore[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    document.title = `${t.ratePageTitle}${isFa ? " | متو" : " | metto"}`;
  }, [t.ratePageTitle, isFa]);

  useEffect(() => {
    let live = true;
    void isAndroidTwa().then((value) => {
      if (!live) return;
      setStores(value ? getAvailableRatingStores() : []);
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    // This page is also accessible by URL, but only installed store apps
    // inside Metto's updated TWA can launch direct review screens.
    if (ready && !stores.length && !previewPrompt) router.replace("/route");
  }, [ready, stores, previewPrompt, router]);

  function handleStore(store: RatingStore) {
    try {
      recordRatingAction();
    } catch {
      // Ignore — still open the store.
    }
    try {
      openAndroidRatingStore(store);
    } catch {
      // Ignore.
    }
  }

  function handlePreviewRate() {
    // Manual preview is QA-only: it exercises the real TWA store routing but
    // intentionally does not mutate automatic-prompt eligibility/cooldowns.
    try {
      if (stores.length && getPreferredRatingStore()) {
        openAndroidRateAppWithFallback(() => {
          router.replace("/rate");
        });
      } else {
        router.replace(stores.length ? "/rate" : "/route");
      }
    } catch {
      router.replace("/rate");
    }
  }

  if (previewPrompt) {
    return (
      <div className="flex size-full flex-col bg-background text-foreground">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <article className="mx-auto w-full max-w-xl px-4 py-6 md:py-8">
            <RatePrompt
              lang={lang}
              onRate={handlePreviewRate}
              onNotNow={() => router.replace("/rate")}
            />
          </article>
        </div>
      </div>
    );
  }

  if (!ready || !stores.length) return null;

  return (
    <div className="flex size-full flex-col bg-background text-foreground">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <article className="mx-auto w-full max-w-xl px-4 py-6 md:py-8">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15"
            >
              <Star className="size-5 text-primary" />
            </span>
            <h1 className="text-xl font-black tracking-tight md:text-2xl">
              {t.ratePageTitle}
            </h1>
          </div>
          <p className="mt-3 text-sm leading-8 text-muted-foreground">
            {t.ratePageBody}
          </p>
          <div className="mt-6 flex flex-col gap-3">
            {stores.includes("bazaar") && <button
              type="button"
              onClick={() => handleStore("bazaar")}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-start transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span>
                <span className="block text-sm font-bold md:text-base">
                  {t.rateBazaar}
                </span>
                <span
                  dir="ltr"
                  className="mt-0.5 block text-xs text-muted-foreground"
                >
                  cafebazaar.ir/app/ir.metto.app
                </span>
              </span>
              <ExternalLink aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            </button>}
            {stores.includes("myket") && <button
              type="button"
              onClick={() => handleStore("myket")}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-start transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span>
                <span className="block text-sm font-bold md:text-base">
                  {t.rateMyket}
                </span>
                <span
                  dir="ltr"
                  className="mt-0.5 block text-xs text-muted-foreground"
                >
                  myket.ir/app/ir.metto.app
                </span>
              </span>
              <ExternalLink aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            </button>}
          </div>
        </article>
      </div>
    </div>
  );
}
