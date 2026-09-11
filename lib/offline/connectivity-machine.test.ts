import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createConnectivityMachine,
  type ConnectivityMachine,
  type ConnectivitySnapshot,
} from "./connectivity-machine";

interface Harness {
  machine: ConnectivityMachine;
  snapshots: ConnectivitySnapshot[];
  setNavigatorOnline: (v: boolean) => void;
  setVisible: (v: boolean) => void;
  resolveProbe: (index: number, ok: boolean) => Promise<void>;
  rejectProbe: (index: number, err?: unknown) => Promise<void>;
  probeCalls: number;
}

function createHarness(opts?: {
  probeTimeoutMs?: number;
  retryIntervalMs?: number;
}): Harness {
  let navigatorOnline = true;
  let visible = true;
  const pending: Array<{
    resolve: (ok: boolean) => void;
    reject: (err: unknown) => void;
  }> = [];
  const snapshots: ConnectivitySnapshot[] = [];
  let probeCalls = 0;
  const machine = createConnectivityMachine({
    getNavigatorOnline: () => navigatorOnline,
    isDocumentVisible: () => visible,
    probe: () =>
      new Promise<boolean>((resolve, reject) => {
        probeCalls += 1;
        pending.push({ resolve, reject });
      }),
    probeTimeoutMs: opts?.probeTimeoutMs,
    retryIntervalMs: opts?.retryIntervalMs,
    onChange: (s) => snapshots.push(s),
  });
  const flush = () => vi.advanceTimersByTimeAsync(0);
  return {
    machine,
    snapshots,
    setNavigatorOnline: (v: boolean) => {
      navigatorOnline = v;
    },
    setVisible: (v: boolean) => {
      visible = v;
    },
    resolveProbe: async (index: number, ok: boolean) => {
      pending[index].resolve(ok);
      await flush();
    },
    rejectProbe: async (index: number, err: unknown = new Error("down")) => {
      pending[index].reject(err);
      await flush();
    },
    get probeCalls() {
      return probeCalls;
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("normal online", () => {
  it("checking → probe 204 → online, exactly one probe", async () => {
    const h = createHarness();
    h.machine.handleMount();
    expect(h.machine.getSnapshot().state).toBe("checking");
    expect(h.probeCalls).toBe(1);
    await h.resolveProbe(0, true);
    const s = h.machine.getSnapshot();
    expect(s.state).toBe("online");
    expect(s.reachabilityVerified).toBe(true);
    expect(s.navigatorOnline).toBe(true);
    h.machine.dispose();
  });
});

describe("definite browser offline", () => {
  it("goes offline immediately with no probe", async () => {
    const h = createHarness();
    h.setNavigatorOnline(false);
    h.machine.handleMount();
    const s = h.machine.getSnapshot();
    expect(s.state).toBe("offline");
    expect(s.reachabilityVerified).toBe(false);
    expect(h.probeCalls).toBe(0);
    h.machine.dispose();
  });
});

describe("link-up probe failures never confirm offline", () => {
  it("persistent link-up failures stay checking forever, never offline", async () => {
    const h = createHarness();
    h.machine.handleMount();
    await h.rejectProbe(0);
    expect(h.machine.getSnapshot().state).toBe("checking");
    // Quick retry, then steady cadence — every round fails, state never
    // leaves checking no matter how long this goes on.
    await vi.advanceTimersByTimeAsync(1500);
    expect(h.probeCalls).toBe(2);
    await h.rejectProbe(1);
    expect(h.machine.getSnapshot().state).toBe("checking");
    await vi.advanceTimersByTimeAsync(1500);
    expect(h.probeCalls).toBe(2);
    await vi.advanceTimersByTimeAsync(25000);
    expect(h.probeCalls).toBe(3);
    await h.rejectProbe(2);
    expect(h.machine.getSnapshot().state).toBe("checking");
    await vi.advanceTimersByTimeAsync(100000);
    // Steady-state retries keep firing (recovery is still detected)…
    expect(h.probeCalls).toBeGreaterThan(3);
    // …but a link-up browser is never classified offline.
    expect(h.machine.getSnapshot().state).toBe("checking");
    expect(h.machine.getSnapshot().navigatorOnline).toBe(true);
    expect(h.machine.getSnapshot().reachabilityVerified).toBe(false);
    h.machine.dispose();
  });

  it("a single transient link-up failure stays checking, then recovers", async () => {
    const h = createHarness();
    h.machine.handleMount();
    await h.rejectProbe(0);
    expect(h.machine.getSnapshot().state).toBe("checking");
    expect(h.machine.getSnapshot().reachabilityVerified).toBe(false);
    await vi.advanceTimersByTimeAsync(1500);
    await h.resolveProbe(1, true);
    const s = h.machine.getSnapshot();
    expect(s.state).toBe("online");
    expect(s.reachabilityVerified).toBe(true);
    h.machine.dispose();
  });

  it("link-down probe failure confirms offline immediately", async () => {
    const h = createHarness();
    h.machine.handleMount();
    h.setNavigatorOnline(false);
    await h.rejectProbe(0);
    const s = h.machine.getSnapshot();
    expect(s.state).toBe("offline");
    expect(s.navigatorOnline).toBe(false);
    expect(s.reachabilityVerified).toBe(true);
    h.machine.dispose();
  });
});

describe("timeout", () => {
  it("repeated link-up timeouts stay checking (backoff to steady cadence)", async () => {
    const h = createHarness({ probeTimeoutMs: 3000 });
    h.machine.handleMount();
    expect(h.machine.getSnapshot().state).toBe("checking");
    await vi.advanceTimersByTimeAsync(3000);
    // First timeout is just unknown.
    expect(h.machine.getSnapshot().state).toBe("checking");
    await vi.advanceTimersByTimeAsync(1500);
    expect(h.probeCalls).toBe(2);
    await vi.advanceTimersByTimeAsync(3000);
    expect(h.machine.getSnapshot().state).toBe("checking");
    // Backed off: no immediate third round, steady cadence instead.
    await vi.advanceTimersByTimeAsync(1500);
    expect(h.probeCalls).toBe(2);
    await vi.advanceTimersByTimeAsync(25000);
    expect(h.probeCalls).toBe(3);
    h.machine.dispose();
  });

  it("link-down timeout confirms offline", async () => {
    const h = createHarness({ probeTimeoutMs: 3000 });
    h.machine.handleMount();
    h.setNavigatorOnline(false);
    await vi.advanceTimersByTimeAsync(3000);
    const s = h.machine.getSnapshot();
    expect(s.state).toBe("offline");
    expect(s.reachabilityVerified).toBe(true);
    h.machine.dispose();
  });
});

describe("recovery", () => {
  it("link-down offline + online event + succeeding probe → online", async () => {
    const h = createHarness();
    h.machine.handleMount();
    h.setNavigatorOnline(false);
    await h.rejectProbe(0);
    expect(h.machine.getSnapshot().state).toBe("offline");
    h.setNavigatorOnline(true);
    h.machine.handleOnlineEvent();
    expect(h.machine.getSnapshot().state).toBe("checking");
    await h.resolveProbe(1, true);
    expect(h.machine.getSnapshot().state).toBe("online");
    h.machine.dispose();
  });

  it("checking recovers to online on the steady retry without any event", async () => {
    const h = createHarness({ retryIntervalMs: 25000 });
    h.machine.handleMount();
    await h.rejectProbe(0);
    expect(h.machine.getSnapshot().state).toBe("checking");
    await vi.advanceTimersByTimeAsync(1500);
    expect(h.probeCalls).toBe(2);
    await h.rejectProbe(1);
    await vi.advanceTimersByTimeAsync(25000);
    expect(h.probeCalls).toBe(3);
    await h.resolveProbe(2, true);
    expect(h.machine.getSnapshot().state).toBe("online");
    // Cadence stops once online.
    await vi.advanceTimersByTimeAsync(100000);
    expect(h.probeCalls).toBe(3);
    h.machine.dispose();
  });

  it("browser online event never jumps straight to online", async () => {
    const h = createHarness();
    h.machine.handleMount();
    await h.rejectProbe(0);
    h.machine.handleOnlineEvent();
    // Still checking until the probe resolves — never blindly online.
    expect(h.machine.getSnapshot().state).toBe("checking");
    h.machine.dispose();
  });
});

describe("stale request protection", () => {
  it("late failure of a superseded probe cannot overwrite online", async () => {
    const h = createHarness();
    h.machine.handleMount(); // probe 0
    h.machine.handleResync(); // probe 1 supersedes probe 0
    expect(h.probeCalls).toBe(2);
    await h.resolveProbe(1, true);
    expect(h.machine.getSnapshot().state).toBe("online");
    await h.rejectProbe(0);
    expect(h.machine.getSnapshot().state).toBe("online");
    h.machine.dispose();
  });

  it("late success of a superseded probe cannot revive online", async () => {
    const h = createHarness();
    h.machine.handleMount(); // probe 0
    h.machine.handleOfflineEvent(); // invalidates probe 0 → offline
    expect(h.machine.getSnapshot().state).toBe("offline");
    await h.resolveProbe(0, true);
    expect(h.machine.getSnapshot().state).toBe("offline");
    h.machine.dispose();
  });
});

describe("event discipline", () => {
  it("online event while already online issues no new probe", async () => {
    const h = createHarness();
    h.machine.handleMount();
    await h.resolveProbe(0, true);
    expect(h.probeCalls).toBe(1);
    h.machine.handleOnlineEvent();
    expect(h.probeCalls).toBe(1);
    h.machine.dispose();
  });

  it("offline event aborts the in-flight probe", async () => {
    const h = createHarness();
    h.machine.handleMount();
    h.machine.handleOfflineEvent();
    expect(h.machine.getSnapshot().state).toBe("offline");
    // Late settle of the aborted probe changes nothing.
    await h.resolveProbe(0, true);
    expect(h.machine.getSnapshot().state).toBe("offline");
    h.machine.dispose();
  });
});

describe("visible-only retry", () => {
  it("retries while offline-with-link and visible; stops when hidden", async () => {
    const h = createHarness({ retryIntervalMs: 25000 });
    h.machine.handleMount();
    // Browser offline event confirms offline even with the link up.
    h.machine.handleOfflineEvent();
    expect(h.machine.getSnapshot().state).toBe("offline");
    expect(h.probeCalls).toBe(1);
    await vi.advanceTimersByTimeAsync(25000);
    expect(h.probeCalls).toBe(2);
    await h.rejectProbe(1);
    expect(h.machine.getSnapshot().state).toBe("offline");
    // Hidden document: no further retries scheduled.
    h.setVisible(false);
    await vi.advanceTimersByTimeAsync(100000);
    expect(h.probeCalls).toBe(2);
    h.machine.dispose();
  });

  it("no retry while navigator.onLine is false", async () => {
    const h = createHarness({ retryIntervalMs: 25000 });
    h.setNavigatorOnline(false);
    h.machine.handleMount();
    await vi.advanceTimersByTimeAsync(100000);
    expect(h.probeCalls).toBe(0);
    h.machine.dispose();
  });

  it("retry success transitions to online", async () => {
    const h = createHarness({ retryIntervalMs: 25000 });
    h.machine.handleMount();
    h.machine.handleOfflineEvent();
    expect(h.machine.getSnapshot().state).toBe("offline");
    await vi.advanceTimersByTimeAsync(25000);
    expect(h.probeCalls).toBe(2);
    await h.resolveProbe(1, true);
    expect(h.machine.getSnapshot().state).toBe("online");
    // And the cadence stops once online.
    await vi.advanceTimersByTimeAsync(100000);
    expect(h.probeCalls).toBe(2);
    h.machine.dispose();
  });

  it("checking retries pause while hidden and resume on resync", async () => {
    const h = createHarness({ retryIntervalMs: 25000 });
    h.machine.handleMount();
    await h.rejectProbe(0);
    expect(h.machine.getSnapshot().state).toBe("checking");
    h.setVisible(false);
    // Hidden: not even the quick retry fires.
    await vi.advanceTimersByTimeAsync(100000);
    expect(h.probeCalls).toBe(1);
    expect(h.machine.getSnapshot().state).toBe("checking");
    h.machine.dispose();
  });
});
