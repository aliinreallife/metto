import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface ListenerRegistry {
  window: Map<string, Set<() => void>>;
  document: Map<string, Set<() => void>>;
  addedCounts: Map<string, number>;
}

function installBrowserStubs(opts?: { onLine?: boolean; hidden?: boolean }) {
  let onLine = opts?.onLine ?? true;
  let hidden = opts?.hidden ?? false;
  const registry: ListenerRegistry = {
    window: new Map(),
    document: new Map(),
    addedCounts: new Map(),
  };
  const addTo =
    (map: Map<string, Set<() => void>>) =>
    (type: string, fn: () => void): void => {
      if (!map.has(type)) map.set(type, new Set());
      map.get(type)!.add(fn);
      registry.addedCounts.set(type, (registry.addedCounts.get(type) ?? 0) + 1);
    };
  const windowStub = {
    addEventListener: addTo(registry.window),
    removeEventListener: (type: string, fn: () => void) => {
      registry.window.get(type)?.delete(fn);
    },
    dispatch: (type: string) => {
      registry.window.get(type)?.forEach((fn) => fn());
    },
  };
  const documentStub = {
    get hidden() {
      return hidden;
    },
    addEventListener: addTo(registry.document),
    removeEventListener: (type: string, fn: () => void) => {
      registry.document.get(type)?.delete(fn);
    },
    dispatch: (type: string) => {
      registry.document.get(type)?.forEach((fn) => fn());
    },
  };
  const navigatorStub = {
    get onLine() {
      return onLine;
    },
  };
  vi.stubGlobal("window", windowStub);
  vi.stubGlobal("document", documentStub);
  vi.stubGlobal("navigator", navigatorStub);
  return {
    registry,
    setOnLine: (v: boolean) => {
      onLine = v;
    },
    setHidden: (v: boolean) => {
      hidden = v;
    },
    window: windowStub,
    document: documentStub,
  };
}

async function loadStore() {
  vi.resetModules();
  return await import("./connectivity-store");
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("singleton connectivity store", () => {
  it("many subscribers share one probe per transition", async () => {
    const env = installBrowserStubs();
    let fetchCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        fetchCalls += 1;
        return { status: 204 };
      }),
    );
    const store = await loadStore();
    const seen: string[][] = [[], [], []];
    const unsubs = [0, 1, 2].map(
      (i) => store.subscribeConnectivity(() => {
        seen[i].push(store.getConnectivitySnapshot().state);
      }),
    );
    // Initial mount probe resolves online; every subscriber observes it,
    // but the network is hit exactly once.
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getConnectivitySnapshot().state).toBe("online");
    expect(fetchCalls).toBe(1);
    for (const states of seen) {
      expect(states[states.length - 1]).toBe("online");
    }
    // One offline event → one state for all, no probe (link is down).
    env.setOnLine(false);
    env.window.dispatch("offline");
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getConnectivitySnapshot().state).toBe("offline");
    expect(fetchCalls).toBe(1);
    unsubs.forEach((u) => u());
    store.__resetConnectivityStoreForTests();
  });

  it("registers exactly one set of listeners no matter the subscriber count", async () => {
    installBrowserStubs();
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 204 })));
    const store = await loadStore();
    const unsubs = Array.from({ length: 5 }, () =>
      store.subscribeConnectivity(() => {}),
    );
    await vi.advanceTimersByTimeAsync(0);
    // Re-subscribing must not add another listener set or probe.
    const unsubs2 = Array.from({ length: 3 }, () =>
      store.subscribeConnectivity(() => {}),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getConnectivitySnapshot().state).toBe("online");
    [...unsubs, ...unsubs2].forEach((u) => u());
    store.__resetConnectivityStoreForTests();
    // Listener registration happens once per event type at store creation.
    // (Counts asserted via a fresh load below.)
  });

  it("counts a single listener set per event type", async () => {
    const env = installBrowserStubs();
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 204 })));
    const store = await loadStore();
    store.subscribeConnectivity(() => {});
    store.subscribeConnectivity(() => {});
    store.subscribeConnectivity(() => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(env.registry.addedCounts.get("online")).toBe(1);
    expect(env.registry.addedCounts.get("offline")).toBe(1);
    expect(env.registry.addedCounts.get("pageshow")).toBe(1);
    expect(env.registry.addedCounts.get("visibilitychange")).toBe(1);
    store.__resetConnectivityStoreForTests();
  });

  it("single retry schedule while offline-with-link; all see recovery", async () => {
    const env = installBrowserStubs();
    let fetchCalls = 0;
    let failProbes = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        fetchCalls += 1;
        if (failProbes) throw new Error("down");
        return { status: 204 };
      }),
    );
    const store = await loadStore();
    const lastSeen: string[] = [];
    store.subscribeConnectivity(() => {
      lastSeen.push(store.getConnectivitySnapshot().state);
    });
    store.subscribeConnectivity(() => {
      lastSeen.push(store.getConnectivitySnapshot().state);
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getConnectivitySnapshot().state).toBe("offline");
    expect(fetchCalls).toBe(1);
    // Exactly one retry fires per 25 s window (single schedule).
    await vi.advanceTimersByTimeAsync(25000);
    expect(fetchCalls).toBe(2);
    // Recovery: both subscribers observe online, cadence stops.
    failProbes = false;
    await vi.advanceTimersByTimeAsync(25000);
    expect(store.getConnectivitySnapshot().state).toBe("online");
    expect(lastSeen[lastSeen.length - 1]).toBe("online");
    const afterRecovery = fetchCalls;
    await vi.advanceTimersByTimeAsync(100000);
    expect(fetchCalls).toBe(afterRecovery);
    expect(env.registry.addedCounts.get("online")).toBe(1);
    store.__resetConnectivityStoreForTests();
  });
});
