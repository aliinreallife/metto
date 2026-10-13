"use client";

import { isRatingQaOverrideActive } from "./rating-qa";

// Respectful automatic rating eligibility (local-only, pure/testable).
//
// - Local browser storage only. No account, analytics, server, fingerprint.
// - Automatic prompting happens only inside the Android TWA (callers gate on
//   lib/twa.ts); this module only tracks counts/days/cooldowns.
// - A route counts only when the caller reports a genuine success
//   (see home-page: route.status === "complete"); re-renders never count.
// - Days are local calendar dates (YYYY-MM-DD via getFullYear/Month/Date),
//   never UTC dates.
// - A session-only QA mode can temporarily skip these limits on one specific
//   route; it never writes the persistent counters/cooldown/completed state.

export const APP_RATING_KEY = "metto.appRating.v1";

export const MIN_SUCCESS_ROUTES = 5;
export const MIN_DISTINCT_DAYS = 3;
export const DISMISS_COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000;
export const MAX_AUTO_PROMPTS = 2;

export type AppRatingState = {
  version: 1;
  /** Genuinely successful route plans (caller-gated, never re-renders). */
  successCount: number;
  /** Distinct local calendar days with at least one success. */
  days: string[];
  /** Lifetime automatic prompt displays (max 2). */
  promptsShown: number;
  /** Last "Not now" timestamp (epoch ms), or null. */
  dismissedAtMs: number | null;
  /** True once the user pressed "Rate Metto" (launch = completion). */
  completed: boolean;
};

export function defaultRatingState(): AppRatingState {
  return {
    version: 1,
    successCount: 0,
    days: [],
    promptsShown: 0,
    dismissedAtMs: null,
    completed: false,
  };
}

/** Local calendar day key YYYY-MM-DD (never UTC). */
export function toLocalDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function sanitize(raw: unknown): AppRatingState {
  const base = defaultRatingState();
  if (typeof raw !== "object" || raw === null) return base;
  const r = raw as Record<string, unknown>;
  const successCount =
    typeof r.successCount === "number" &&
    Number.isFinite(r.successCount) &&
    r.successCount >= 0
      ? Math.floor(r.successCount)
      : 0;
  const days = Array.isArray(r.days)
    ? [...new Set(r.days.filter((d): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)))].slice(0, 3660)
    : [];
  const promptsShown =
    typeof r.promptsShown === "number" &&
    Number.isFinite(r.promptsShown) &&
    r.promptsShown >= 0
      ? Math.min(Math.floor(r.promptsShown), MAX_AUTO_PROMPTS + 10)
      : 0;
  const dismissedAtMs =
    typeof r.dismissedAtMs === "number" && Number.isFinite(r.dismissedAtMs) && r.dismissedAtMs >= 0
      ? r.dismissedAtMs
      : null;
  const completed = r.completed === true;
  return { version: 1, successCount, days, promptsShown, dismissedAtMs, completed };
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function getStorage(): StorageLike | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
    return null;
  } catch {
    return null;
  }
}

export function loadRatingState(storage?: StorageLike | null): AppRatingState {
  try {
    const s = storage !== undefined ? storage : getStorage();
    if (!s) return defaultRatingState();
    const raw = s.getItem(APP_RATING_KEY);
    if (!raw) return defaultRatingState();
    return sanitize(JSON.parse(raw));
  } catch {
    return defaultRatingState();
  }
}

export function saveRatingState(
  state: AppRatingState,
  storage?: StorageLike | null,
): void {
  try {
    const s = storage !== undefined ? storage : getStorage();
    if (!s) return;
    s.setItem(APP_RATING_KEY, JSON.stringify(state));
  } catch {
    // Storage full/private mode — eligibility simply stays in-memory.
  }
}

/** Pure in normal use: is this stored state eligible for an automatic prompt? */
export function isEligible(state: AppRatingState, nowMs: number): boolean {
  if (isRatingQaOverrideActive()) return true;
  if (state.completed) return false;
  if (state.promptsShown >= MAX_AUTO_PROMPTS) return false;
  if (state.successCount < MIN_SUCCESS_ROUTES) return false;
  if (state.days.length < MIN_DISTINCT_DAYS) return false;
  if (
    state.dismissedAtMs !== null &&
    nowMs - state.dismissedAtMs < DISMISS_COOLDOWN_MS
  ) {
    return false;
  }
  return true;
}

