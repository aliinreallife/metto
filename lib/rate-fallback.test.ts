import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RATE_APP_INTENT_URI,
  RATE_FALLBACK_URL,
  openAndroidRateAppWithFallback,
} from "./twa";

function stubFallbackEnv(opts: {
  pathname?: string;
  visibility?: string;
} = {}) {
  const winListeners: Record<string, Array<() => void>> = {};
  const docListeners: Record<string, Array<() => void>> = {};
  const location = {
    href: "https://metto.ir/route",
    pathname: opts.pathname ?? "/route",
  };
  const doc = {
    visibilityState: opts.visibility ?? "visible",
    addEventListener: (t: string, fn: () => void) => {
      (docListeners[t] ??= []).push(fn);
    },
    removeEventListener: (t: string, fn: () => void) => {
      docListeners[t] = (docListeners[t] ?? []).filter((f) => f !== fn);
    },
  };
  vi.stubGlobal(
    "window",
    {
      location,
      setTimeout: (fn: () => void, ms: number) =>
        setTimeout(fn, ms),
      clearTimeout: (id: ReturnType<typeof setTimeout>) =>
        clearTimeout(id),
      addEventListener: (t: string, fn: () => void) => {
        (winListeners[t] ??= []).push(fn);
      },
      removeEventListener: (t: string, fn: () => void) => {
        winListeners[t] = (winListeners[t] ?? []).filter((f) => f !== fn);
      },
    },
  );
  vi.stubGlobal("document", doc);
  return {
    location,
    doc,
    emitDoc: (t: string) => {
      for (const fn of docListeners[t] ?? []) fn();
    },
    emitWin: (t: string) => {
      for (const fn of winListeners[t] ?? []) fn();
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("RATE_APP_INTENT_URI fallback", () => {
  it("carries S.browser_fallback_url to https://metto.ir/rate", () => {
    expect(RATE_FALLBACK_URL).toBe("https://metto.ir/rate");
    expect(RATE_APP_INTENT_URI).toContain(
      "S.browser_fallback_url=https%3A%2F%2Fmetto.ir%2Frate",
    );
    expect(RATE_APP_INTENT_URI).toContain("package=ir.metto.app");
  });
});

describe("openAndroidRateAppWithFallback", () => {
  it("fires the native intent immediately", () => {
    vi.useFakeTimers();
    const env = stubFallbackEnv();
    const goRate = vi.fn();
    openAndroidRateAppWithFallback(goRate);
    expect(env.location.href).toBe(RATE_APP_INTENT_URI);
    expect(goRate).not.toHaveBeenCalled();
  });

  it("falls back to /rate when the page stays visible (old wrapper)", () => {
    vi.useFakeTimers();
    stubFallbackEnv({ visibility: "visible" });
    const goRate = vi.fn();
    openAndroidRateAppWithFallback(goRate, 2500);
    vi.advanceTimersByTime(2500);
    expect(goRate).toHaveBeenCalledTimes(1);
  });

  it("does NOT fall back after the page hides (store opened)", () => {
    vi.useFakeTimers();
    const env = stubFallbackEnv({ visibility: "visible" });
    const goRate = vi.fn();
    openAndroidRateAppWithFallback(goRate, 2500);
    env.doc.visibilityState = "hidden";
    env.emitDoc("visibilitychange");
    vi.advanceTimersByTime(10_000);
    expect(goRate).not.toHaveBeenCalled();
  });

  it("cancels via the returned cleanup (unmount)", () => {
    vi.useFakeTimers();
    stubFallbackEnv({ visibility: "visible" });
    const goRate = vi.fn();
    const cancel = openAndroidRateAppWithFallback(goRate, 2500);
    cancel();
    vi.advanceTimersByTime(10_000);
    expect(goRate).not.toHaveBeenCalled();
  });

  it("does nothing when already on /rate", () => {
    vi.useFakeTimers();
    const env = stubFallbackEnv({ pathname: "/rate" });
    const goRate = vi.fn();
    openAndroidRateAppWithFallback(goRate, 2500);
    expect(env.location.href).not.toBe(RATE_APP_INTENT_URI);
    vi.advanceTimersByTime(10_000);
    expect(goRate).not.toHaveBeenCalled();
  });

  it("never throws when navigation itself fails", () => {
    vi.useFakeTimers();
    stubFallbackEnv();
    expect(() =>
      openAndroidRateAppWithFallback(() => {
        throw new Error("router down");
      }, 2500),
    ).not.toThrow();
    expect(() => vi.advanceTimersByTime(10_000)).not.toThrow();
  });
});
