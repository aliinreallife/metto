// Effective-connectivity state machine (framework-free, fully testable).
//
// `navigator.onLine` only reflects link state (useless with e.g. an Android
// VPN virtual interface up but Wi-Fi/cellular off), so usable Internet is
// verified with a network-only probe (`GET /api/connectivity` → 204).
//
// States:
// - "checking": the browser may have connectivity, but usable Internet has
//   not been verified yet. Consumers must NOT show offline UI here, but
//   navigation should already take the safe (precached-document) path.
// - "online": the probe succeeded (204).
// - "offline": the browser reports no link, or a probe verified
//   unreachability.
//
// Stale-result protection: every probe run takes a monotonically increasing
// generation ID, consumed by the first settle; later settles for the same
// generation (timeout abort racing a late resolve/reject) are ignored, as
// are settles from superseded generations. At most one probe and one retry
// timer exist at any time.

export type ConnectivityState = "checking" | "online" | "offline";

export interface ConnectivitySnapshot {
  state: ConnectivityState;
  /** Raw `navigator.onLine` value last observed (link state, not truth). */
  navigatorOnline: boolean;
  /**
   * True once a probe resolved for the current episode (success or
   * failure). False when offline was entered via `navigator.onLine`
   * alone, or while still checking.
   */
  reachabilityVerified: boolean;
}

/** Resolves true only for verified reachability (HTTP 204). */
export type ConnectivityProbe = (signal: AbortSignal) => Promise<boolean>;

export interface ConnectivityMachineDeps {
  getNavigatorOnline: () => boolean;
  isDocumentVisible: () => boolean;
  probe: ConnectivityProbe;
  /** Hard per-probe timeout. Default 3000 ms. */
  probeTimeoutMs?: number;
  /** Visible-only retry cadence while offline-with-link. Default 25000 ms. */
  retryIntervalMs?: number;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
  onChange: (snapshot: ConnectivitySnapshot) => void;
}

export interface ConnectivityMachine {
  getSnapshot: () => ConnectivitySnapshot;
  /** Initial mount. Probes unless the browser already reports offline. */
  handleMount: () => void;
  /** Browser `online` event: re-verify, never trust blindly. */
  handleOnlineEvent: () => void;
  /** Browser `offline` event: strong signal, abort anything in flight. */
  handleOfflineEvent: () => void;
  /** pageshow / foreground resync. */
  handleResync: () => void;
  dispose: () => void;
}