/** Record one genuine route-planning success (caller-gated). Never throws. */
export function recordRouteSuccess(
  now: Date = new Date(),
  storage?: StorageLike | null,
): AppRatingState {
  try {
    const state = loadRatingState(storage);
    const day = toLocalDayKey(now);
    const days = state.days.includes(day) ? state.days : [...state.days, day];
    const next: AppRatingState = {
      ...state,
      successCount: state.successCount + 1,
      days,
    };
    saveRatingState(next, storage);
    return next;
  } catch {
    return defaultRatingState();
  }
}

/** The automatic prompt was displayed (counts toward the lifetime max). */
export function notePromptShown(storage?: StorageLike | null): AppRatingState {
  try {
    const state = loadRatingState(storage);
    if (isRatingQaOverrideActive()) return state;
    const next: AppRatingState = {
      ...state,
      promptsShown: state.promptsShown + 1,
    };
    saveRatingState(next, storage);
    return next;
  } catch {
    return defaultRatingState();
  }
}

/** "Not now": 90-day cooldown. Display counting stays in notePromptShown. */
export function recordRatingDismiss(
  nowMs: number = Date.now(),
  storage?: StorageLike | null,
): AppRatingState {
  try {
    const state = loadRatingState(storage);
    if (isRatingQaOverrideActive()) return state;
    const next: AppRatingState = {
      ...state,
      dismissedAtMs: nowMs,
    };
    saveRatingState(next, storage);
    return next;
  } catch {
    return defaultRatingState();
  }
}

/**
 * "Rate Metto" pressed: launching the store flow counts as completion
 * (we cannot know if a review was submitted). Manual entry stays available.
 */
export function recordRatingAction(storage?: StorageLike | null): AppRatingState {
  try {
    const state = loadRatingState(storage);
    if (isRatingQaOverrideActive()) return state;
    const next: AppRatingState = {
      ...state,
      completed: true,
    };
    saveRatingState(next, storage);
    return next;
  } catch {
    return defaultRatingState();
  }
}

// ---- Session guard: at most one automatic presentation per session ----
//
// sessionStorage only (tab lifetime). This is NOT the source of truth for
// the 90-day cooldown or lifetime limits — those stay in metto.appRating.v1
// above. The session flag merely prevents a second presentation after
// remounts/navigation within the same tab (shown, dismissed, or acted all
// block the rest of the session).

export const APP_RATING_SESSION_KEY = "metto.appRating.session.v1";

function getSessionStorage(): StorageLike | null {
  try {
    if (typeof sessionStorage !== "undefined") return sessionStorage;
    return null;
  } catch {
    return null;
  }
}

/** True once the prompt was shown, dismissed, or acted on this session. */
export function hasSessionPrompted(session?: StorageLike | null): boolean {
  try {
    if (isRatingQaOverrideActive()) return false;
    const s = session !== undefined ? session : getSessionStorage();
    if (!s) return false;
    return s.getItem(APP_RATING_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

/** Mark this session as done (shown, dismissed, or acted — all block). */
export function markSessionPrompted(session?: StorageLike | null): void {
  try {
    if (isRatingQaOverrideActive()) return;
    const s = session !== undefined ? session : getSessionStorage();
    if (!s) return;
    s.setItem(APP_RATING_SESSION_KEY, "1");
  } catch {
    // Private mode etc. — the per-mount guard still applies.
  }
}

// ---- Presentation gate (pure): every condition in one testable place ----

export type PromptGate = {
  /** A successful route result is currently rendered and stable. */
  routeSucceeded: boolean;
  /** Inside the Android TWA (automatic prompts never fire elsewhere). */
  inTwa: boolean;
  /** Persistent eligibility (5+/3+/cooldown/lifetime) already checked. */
  eligible: boolean;
  /** A prompt was already shown/dismissed/acted on this session. */
  sessionDone: boolean;
  /** Document is currently visible (never pop on background return). */
  pageVisible: boolean;
  /** Origin/destination input has focus or the user is otherwise editing. */
  editingInputs: boolean;
  /** A blocking dialog/sheet is open. */
  modalOpen: boolean;
};

/**
 * True only when the automatic card may be presented right now. The card
 * itself is non-blocking and never steals focus; this gate keeps it from
 * ever appearing at a bad moment.
 */
export function shouldPresentPrompt(g: PromptGate): boolean {
  return (
    g.routeSucceeded &&
    g.inTwa &&
    g.eligible &&
    !g.sessionDone &&
    g.pageVisible &&
    !g.editingInputs &&
    !g.modalOpen
  );
}
