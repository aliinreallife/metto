"use client";

// Offline-readiness state machine (4 states):
// 1. "preparing": online-but-incomplete, OR offline with verification still
//    pending (UNKNOWN — must never warn).
// 2. "ready": online + SW controlling + schedule + holiday dataset present.
// 3. "offline-ready": offline + verified + core data available from the
//    durable SW precache guarantee (Cache Storage — never incidental
//    HTTP-cache availability).
// 4. "offline-incomplete": offline + VERIFIED missing core (the only warning).
//
// "Core ready" NEVER claims readiness from SW install alone — the timetable
// (`schedule-data.json`) and the holiday dataset must both be loaded.
//
// Update lifecycle is intentionally silent: a newer worker installs in the
// background and waits (skipWaiting: false) without interrupting the
// session; it activates naturally once old clients are gone. No banner,
// no toast, no automatic reload — ever. Service-worker transitions are
// console-only diagnostics (see logSwLifecycle).
import { useEffect, useState } from "react";
import {
  isScheduleDataLoaded,
  loadScheduleData,
  onScheduleDataReady,
} from "../schedule-utils";
import { getLocalHolidayDataset } from "../holidays/use-holiday-data";
import { useConnectivity } from "./use-connectivity";

export type OfflinePhase =
  | "preparing"
  | "ready"
  | "offline-ready"
  | "offline-incomplete";

export type OfflineReadiness = {
  phase: OfflinePhase;
  online: boolean;
  swControlling: boolean;
  swWaiting: boolean;
  scheduleLoaded: boolean;
  holidayLoaded: boolean;
  precacheReady: boolean;
  coreReady: boolean;
  /**
   * True once the initial schedule + holiday + precache checks have EACH
   * completed one full pass. Means "has this been checked?", not "was the
   * required data found?". Settle (success, missing, or thrown error) counts
   * as completed — a rejecting lookup must never leave this false forever.
   */
  readinessVerified: boolean;
};

// Module-level guard: one lifecycle transition logs at most once per
// session, even across React remounts. Console-only, never UI.
let lastSwLifecycleLog = "";

function logSwLifecycle(message: string): void {
  if (lastSwLifecycleLog === message) return;
  lastSwLifecycleLog = message;
  console.debug("[Metto Offline]", message);
}

