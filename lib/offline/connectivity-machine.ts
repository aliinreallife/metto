// Effective-connectivity state machine (framework-free, fully testable).
//
// `navigator.onLine` only reflects link state (useless with e.g. an Android
// VPN virtual interface up but Wi-Fi/cellular off), so usable Internet is
// verified with a network-only probe (`GET /api/connectivity` → 204).
//
// States:
// - "checking": the browser may have connectivity, but usable Internet has
//   not been verified yet — including after ANY number of failed probes
//   while the browser still reports a link (unknown, NEVER confirmed
//   offline). A persistently blocked/failing probe endpoint (ad blocker,
//   Brave shields, VPN/proxy, endpoint outage) must never flip a link-up
//   browser to offline by itself.
//   Consumers must NOT show offline UI here, but navigation should already
//   take the safe (precached-document) path.
// - "online": the probe succeeded (204) — returns immediately on success.
// - "offline": confirmed ONLY by link-down evidence: the browser reports
//   no link (`navigator.onLine === false`) or the browser `offline` event.
//   There is deliberately no other path to this state: no probe failure,
//   however repeated, classifies a link-up browser as offline.
//
// Stale-result protection: every probe run takes a monotonically increasing
// generation ID, consumed by the first settle; later settles for the same
// generation (timeout abort racing a late resolve/reject) are ignored, as
// are settles from superseded generations. At most one probe, one offline
// retry timer, and one checking retry timer exist at any time.

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
  /**
   * Delay before the first re-probe while checking-with-link (a transient
   * blip recovers fast). Later retries back off to `retryIntervalMs`.
   * Default 1500 ms.
   */
  confirmRetryMs?: number;
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
  // Link-up failure policy: a failed probe while the browser reports a
  // link NEVER confirms offline — the endpoint itself may be blocked
  // (extensions, Brave shields), broken (proxy/VPN), or down while the
  // rest of the Internet works. Stay "checking" (unknown) and keep
  // re-probing so genuine recovery is still detected without events.
  const confirmRetryMs = deps.confirmRetryMs ?? 1500;
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
  let checkingTimer: ReturnType<typeof setTimeout> | null = null;
  // Consecutive probe failures observed while checking with the link up.
  // Drives retry backoff only (quick first re-probe, steady cadence after)
  // — it NEVER confirms offline. Reset on success and fresh verification.
  let checkingFailures = 0;
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

  function clearCheckingTimer(): void {
    if (checkingTimer !== null) {
      clearTimer(checkingTimer);
      checkingTimer = null;
    }
  }

  /** Abort the in-flight probe and invalidate its generation. */
  function invalidateProbe(): void {
    generation += 1;
    clearProbeTimer();
    clearCheckingTimer();
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
    checkingFailures = 0;
    emit({
      state: "offline",
      navigatorOnline: readLink(),
      reachabilityVerified,
    });
    scheduleRetryIfNeeded();
  }

  function enterOnline(): void {
    invalidateProbe();
    checkingFailures = 0;
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
   *
   * Failure policy: link-down evidence (`navigator.onLine === false`)
   * confirms offline immediately. A failure WITH a link NEVER confirms
   * offline — the state stays "checking" (unknown, never offline UI) no
   * matter how many probes fail, with periodic re-probes scheduled so
   * recovery is still detected without browser events.
   */
  function settle(gen: number, ok: boolean): void {
    if (gen !== generation || disposed) return;
    generation += 1;
    clearProbeTimer();
    probeController = null;
    if (ok) {
      enterOnline();
      return;
    }
    let link = true;
    try {
      link = deps.getNavigatorOnline();
    } catch {
      link = snapshot.navigatorOnline;
    }
    if (!link) {
      emit({
        state: "offline",
        navigatorOnline: false,
        reachabilityVerified: true,
      });
      scheduleRetryIfNeeded();
      return;
    }
    if (snapshot.state === "offline") {
      // Confirmed offline stays offline: a failed background retry is just
      // still-offline, never a downgrade back to unknown. Keep the cadence.
      scheduleRetryIfNeeded();
      return;
    }
    checkingFailures += 1;
    // Unknown forever: re-probe on a backoff (quick first retry for
    // transient blips, steady visible-only cadence after). A persistently
    // blocked endpoint keeps the browser in checking — never offline.
    emit({
      state: "checking",
      navigatorOnline: readLink(),
      reachabilityVerified: false,
    });
    scheduleCheckingRetry();
  }

  /**
   * Visible-only re-probe while checking with the link up. The first retry
   * is quick (transient blips recover fast); later ones use the steady
   * cadence. Recovery transitions to online; persistent failure just stays
   * checking — this timer can never produce offline.
   */
  function scheduleCheckingRetry(): void {
    clearCheckingTimer();
    if (disposed) return;
    if (snapshot.state !== "checking") return;
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
    const delay = checkingFailures <= 1 ? confirmRetryMs : retryIntervalMs;
    checkingTimer = schedule(() => {
      checkingTimer = null;
      if (disposed) return;
      if (snapshot.state !== "checking") return;
      try {
        if (!deps.getNavigatorOnline()) {
          enterOffline(false);
          return;
        }
        if (!deps.isDocumentVisible()) {
          scheduleCheckingRetry();
          return;
        }
      } catch {
        return;
      }
      runProbe({ background: true });
    }, delay);
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
    checkingFailures = 0;
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
      checkingFailures = 0;
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
      clearCheckingTimer();
    },
  };
}