export function createConnectivityMachine(
  deps: ConnectivityMachineDeps,
): ConnectivityMachine {
  const probeTimeoutMs = deps.probeTimeoutMs ?? 3000;
  const retryIntervalMs = deps.retryIntervalMs ?? 25000;
  // Looked up lazily so injected/fake clocks apply.
  const schedule =
    (...args: Parameters<typeof setTimeout>): ReturnType<typeof setTimeout> =>
      (deps.setTimeoutFn ?? setTimeout)(...args);
  const clearTimer = (id: ReturnType<typeof setTimeout>): void =>
    (deps.clearTimeoutFn ?? clearTimeout)(id);

  let disposed = false;
  let generation = 0;
  let probeController: AbortController | null = null;
  let probeTimer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let snapshot: ConnectivitySnapshot = {
    state: "checking",
    navigatorOnline: true,
    reachabilityVerified: false,
  };

  function emit(next: ConnectivitySnapshot): void {
    snapshot = next;
    deps.onChange(next);
  }

  function readLink(): boolean {
    try {
      return deps.getNavigatorOnline();
    } catch {
      return snapshot.navigatorOnline;
    }
  }

  function clearProbeTimer(): void {
    if (probeTimer !== null) {
      clearTimer(probeTimer);
      probeTimer = null;
    }
  }

  function clearRetryTimer(): void {
    if (retryTimer !== null) {
      clearTimer(retryTimer);
      retryTimer = null;
    }
  }

  /** Abort the in-flight probe and invalidate its generation. */
  function invalidateProbe(): void {
    generation += 1;
    clearProbeTimer();
    if (probeController) {
      try {
        probeController.abort();
      } catch {
        // Ignore abort errors.
      }
      probeController = null;
    }
  }

  function enterOffline(reachabilityVerified: boolean): void {
    invalidateProbe();
    emit({
      state: "offline",
      navigatorOnline: readLink(),
      reachabilityVerified,
    });
    scheduleRetryIfNeeded();
  }

  function enterOnline(): void {
    invalidateProbe();
    emit({ state: "online", navigatorOnline: readLink(), reachabilityVerified: true });
    scheduleRetryIfNeeded();
  }

  function enterChecking(): void {
    emit({
      state: "checking",
      navigatorOnline: readLink(),
      reachabilityVerified: false,
    });
  }

  /**
   * Conservative visible-only retry: while offline WITH a link and visible,
   * periodically re-probe so recovery without a browser `online` event
   * (VPN case) is eventually detected. State stays "offline" during the
   * background probe — no UI flicker; only success transitions.
   */
  function scheduleRetryIfNeeded(): void {
    clearRetryTimer();
    if (disposed) return;
    if (snapshot.state !== "offline") return;
    let link = false;
    let visible = false;
    try {
      link = deps.getNavigatorOnline();
    } catch {
      return;
    }
    try {
      visible = deps.isDocumentVisible();
    } catch {
      return;
    }
    if (!link || !visible) return;
    retryTimer = schedule(() => {
      retryTimer = null;
      if (disposed) return;
      if (snapshot.state !== "offline") return;
      try {
        if (!deps.getNavigatorOnline() || !deps.isDocumentVisible()) {
          scheduleRetryIfNeeded();
          return;
        }
      } catch {
        return;
      }
      runProbe({ background: true });
    }, retryIntervalMs);
  }

  /**
   * Single settle gate: the first settle for a generation consumes it, so
   * a timeout abort racing a late resolve/reject can never double-apply,
   * and superseded generations are ignored.
   */
  function settle(gen: number, ok: boolean): void {
    if (gen !== generation || disposed) return;
    generation += 1;
    clearProbeTimer();
    probeController = null;
    if (ok) {
      enterOnline();
    } else {
      emit({
        state: "offline",
        navigatorOnline: readLink(),
        reachabilityVerified: true,
      });
      scheduleRetryIfNeeded();
    }
  }

  function runProbe(options: { background: boolean }): void {
    if (disposed) return;
    invalidateProbe();
    if (!options.background) enterChecking();
    const gen = ++generation;
    let controller: AbortController | null = null;
    if (typeof AbortController !== "undefined") {
      controller = new AbortController();
      probeController = controller;
    }
    probeTimer = schedule(() => {
      probeTimer = null;
      // Settle directly: a misbehaving fetch implementation might never
      // reject after abort, and the timeout itself is the verdict.
      // settle() consumes the generation, so a late abort-rejection from
      // the probe below is ignored rather than double-applied.
      if (controller) {
        try {
          controller.abort();
        } catch {
          // The resulting rejection settles via the guarded continuation.
        }
      }
      settle(gen, false);
    }, probeTimeoutMs);

    let result: Promise<boolean>;
    try {
      result = deps.probe(
        controller ? controller.signal : ({} as AbortSignal),
      );
    } catch {
      settle(gen, false);
      return;
    }
    result.then(
      (ok) => settle(gen, ok === true),
      () => settle(gen, false),
    );
  }

  function startVerificationProbe(): void {
    runProbe({ background: false });
  }

  return {
    getSnapshot: () => snapshot,

    handleMount: () => {
      if (disposed) return;
      if (!readLink()) {
        // Definite browser offline: no pointless probe.
        emit({
          state: "offline",
          navigatorOnline: false,
          reachabilityVerified: false,
        });
        scheduleRetryIfNeeded();
        return;
      }
      startVerificationProbe();
    },

    handleOnlineEvent: () => {
      if (disposed) return;
      if (snapshot.state === "online") return;
      // Never trust the event alone (VPN false positive).
      startVerificationProbe();
    },

    handleOfflineEvent: () => {
      if (disposed) return;
      enterOffline(false);
    },

    handleResync: () => {
      if (disposed) return;
      if (!readLink()) {
        enterOffline(false);
        return;
      }
      // Re-verify even from "online": silent death while hidden/suspended
      // is exactly the PWA-resume gap. Cheap (one tiny 204) and rare
      // (user-driven foregrounds only, never a poll).
      startVerificationProbe();
    },

    dispose: () => {
      disposed = true;
      invalidateProbe();
      clearRetryTimer();
    },
  };
}
