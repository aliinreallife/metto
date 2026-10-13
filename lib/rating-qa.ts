"use client";

export const RATING_QA_ORIGIN = "namayeshgah-e-shahr-e-aftab";
export const RATING_QA_DEST = "aghdasiyeh";

const QA_PROGRESS_KEY = "metto.appRating.qaProgress.v1";
const QA_ARMED_KEY = "metto.appRating.qaArmed.v1";
const QA_PRESENTING_KEY = "metto.appRating.qaPresenting.v1";
const QA_SKIP_SESSION_MARK_KEY = "metto.appRating.qaSkipSessionMark.v1";
const QA_SEQUENCE = ["/route", "/stations", "/nearby", "/map", "/route"] as const;

type SessionLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function getSession(): SessionLike | null {
  try {
    return typeof sessionStorage !== "undefined" ? sessionStorage : null;
  } catch {
    return null;
  }
}

function normalizePath(pathname: string): string {
  return pathname === "/" ? "/route" : pathname;
}

function currentLocationMatchesQaRoute(): boolean {
  try {
    if (typeof window === "undefined") return false;
    if (normalizePath(window.location.pathname) !== "/route") return false;
    const params = new URLSearchParams(window.location.search);
    return (
      params.get("from") === RATING_QA_ORIGIN &&
      params.get("to") === RATING_QA_DEST
    );
  } catch {
    return false;
  }
}

export function noteRatingQaNavigation(
  pathname: string,
  storage?: SessionLike | null,
): void {
  try {
    const s = storage !== undefined ? storage : getSession();
    if (!s) return;

    const path = normalizePath(pathname);

    // Leaving the route while a QA prompt is on screen abandons that one
    // forced presentation. A fresh sequence is required to force it again.
    if (s.getItem(QA_PRESENTING_KEY) === "1") {
      if (path !== "/route") {
        s.removeItem(QA_PRESENTING_KEY);
        s.removeItem(QA_PROGRESS_KEY);
      }
      return;
    }

    if (s.getItem(QA_ARMED_KEY) === "1") return;

    const raw = Number.parseInt(s.getItem(QA_PROGRESS_KEY) ?? "0", 10);
    const progress = Number.isFinite(raw) && raw >= 0 && raw < QA_SEQUENCE.length ? raw : 0;

    let next = 0;
    if (path === QA_SEQUENCE[progress]) {
      next = progress + 1;
    } else if (path === QA_SEQUENCE[0]) {
      next = 1;
    }

    if (next >= QA_SEQUENCE.length) {
      if (currentLocationMatchesQaRoute()) {
        s.setItem(QA_ARMED_KEY, "1");
        s.removeItem(QA_PROGRESS_KEY);
      } else {
        s.setItem(QA_PROGRESS_KEY, "1");
      }
    } else if (next > 0) {
      s.setItem(QA_PROGRESS_KEY, String(next));
    } else {
      s.removeItem(QA_PROGRESS_KEY);
    }
  } catch {
    // QA support must never affect normal navigation.
  }
}

/** True only for the chosen route while a forced QA display is armed/active. */
export function isRatingQaOverrideActive(storage?: SessionLike | null): boolean {
  try {
    const s = storage !== undefined ? storage : getSession();
    if (!s || !currentLocationMatchesQaRoute()) return false;
    return (
      s.getItem(QA_ARMED_KEY) === "1" ||
      s.getItem(QA_PRESENTING_KEY) === "1"
    );
  } catch {
    return false;
  }
}

/** Called exactly when RatePromptHost counts a display. */
export function noteRatingQaPromptShown(storage?: SessionLike | null): boolean {
  try {
    const s = storage !== undefined ? storage : getSession();
    if (
      !s ||
      s.getItem(QA_ARMED_KEY) !== "1" ||
      !currentLocationMatchesQaRoute()
    ) {
      return false;
    }
    s.removeItem(QA_ARMED_KEY);
    s.setItem(QA_PRESENTING_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

/**
 * Finish a forced QA prompt without touching the real rating state. The
 * one-shot marker also suppresses RatePromptHost's immediately-following
 * markSessionPrompted() call after dismiss/rate.
 */
export function finishRatingQaOverride(storage?: SessionLike | null): boolean {
  try {
    const s = storage !== undefined ? storage : getSession();
    if (!s || s.getItem(QA_PRESENTING_KEY) !== "1") return false;
    s.removeItem(QA_PRESENTING_KEY);
    s.removeItem(QA_ARMED_KEY);
    s.removeItem(QA_PROGRESS_KEY);
    s.setItem(QA_SKIP_SESSION_MARK_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

/** Consume the one markSessionPrompted() call that follows a QA action. */
export function consumeRatingQaSessionMarkSkip(
  storage?: SessionLike | null,
): boolean {
  try {
    const s = storage !== undefined ? storage : getSession();
    if (!s || s.getItem(QA_SKIP_SESSION_MARK_KEY) !== "1") return false;
    s.removeItem(QA_SKIP_SESSION_MARK_KEY);
    return true;
  } catch {
    return false;
  }
}
