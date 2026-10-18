"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Star, X } from "lucide-react";
import { STRINGS, type Lang } from "@/lib/i18n";
import {
  getAvailableRatingStores,
  getPreferredRatingStore,
  isAndroidTwa,
  openAndroidRateAppWithFallback,
} from "@/lib/twa";
import {
  hasSessionPrompted,
  isEligible,
  loadRatingState,
  markSessionPrompted,
  notePromptShown,
  recordRatingAction,
  recordRatingDismiss,
  shouldPresentPrompt,
} from "@/lib/app-rating";
import {
  consumeRatingQaSessionMarkSkip,
  finishRatingQaOverride,
  isRatingQaOverrideActive,
  noteRatingQaPromptShown,
} from "@/lib/rating-qa";

// Settle delay before the automatic card may appear: the route result must
// be visible and stable first (never pops during calculation, typing, or a
// background return). Non-blocking; cancelled on any change below.
const PROMPT_SETTLE_MS = 2000;
// Retries while the user is editing inputs or a dialog is open: the card
// waits instead of interrupting. Bounded so timers always terminate.
const PROMPT_MAX_DEFERS = 4;

// Presentational card: neutral copy, no review-gating, no "5 stars" ask.
// onNotNow receives true when activated from the keyboard (Enter/Space give
// click detail 0) so the host can restore focus; pointer users are left
// alone.
export function RatePrompt({
  lang,
  onRate,
  onNotNow,
}: {
  lang: Lang;
  onRate: () => void;
  onNotNow: (keyboard: boolean) => void;
}) {
  const t = STRINGS[lang];
  const titleId = useId();
  const eyebrow = lang === "fa" ? "یک درخواست کوچک" : "A small favor";
  const reassurance =
    lang === "fa"
      ? "بدون مزاحمت؛ اگر نخواهی، تا مدت طولانی دوباره نشان داده نمی‌شود."
      : "No pressure — if you skip it, we won’t ask again for a long time.";

  return (
    <section
      aria-labelledby={titleId}
      className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_10px_30px_rgba(0,0,0,0.07)]"
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 start-0 w-[3px] bg-primary"
      />
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 p-4">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary"
        >
          <Star className="size-[18px]" />
        </span>

        <div className="min-w-0 pt-0.5">
          <span className="text-[10px] font-black text-primary">
            {eyebrow}
          </span>
          <h2
            id={titleId}
            className="mt-0.5 text-sm font-black tracking-tight md:text-base"
          >
            {t.rateTitle}
          </h2>
          <p className="mt-1 text-xs leading-6 text-muted-foreground md:text-sm">
            {t.rateBody}
          </p>

          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2 max-[360px]:grid-cols-1">
            <button
              type="button"
              onClick={onRate}
              className="flex min-h-[44px] items-center justify-center rounded-xl bg-primary px-4 py-2 text-xs font-black text-primary-foreground shadow-[0_6px_14px_rgba(204,14,45,0.18)] transition-[transform,background-color,box-shadow] hover:bg-primary/90 hover:shadow-[0_8px_18px_rgba(204,14,45,0.23)] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
            >
              {t.rateNow}
            </button>
            <button
              type="button"
              onClick={(e) => onNotNow(e.detail === 0)}
              className="flex min-h-[44px] items-center justify-center rounded-xl border border-border bg-muted/20 px-4 py-2 text-xs font-bold text-muted-foreground transition-[transform,background-color,color] hover:bg-muted/50 hover:text-foreground active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
            >
              {t.rateNotNow}
            </button>
          </div>

          <p className="mt-2.5 flex items-start gap-1.5 text-[10px] leading-5 text-muted-foreground/80">
            <span
              aria-hidden="true"
              className="mt-[7px] size-1.5 shrink-0 rounded-full bg-muted-foreground/35"
            />
            <span>{reassurance}</span>
          </p>
        </div>

        <button
          type="button"
          onClick={(e) => onNotNow(e.detail === 0)}
          aria-label={t.close}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
    </section>
  );
}

// True while the user is actively editing route inputs (comboboxes keep
// focus while typing/selecting). The card waits instead of interrupting.
function isEditingInputs(): boolean {
  try {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    if (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      el.isContentEditable
    ) {
      return true;
    }
    const role = typeof el.getAttribute === "function" && el.getAttribute("role");
    return role === "combobox" || role === "searchbox" || role === "listbox";
  } catch {
    return false;
  }
}

// True while a blocking dialog/sheet is open. The inline card is
// non-blocking, but it still waits rather than stacking onto a modal.
function isModalOpen(): boolean {
  try {
    return !!document.querySelector('[role="dialog"], [role="alertdialog"]');
  } catch {
    return false;
  }
}

function isPageVisible(): boolean {
  try {
    return document.visibilityState === "visible";
  } catch {
    return true;
  }
}

// After a keyboard dismissal the tapped button unmounts, so focus would
// fall to <body>. Land it back in the route-result area instead — without
// scrolling the page. Pointer users are left alone.
function restoreRouteFocus(): void {
  try {
    const main = document.getElementById("main-content");
    if (main instanceof HTMLElement) {
      main.focus({ preventScroll: true });
    }
  } catch {
    // Ignore — focus simply stays where the browser puts it.
  }
}

// Complete the hidden QA presentation without leaking its interaction into
// the real one-per-session guard. Persistent rating state was already skipped
// by recordRatingDismiss/recordRatingAction while the QA override was active.
function finishQaPresentation(): boolean {
  try {
    if (!finishRatingQaOverride()) return false;
    consumeRatingQaSessionMarkSkip();
    return true;
  } catch {
    return false;
  }
}

