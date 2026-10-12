"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Star, X } from "lucide-react";
import { STRINGS, type Lang } from "@/lib/i18n";
import { isAndroidTwa } from "@/lib/twa";
import { openAndroidRateApp } from "@/lib/twa";
import {
  isEligible,
  loadRatingState,
  notePromptShown,
  recordRatingAction,
  recordRatingDismiss,
} from "@/lib/app-rating";

// Presentational card: neutral copy, no review-gating, no "5 stars" ask.
export function RatePrompt({
  lang,
  onRate,
  onNotNow,
}: {
  lang: Lang;
  onRate: () => void;
  onNotNow: () => void;
}) {
  const t = STRINGS[lang];
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm"
    >
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15"
      >
        <Star className="size-4 text-primary" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 id={titleId} className="text-sm font-bold md:text-base">
          {t.rateTitle}
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">
          {t.rateBody}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onRate}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
          >
            {t.rateNow}
          </button>
          <button
            type="button"
            onClick={onNotNow}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
          >
            {t.rateNotNow}
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={onNotNow}
        aria-label={t.close}
        className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </section>
  );
}

// Host: shows RatePrompt only after a settled successful route, only inside
// the Android TWA, and only when eligibility holds. Route info stays usable
// (inline card below the result, never a blocking dialog).
export function RatePromptHost({
  lang,
  routeSucceeded,
}: {
  lang: Lang;
  routeSucceeded: boolean;
}) {
  const [inTwa, setInTwa] = useState(false);
  const [visible, setVisible] = useState(false);
  const shownRef = useRef(false);

  useEffect(() => {
    let live = true;
    void isAndroidTwa().then((v) => {
      if (live) setInTwa(v);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!routeSucceeded || !inTwa || shownRef.current) return;
    try {
      const state = loadRatingState();
      if (!isEligible(state, Date.now())) return;
      shownRef.current = true;
      notePromptShown();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- eligibility sync from localStorage/TWA (external systems) on settled route success; guarded by shownRef so it fires once.
      setVisible(true);
    } catch {
      // Corrupt storage must never break route planning.
    }
  }, [routeSucceeded, inTwa]);

  // Escape dismisses without rating.
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        try {
          recordRatingDismiss();
        } catch {
          // Ignore.
        }
        setVisible(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible]);

  if (!visible) return null;

  return (
    <RatePrompt
      lang={lang}
      onRate={() => {
        try {
          recordRatingAction();
        } catch {
          // Ignore — still forward to the store.
        }
        setVisible(false);
        try {
          openAndroidRateApp();
        } catch {
          // Ignore.
        }
      }}
      onNotNow={() => {
        try {
          recordRatingDismiss();
        } catch {
          // Ignore.
        }
        setVisible(false);
      }}
    />
  );
}

// Permanent manual entry (footer/About area). Always available regardless of
// automatic-prompt state. Inside the TWA it opens the native helper;
// outside it navigates to the /rate fallback page.
export function RateMettoAction({
  lang,
  className,
}: {
  lang: Lang;
  className?: string;
}) {
  const t = STRINGS[lang];
  const [inTwa, setInTwa] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let live = true;
    void isAndroidTwa().then((v) => {
      if (live) setInTwa(v);
    });
    return () => {
      live = false;
    };
  }, []);

  function handleClick() {
    try {
      recordRatingAction();
    } catch {
      // Ignore — still forward.
    }
    try {
      if (inTwa) {
        openAndroidRateApp();
      } else {
        router.push("/rate");
      }
    } catch {
      // Ignore.
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={
        className ??
        "shrink-0 whitespace-nowrap text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      }
    >
      {t.rateNow}
    </button>
  );
}
