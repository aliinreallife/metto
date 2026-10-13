import { describe, expect, it } from "vitest";
import {
  APP_RATING_KEY,
  DISMISS_COOLDOWN_MS,
  defaultRatingState,
  hasSessionPrompted,
  isEligible,
  loadRatingState,
  markSessionPrompted,
  notePromptShown,
  recordRatingAction,
  recordRatingDismiss,
  recordRouteSuccess,
  shouldPresentPrompt,
  toLocalDayKey,
  type PromptGate,
} from "./app-rating";

function memStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  };
}

function localDate(y: number, m: number, d: number, h = 12): Date {
  return new Date(y, m - 1, d, h, 0, 0);
}

function succeedOnDays(storage: ReturnType<typeof memStorage>, dates: Date[]) {
  for (const d of dates) recordRouteSuccess(d, storage);
}

describe("app-rating storage key", () => {
  it("uses a versioned key", () => {
    expect(APP_RATING_KEY).toBe("metto.appRating.v1");
  });
});

describe("eligibility", () => {
  it("fresh user is not eligible", () => {
    const s = memStorage();
    const state = loadRatingState(s);
    expect(state.successCount).toBe(0);
    expect(isEligible(state, Date.now())).toBe(false);
  });

  it("4 successful routes is not enough", () => {
    const s = memStorage();
    succeedOnDays(s, [
      localDate(2026, 1, 1),
      localDate(2026, 1, 2),
      localDate(2026, 1, 3),
      localDate(2026, 1, 4),
    ]);
    // Bump to 4 successes across 3+ days — still below the 5-route floor.
    const state = loadRatingState(s);
    expect(state.successCount).toBe(4);
    expect(isEligible(state, localDate(2026, 1, 5).getTime())).toBe(false);
  });

  it("5 routes on only 1-2 distinct days is not enough", () => {
    const s = memStorage();
    succeedOnDays(s, [
      localDate(2026, 2, 1, 9),
      localDate(2026, 2, 1, 10),
      localDate(2026, 2, 1, 11),
      localDate(2026, 2, 2, 9),
      localDate(2026, 2, 2, 10),
    ]);
    const state = loadRatingState(s);
    expect(state.successCount).toBe(5);
    expect(state.days.length).toBeLessThanOrEqual(2);
    expect(isEligible(state, localDate(2026, 2, 3).getTime())).toBe(false);
  });

  it("5+ successful routes on 3 distinct days becomes eligible", () => {
    const s = memStorage();
    succeedOnDays(s, [
      localDate(2026, 3, 1),
      localDate(2026, 3, 1, 14),
      localDate(2026, 3, 2),
      localDate(2026, 3, 3),
      localDate(2026, 3, 3, 15),
    ]);
    const state = loadRatingState(s);
    expect(state.successCount).toBe(5);
    expect(state.days.length).toBe(3);
    expect(isEligible(state, localDate(2026, 3, 4).getTime())).toBe(true);
  });

  it("dismissal starts a 90-day cooldown", () => {
    const s = memStorage();
    succeedOnDays(s, [
      localDate(2026, 3, 1),
      localDate(2026, 3, 2),
      localDate(2026, 3, 3),
      localDate(2026, 3, 3, 14),
      localDate(2026, 3, 4),
    ]);
    const dismissAt = localDate(2026, 3, 5).getTime();
    notePromptShown(s);
    const after = recordRatingDismiss(dismissAt, s);
    expect(after.promptsShown).toBe(1);
    // One day later: still cooling down.
    expect(
      isEligible(loadRatingState(s), dismissAt + 24 * 3_600_000),
    ).toBe(false);
    // Just before 90 days: still cooling down.
    expect(
      isEligible(
        loadRatingState(s),
        dismissAt + DISMISS_COOLDOWN_MS - 1_000,
      ),
    ).toBe(false);
  });

  it("prompt can return after the first cooldown", () => {
    const s = memStorage();
    succeedOnDays(s, [
      localDate(2026, 3, 1),
      localDate(2026, 3, 2),
      localDate(2026, 3, 3),
      localDate(2026, 3, 3, 14),
      localDate(2026, 3, 4),
    ]);
    const dismissAt = localDate(2026, 3, 5).getTime();
    notePromptShown(s);
    recordRatingDismiss(dismissAt, s);
    expect(
      isEligible(loadRatingState(s), dismissAt + DISMISS_COOLDOWN_MS + 1_000),
    ).toBe(true);
  });

  it("second dismissal permanently disables automatic prompting", () => {
    const s = memStorage();
    succeedOnDays(s, [
      localDate(2026, 3, 1),
      localDate(2026, 3, 2),
      localDate(2026, 3, 3),
      localDate(2026, 3, 4),
      localDate(2026, 3, 5),
    ]);
    const first = localDate(2026, 3, 6).getTime();
    notePromptShown(s);
    recordRatingDismiss(first, s);
    const second = first + DISMISS_COOLDOWN_MS + 2_000;
    // Second prompt would have shown (eligible again) — user dismisses it.
    expect(isEligible(loadRatingState(s), second)).toBe(true);
    notePromptShown(s);
    recordRatingDismiss(second, s);
    const state = loadRatingState(s);
    expect(state.promptsShown).toBe(2);
    // Even far in the future, never eligible again.
    expect(
      isEligible(loadRatingState(s), second + DISMISS_COOLDOWN_MS * 4),
    ).toBe(false);
  });

  it("pressing Rate permanently disables automatic prompting", () => {
    const s = memStorage();
    succeedOnDays(s, [
      localDate(2026, 3, 1),
      localDate(2026, 3, 2),
      localDate(2026, 3, 3),
      localDate(2026, 3, 4),
      localDate(2026, 3, 5),
    ]);
    expect(isEligible(loadRatingState(s), localDate(2026, 3, 6).getTime())).toBe(
      true,
    );
    recordRatingAction(s);
    const state = loadRatingState(s);
    expect(state.completed).toBe(true);
    expect(
      isEligible(loadRatingState(s), localDate(2027, 3, 6).getTime()),
    ).toBe(false);
  });

  it("bad/corrupt storage fails safely", () => {
    expect(loadRatingState(memStorage({ [APP_RATING_KEY]: "not-json{" }))).toEqual(
      defaultRatingState(),
    );
    expect(
      loadRatingState(memStorage({ [APP_RATING_KEY]: JSON.stringify({ successCount: "lots", days: [42, null] }) })),
    ).toEqual(defaultRatingState());
    expect(
      loadRatingState(memStorage({ [APP_RATING_KEY]: "null" })),
    ).toEqual(defaultRatingState());
    // recordRouteSuccess on throwing storage never throws.
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(() => recordRouteSuccess(new Date(), broken)).not.toThrow();
    expect(() => recordRatingDismiss(Date.now(), broken)).not.toThrow();
    expect(() => recordRatingAction(broken)).not.toThrow();
  });

  it("date counting uses distinct local calendar days", () => {
    const s = memStorage();
    // Same local day twice (morning + evening) counts once.
    recordRouteSuccess(localDate(2026, 4, 10, 9), s);
    recordRouteSuccess(localDate(2026, 4, 10, 20), s);
    let state = loadRatingState(s);
    expect(state.successCount).toBe(2);
    expect(state.days).toEqual([toLocalDayKey(localDate(2026, 4, 10, 9))]);
    // Two more distinct local days.
    recordRouteSuccess(localDate(2026, 4, 11, 9), s);
    recordRouteSuccess(localDate(2026, 4, 12, 9), s);
    state = loadRatingState(s);
    expect(state.days.length).toBe(3);
    expect(new Set(state.days).size).toBe(3);
  });

  it("toLocalDayKey formats local (not UTC) dates", () => {
    expect(toLocalDayKey(localDate(2026, 1, 5))).toBe("2026-01-05");
    expect(toLocalDayKey(localDate(2026, 12, 31, 23))).toBe("2026-12-31");
  });

  it("dismissal records only the timestamp (display counting stays separate)", () => {
    const s = memStorage();
    notePromptShown(s);
    const after = recordRatingDismiss(localDate(2026, 5, 1).getTime(), s);
    expect(after.promptsShown).toBe(1);
    expect(after.dismissedAtMs).toBe(localDate(2026, 5, 1).getTime());
  });
});

