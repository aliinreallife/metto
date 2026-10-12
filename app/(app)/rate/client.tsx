"use client";

import { useEffect } from "react";
import { ExternalLink, Star } from "lucide-react";
import { useMetro } from "@/app/providers";
import { STRINGS } from "@/lib/i18n";
import { recordRatingAction } from "@/lib/app-rating";

const BAZAAR_URL = "https://cafebazaar.ir/app/ir.metto.app";
const MYKET_URL = "https://myket.ir/app/ir.metto.app";

export function RatePage() {
  const { lang } = useMetro();
  const t = STRINGS[lang];
  const isFa = lang === "fa";

  useEffect(() => {
    document.title = `${t.ratePageTitle}${isFa ? " | متو" : " | metto"}`;
  }, [t.ratePageTitle, isFa]);

  function handleStore(url: string) {
    try {
      recordRatingAction();
    } catch {
      // Ignore — still open the store.
    }
    try {
      window.location.assign(url);
    } catch {
      // Ignore.
    }
  }

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
            <button
              type="button"
              onClick={() => handleStore(BAZAAR_URL)}
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
            </button>
            <button
              type="button"
              onClick={() => handleStore(MYKET_URL)}
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
            </button>
          </div>
        </article>
      </div>
    </div>
  );
}
