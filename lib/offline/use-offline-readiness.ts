"use client";

// Offline-readiness state machine (4 states):
// 1. "preparing": online, SW/schedule/holiday not all ready yet.
// 2. "ready": online + SW controlling + schedule + holiday dataset present.
// 3. "offline-ready": offline + core data available (full planner works).
// 4. "offline-incomplete": offline but core was never initialized.
//
// "Core ready" NEVER claims readiness from SW install alone — the timetable
// (`schedule-data.json`) and the holiday dataset must both be loaded.
import { useCallback, useEffect, useState } from "react";
import { isScheduleDataLoaded, onScheduleDataReady } from "../schedule-utils";
import { getLocalHolidayDataset } from "../holidays/use-holiday-data";

export type OfflinePhase =
  | "preparing"
  | "ready"
  | "offline-ready"
  | "offline-incomplete";

const READY_DISMISSED_KEY = "metto.offline.readyDismissed";

function readReadyDismissed(): boolean {
  try {
    return localStorage.getItem(READY_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export type OfflineReadiness = {
  phase: OfflinePhase;
  online: boolean;
  swControlling: boolean;
  swWaiting: boolean;
  scheduleLoaded: boolean;
  holidayLoaded: boolean;
  precacheReady: boolean;
  coreReady: boolean;
  readyDismissed: boolean;
  dismissReady: () => void;
  /** Ask the waiting worker to activate, then reload exactly once. */
  applyUpdate: () => void;
};

export function useOfflineReadiness(): OfflineReadiness {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === "undefined" ? true : navigator.onLine !== false,
  );
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
  const [readyDismissed, setReadyDismissed] = useState(() =>
    readReadyDismissed(),
  );

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    if (isScheduleDataLoaded()) {
      setScheduleLoaded(true);
      return;
    }
    return onScheduleDataReady(() => setScheduleLoaded(true));
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    const check = async () => {
      if (cancelled) return;
      try {
        if (typeof caches === "undefined") return;
        // Serwist precache keys carry `?__WB_REVISION__=` cache-busting
        // params (only `/_next/static/` is exempt), so match while ignoring
        // the query string. The SW's own routes resolve the same entries.
        const [schedule, holidays] = await Promise.all([
          caches.match("/schedule-data.json", { ignoreSearch: true }),
          caches.match("/holidays.json", { ignoreSearch: true }),
        ]);
        if (schedule && holidays) {
          setPrecacheReady(true);
          return;
        }
      } catch {
        // Cache Storage unreadable — stay in "preparing".
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
    // Holiday dataset ships bundled, so this is instant in practice; the
    // poll covers the LKG-storage path resolving after mount.
    if (getLocalHolidayDataset() !== null) {
      setHolidayLoaded(true);
      return;
    }
    const t = window.setInterval(() => {
      if (getLocalHolidayDataset() !== null) {
        setHolidayLoaded(true);
        window.clearInterval(t);
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
        setSwWaiting(!!registration?.waiting);
      } catch {
        setSwWaiting(false);
      }
    };

    const onControllerChange = () => {
      // A new worker just took over (fresh install or applied update):
      // re-show the ready state once instead of staying dismissed forever.
      try {
        localStorage.removeItem(READY_DISMISSED_KEY);
      } catch {
        // Non-fatal.
      }
      if (!disposed) {
        setReadyDismissed(false);
        syncState();
      }
    };

    navigator.serviceWorker
      .getRegistration()
      .then((reg) => {
        if (disposed) return;
        registration = reg ?? null;
        syncState();
        if (!registration) return;
        registration.addEventListener("updatefound", () => {
          const installing = registration?.installing;
          if (!installing) return;
          installing.addEventListener("statechange", syncState);
        });
      })
      .catch(() => {});

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    // Fires for SerwistProvider-driven updates as well.
    const onMessage = () => syncState();
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => {
      disposed = true;
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, []);

  const coreReady = scheduleLoaded && holidayLoaded;

  let phase: OfflinePhase;
  if (!online) {
    phase = coreReady ? "offline-ready" : "offline-incomplete";
  } else if (coreReady && swControlling && precacheReady) {
    phase = "ready";
  } else {
    phase = "preparing";
  }

  const dismissReady = useCallback(() => {
    setReadyDismissed(true);
    try {
      localStorage.setItem(READY_DISMISSED_KEY, "1");
    } catch {
      // Non-fatal.
    }
  }, []);

  const applyUpdate = useCallback(() => {
    try {
      if (!("serviceWorker" in navigator)) {
        window.location.reload();
        return;
      }
      void navigator.serviceWorker.getRegistration().then((reg) => {
        const waiting = reg?.waiting;
        if (waiting) {
          let reloaded = false;
          const reloadOnce = () => {
            if (reloaded) return;
            reloaded = true;
            window.location.reload();
          };
          navigator.serviceWorker.addEventListener("controllerchange", reloadOnce, {
            once: true,
          });
          // Safety net: reload even if the event is missed.
          window.setTimeout(reloadOnce, 1500);
          waiting.postMessage({ type: "SKIP_WAITING" });
        } else {
          window.location.reload();
        }
      });
    } catch {
      window.location.reload();
    }
  }, []);

  return {
    phase,
    online,
    swControlling,
    swWaiting,
    scheduleLoaded,
    holidayLoaded,
    precacheReady,
    coreReady,
    readyDismissed,
    dismissReady,
    applyUpdate,
  };
}