describe("session guard (one presentation per session)", () => {
  it("starts unprompted and records any outcome", () => {
    const s = memStorage();
    expect(hasSessionPrompted(s)).toBe(false);
    markSessionPrompted(s);
    expect(hasSessionPrompted(s)).toBe(true);
  });

  it("fails safely on broken session storage", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(hasSessionPrompted(broken)).toBe(false);
    expect(() => markSessionPrompted(broken)).not.toThrow();
  });

  it("does not read or write the persistent key", () => {
    const s = memStorage();
    markSessionPrompted(s);
    // Persistent eligibility is untouched by the session flag.
    expect(loadRatingState(s)).toEqual(defaultRatingState());
  });
});

describe("shouldPresentPrompt gate", () => {
  const base: PromptGate = {
    routeSucceeded: true,
    inTwa: true,
    eligible: true,
    sessionDone: false,
    pageVisible: true,
    editingInputs: false,
    modalOpen: false,
  };

  it("presents only when every condition holds", () => {
    expect(shouldPresentPrompt(base)).toBe(true);
  });

  const withheld: Array<[string, PromptGate]> = [
    ["no route yet", { ...base, routeSucceeded: false }],
    ["outside the TWA", { ...base, inTwa: false }],
    ["not eligible", { ...base, eligible: false }],
    ["already shown this session", { ...base, sessionDone: true }],
    ["document hidden", { ...base, pageVisible: false }],
    ["user is editing inputs", { ...base, editingInputs: true }],
    ["a dialog is open", { ...base, modalOpen: true }],
  ];
  it.each(withheld)("withholds the card: %s", (_name, gate) => {
    expect(shouldPresentPrompt(gate)).toBe(false);
  });
});