export function useOfflineReadiness(): OfflineReadiness {
  // Single shared effective-connectivity state — this module no longer
  // tracks online/offline itself (it used to, and the two could disagree).
  const connectivity = useConnectivity();
  const online = connectivity.online;
  const [swControlling, setSwControlling] = useState(false);
  const [swWaiting, setSwWaiting] = useState(false);
  const [scheduleLoaded, setScheduleLoaded] = useState(() => {
    try {
      return isScheduleDataLoaded();
    } catch {
      return false;
    }
  });
  // True only when the offline datasets are actually in Cache Storage —
  // never merely because a worker is installed. This is what makes the
  // "ready" claim survive a cold restart without HTTP-cache luck.
  const [precacheReady, setPrecacheReady] = useState(false);
  const [holidayLoaded, setHolidayLoaded] = useState(
    () => getLocalHolidayDataset() !== null,
  );
  // Completion flags: each initial check settling (found, missing, or
  // thrown) marks its flag. All three must be true before an offline
  // document may claim anything about missing core data.
  const [scheduleChecked, setScheduleChecked] = useState(false);
  const [holidayChecked, setHolidayChecked] = useState(false);
  const [precacheChecked, setPrecacheChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const markChecked = () => {
      if (!cancelled) setScheduleChecked(true);
    };
    if (isScheduleDataLoaded()) {
      setScheduleLoaded(true);
      markChecked();
      return () => {
        cancelled = true;
      };
    }
    const unsubscribe = onScheduleDataReady(() => {
      if (cancelled) return;
      setScheduleLoaded(true);
      markChecked();
    });
    // Settle guard: the load promise resolves AND rejects through here, so
    // a failed offline fetch (evicted/missing core) still completes the
    // check instead of leaving readinessVerified false forever.
    // loadScheduleData is deduped with the providers' call — safe to attach.
    try {
      const pending = loadScheduleData();
      if (pending && typeof pending.then === "function") {
        pending.then(markChecked, markChecked);
      } else {
        markChecked();
      }
    } catch {
      markChecked();
    }
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    let firstPassDone = false;
    const markFirstPass = () => {
      // The FIRST lookup settling (found, missing, or thrown) completes the
      // check. Later 1s retries only flip precacheReady, never verification.
      if (!firstPassDone) {
        firstPassDone = true;
        if (!cancelled) setPrecacheChecked(true);
      }
    };
    const check = async () => {
      if (cancelled) return;
      let found = false;
      try {
        if (typeof caches === "undefined") {
          markFirstPass();
          return;
        }
        // Serwist precache keys carry `?__WB_REVISION__=` cache-busting
        // params (only `/_next/static/` is exempt), so match while ignoring
        // the query string. The SW's own routes resolve the same entries.
        const [schedule, holidays] = await Promise.all([
          caches.match("/schedule-data.json", { ignoreSearch: true }),
          caches.match("/holidays.json", { ignoreSearch: true }),
        ]);
        if (cancelled) return;
        found = !!(schedule && holidays);
      } catch {
        // Cache Storage unreadable — still a completed pass, never hang.
        found = false;
      }
      if (cancelled) return;
      markFirstPass();
      if (found) {
        setPrecacheReady(true);
        return;
      }
      timer = window.setTimeout(check, 1000);
    };
    void check();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    // Holiday dataset ships bundled, so the sync read below settles the
    // check immediately in practice; errors count as settled too. The poll
    // covers the LKG-storage path resolving after mount and only affects
    // the loaded flag, never verification.
    try {
      if (getLocalHolidayDataset() !== null) {
        setHolidayLoaded(true);
      }
    } catch {
      // Sync read failed — still a completed pass.
    }
    setHolidayChecked(true);
    const t = window.setInterval(() => {
      try {
        if (getLocalHolidayDataset() !== null) {
          setHolidayLoaded(true);
          window.clearInterval(t);
        }
      } catch {
        // Keep polling until the stop timer; verification already done.
      }
    }, 500);
    const stop = window.setTimeout(() => window.clearInterval(t), 10000);
    return () => {
      window.clearInterval(t);
      window.clearTimeout(stop);
    };
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let registration: ServiceWorkerRegistration | null = null;
    let disposed = false;

    const syncState = () => {
      if (disposed) return;
      setSwControlling(!!navigator.serviceWorker.controller);
      try {
        const waiting = !!registration?.waiting;
        setSwWaiting(waiting);
        // A rediscovered waiting worker is normal background lifecycle
        // (new precache installed while this session runs) — log only.
        if (waiting) logSwLifecycle("service worker waiting");
      } catch {
        setSwWaiting(false);
      }
    };

    // Never reloads: activation is left to the natural lifecycle (old
    // clients close → waiting worker activates → next launch uses it).
    const onControllerChange = () => {
      logSwLifecycle("service worker activated");
      syncState();
    };

    const trackInstalling = (worker: ServiceWorker | null) => {
      if (!worker) return;
      const onStateChange = () => {
        if (worker.state === "installed") {
          // With skipWaiting:false this worker now waits when an old
          // controller exists, or activates right away on first install.
          if (navigator.serviceWorker.controller) {
            logSwLifecycle("service worker waiting");
          } else {
            logSwLifecycle("service worker activated");
          }
          syncState();
        } else if (worker.state === "activated") {
          logSwLifecycle("service worker activated");
          syncState();
        }
      };
      worker.addEventListener("statechange", onStateChange);
    };

    navigator.serviceWorker
      .getRegistration()
      .then((reg) => {
        if (disposed) return;
        registration = reg ?? null;
        syncState();
        if (!registration) return;
        trackInstalling(registration.installing);
        registration.addEventListener("updatefound", () => {
          logSwLifecycle("service worker update installed");
          trackInstalling(registration?.installing ?? null);
          syncState();
        });
      })
      .catch(() => {});

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );
    return () => {
      disposed = true;
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
    };
  }, []);

  const coreReady = scheduleLoaded && holidayLoaded;

  // Verified-readiness gate (UNKNOWN vs MISSING): an offline document whose
  // three initial checks have not all settled yet reports "preparing", never
  // "offline-incomplete". Only a settled check run with missing core data
  // may show the amber warning — a slow phone/cache must never warn merely
  // because verification took longer than the UI grace period.
  // Tri-state aware: "checking" connectivity is neither online nor offline —
  // it follows the online path (preparing/ready) so nothing offline is ever
  // claimed before reachability resolves. Offline "ready" additionally
  // requires precacheReady: scheduleLoaded may be true from the incidental
  // browser HTTP cache while the durable Cache Storage guarantee is gone —
  // that must report offline-incomplete, never offline-ready.
  const readinessVerified =
    scheduleChecked && holidayChecked && precacheChecked;
  const confirmedOffline = connectivity.state === "offline";

  let phase: OfflinePhase;
  if (!confirmedOffline) {
    phase =
      coreReady && swControlling && precacheReady ? "ready" : "preparing";
  } else if (!readinessVerified) {
    phase = "preparing";
  } else {
    phase = coreReady && precacheReady ? "offline-ready" : "offline-incomplete";
  }

  return {
    phase,
    online,
    swControlling,
    swWaiting,
    scheduleLoaded,
    holidayLoaded,
    precacheReady,
    coreReady,
    readinessVerified,
  };
}
