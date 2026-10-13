"use client";

export const RATING_QA_ORIGIN = "namayeshgah-e-shahr-e-aftab";
export const RATING_QA_DEST = "aghdasiyeh";

const QA_PROGRESS_KEY = "metto.appRating.qaProgress.v1";
const QA_ARMED_KEY = "metto.appRating.qaArmed.v1";
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

export function noteRatingQaNavigation(
  pathname: string,
  storage?: SessionLike | null,
): void {
  try {
    const s = storage !== undefined ? storage : getSession();
    if (!s) return;
    if (s.getItem(QA_ARMED_KEY) === "1") return;

    const path = normalizePath(pathname);
    const raw = Number.parseInt(s.getItem(QA_PROGRESS_KEY) ?? "0", 10);
    const progress = Number.isFinite(raw) && raw >= 0 && raw < QA_SEQUENCE.length ? raw : 0;

    let next = 0;
    if (path === QA_SEQUENCE[progress]) {
      next = progress + 1;
    } else if (path === QA_SEQUENCE[0]) {
      next = 1;
    }

    if (next >= QA_SEQUENCE.length) {
      s.setItem(QA_ARMED_KEY, "1");
      s.removeItem(QA_PROGRESS_KEY);
    } else if (next > 0) {
      s.setItem(QA_PROGRESS_KEY, String(next));
    } else {
      s.removeItem(QA_PROGRESS_KEY);
    }
  } catch {
    // QA support must never affect normal navigation.
  }
}

export function isRatingQaTriggerArmed(
  routeKey: string,
  storage?: SessionLike | null,
): boolean {
  try {
    const s = storage !== undefined ? storage : getSession();
    if (!s || s.getItem(QA_ARMED_KEY) !== "1") return false;
    const [origin, dest] = routeKey.split("|");
    return origin === RATING_QA_ORIGIN && dest === RATING_QA_DEST;
  } catch {
    return false;
  }
}

export function consumeRatingQaTrigger(storage?: SessionLike | null): void {
  try {
    const s = storage !== undefined ? storage : getSession();
    if (!s) return;
    s.removeItem(QA_ARMED_KEY);
    s.removeItem(QA_PROGRESS_KEY);
  } catch {
    // Ignore.
  }
}