// Host: production automatic prompting still happens only after a settled
// successful route inside the Android TWA. The hidden QA sequence is the only
// exception: it may force the exact same card on web/PWA too so the flow can
// be verified on every surface. Route info stays usable (inline card below the
// result, never a blocking dialog, never auto-focus, never focus-trapped).
export function RatePromptHost({
  lang,
  routeSucceeded,
  routeKey,
}: {
  lang: Lang;
  routeSucceeded: boolean;
  /** Stable key of the current planning (origin|dest|mode|time). */
  routeKey: string;
}) {
  const [canRate, setCanRate] = useState(false);
  const [visible, setVisible] = useState(false);
  // Re-arms the settle delay when the tab returns from the background: the
  // result must settle again while visible before anything may appear.
  const [visibleTick, setVisibleTick] = useState(0);
  const firedRef = useRef(false);
  const defersRef = useRef(0);
  const router = useRouter();

  useEffect(() => {
    let live = true;
    void isAndroidTwa().then((v) => {
      if (live) setCanRate(v && getAvailableRatingStores().length > 0);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible]);

  // Track background/foreground so a background return restarts the settle
  // delay instead of popping the card immediately.
  useEffect(() => {
    const onVisibility = () => {
      try {
        if (document.visibilityState === "visible") {
          setVisibleTick((n) => n + 1);
        }
      } catch {
        // Ignore.
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  function dismiss(keyboard: boolean): void {
    try {
      recordRatingDismiss();
    } catch {
      // Ignore.
    }
    const qaFinished = finishQaPresentation();
    if (!qaFinished) {
      try {
        markSessionPrompted();
      } catch {
        // Ignore.
      }
    }
    setVisible(false);
    if (keyboard) restoreRouteFocus();
  }

  function act(): void {
    // Launching the store flow counts as completion: we cannot know whether
    // a review was submitted after leaving Metto. The hidden QA presentation
    // deliberately leaves the user's real rating state unchanged.
    try {
      recordRatingAction();
    } catch {
      // Ignore — still forward.
    }
    const qaFinished = finishQaPresentation();
    if (!qaFinished) {
      try {
        markSessionPrompted();
      } catch {
        // Ignore.
      }
    }
    setVisible(false);
    try {
      if (canRate && getPreferredRatingStore()) {
        openAndroidRateAppWithFallback(() => {
          router.push("/rate");
        });
      } else {
        // Both markets installed on an APK with unknown installer: choose.
        router.push("/rate");
      }
    } catch {
      // Silent — never an error dialog for the rating action.
    }
  }

  useEffect(() => {
    if (!routeSucceeded || firedRef.current || visible) return;
    if (!canRate && !isRatingQaOverrideActive()) return;
    let cancelled = false;
    let timer: number | undefined;

    const attempt = () => {
      if (cancelled || firedRef.current) return;
      try {
        const qaActive = isRatingQaOverrideActive();
        if (!canRate && !qaActive) return;
        if (hasSessionPrompted()) return;
        const eligible = isEligible(loadRatingState(), Date.now());
        if (
          shouldPresentPrompt({
            routeSucceeded: true,
            // Production requires the TWA; the hidden QA override is the
            // sole non-TWA path through this presentation gate.
            inTwa: canRate || qaActive,
            eligible,
            sessionDone: false,
            pageVisible: isPageVisible(),
            editingInputs: isEditingInputs(),
            modalOpen: isModalOpen(),
          })
        ) {
          firedRef.current = true;
          // Transition QA armed -> presenting before the normal bookkeeping;
          // app-rating sees the override as active and therefore does not
          // mutate persistent/session production state.
          noteRatingQaPromptShown();
          markSessionPrompted();
          notePromptShown();
          // Never auto-focus: the card must not steal keyboard or
          // screen-reader focus from the route experience.
          setVisible(true);
          return;
        }
        // Eligible but the moment is wrong (typing, dialog, hidden tab):
        // wait for a better moment instead of interrupting. Bounded.
        if (
          eligible &&
          defersRef.current < PROMPT_MAX_DEFERS &&
          isPageVisible()
        ) {
          defersRef.current += 1;
          timer = window.setTimeout(attempt, PROMPT_SETTLE_MS);
        }
      } catch {
        // Corrupt storage etc. must never break route planning.
      }
    };

    // Settle delay: the result must be visible and stable first.
    timer = window.setTimeout(attempt, PROMPT_SETTLE_MS);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [routeSucceeded, routeKey, canRate, visibleTick, visible]);

  if (!visible) return null;

  return (
    <RatePrompt
      lang={lang}
      onRate={act}
      onNotNow={(keyboard) => dismiss(keyboard)}
    />
  );
}

// Manual entry (currently not rendered in the footers). Always available regardless of
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
  const [canRate, setCanRate] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let live = true;
    void isAndroidTwa().then((v) => {
      if (live) setCanRate(v && getAvailableRatingStores().length > 0);
    });
    return () => {
      live = false;
    };
  }, []);

  function handleClick() {
    // Voluntary rating: independent of automatic-prompt state (promptsShown,
    // cooldown, completed never gate this). Completion is recorded first so
    // the automatic prompt never fires afterwards.
    try {
      recordRatingAction();
    } catch {
      // Ignore — still forward.
    }
    try {
      if (canRate && getPreferredRatingStore()) {
        openAndroidRateAppWithFallback(() => {
          router.push("/rate");
        });
      } else if (canRate) {
        router.push("/rate");
      }
    } catch {
      // Ignore.
    }
  }

  if (!canRate) return null;

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
