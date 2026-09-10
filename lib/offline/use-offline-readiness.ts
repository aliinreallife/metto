"use client";

// Offline-readiness state machine (4 states):
// 1. "preparing": online, SW/schedule/holiday not all ready yet.
// 2. "ready": online + SW controlling + schedule + holiday dataset present.
// 3. "offline-ready": offline + core data available (full planner works).
// 4. "offline-incomplete": offline but core was never initialized.
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
import { isScheduleDataLoaded, onScheduleDataReady } from "../schedule-utils";
import { getLocalHolidayDataset } from "../holidays/use-holiday-data";

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

  let phase: OfflinePhase;
  if (!online) {
    phase = coreReady ? "offline-ready" : "offline-incomplete";
  } else if (coreReady && swControlling && precacheReady) {
    phase = "ready";
  } else {
    phase = "preparing";
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
  };
}
