"use client";

// Holiday data is local-first and static at runtime. The bundled dataset is
// available immediately (and is precached for offline use); an already stored
// last-known-good dataset from an older app version may still be read, but the
// client no longer performs background version checks or holiday downloads.
// Calendar changes are shipped with normal Metto deployments instead of
// generating per-user runtime requests.
import {
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ensureHolidayMemory,
  getHolidayServerSnapshot,
  getHolidaySnapshot,
  markVersionNotified,
  readNotifiedVersion,
  subscribeHoliday,
} from "./client-update";
import {
  createLocalIsHolidayDate,
  getHolidayState,
  upcomingHolidays,
} from "./local-resolver";
import type { IsHolidayDate } from "./types";
import type { HolidayDataset } from "./local-dataset";
import { tehranParts } from "../tehran-time";
import { getMetroScheduleDayType } from "./schedule-day";

// Sync readers live in the coordinator; re-exported here so existing import
// sites (travel-time-card, use-offline-readiness, mcp client-executors) keep
// working unchanged.
export {
  getLocalHolidayDataset,
  getLocalIsHolidayDate,
} from "./client-update";

export type HolidayUiState = {
  dataset: HolidayDataset | null;
  loaded: boolean;
  isHolidayDate: IsHolidayDate;
  /** Tehran date string for today, e.g. "2026-09-09". */
  todayStr: string;
  todayState: "holiday" | "non-holiday" | "unknown";
  scheduleDay: "sat_to_wed" | "thursday" | "holiday";
  /** True when the holiday timetable applies for the current instant. */
  holidayTimetableActive: boolean;
  nextHoliday: {
    gregorianDate: string;
    jalaliDate: string;
    faName: string;
    enName: string;
  } | null;
  upcoming: {
    gregorianDate: string;
    jalaliDate: string;
    faName: string;
    enName: string;
  }[];
  /** Set once when a genuinely newer dataset was just installed. */
  justUpdated: boolean;
  dismissUpdateNotice: () => void;
};

export function useHolidayData(): HolidayUiState {
  // Synchronous local baseline on first render: first paint never waits for
  // network, and holiday routing remains available offline.
  ensureHolidayMemory();
  const snapshot = useSyncExternalStore(
    subscribeHoliday,
    getHolidaySnapshot,
    getHolidayServerSnapshot,
  );
  const dataset = snapshot.dataset;
  // Instance boot version: retained for compatibility with an already stored
  // last-known-good dataset from older Metto versions. New clients do not
  // perform runtime holiday updates.
  const [bootVersion] = useState(() => dataset?.version ?? "");
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);

  // Pure derivation (no network work): normally false now that calendar
  // updates are delivered through app deployments rather than runtime fetches.
  let justUpdated = false;
  try {
    justUpdated =
      dataset !== null &&
      dataset.version !== bootVersion &&
      dataset.version !== dismissedVersion &&
      readNotifiedVersion() !== dataset.version;
  } catch {
    justUpdated = false;
  }

  const dismissUpdateNotice = useCallback(() => {
    try {
      const ds = getHolidaySnapshot().dataset;
      if (ds) {
        markVersionNotified(ds.version);
        setDismissedVersion(ds.version);
      }
    } catch {
      // Non-fatal.
    }
  }, []);

  return useMemo(() => {
    const isHolidayDate = createLocalIsHolidayDate(dataset);
    // eslint-disable-next-line react-hooks/purity -- wall-clock snapshot for "today"; re-evaluated whenever the dataset (or justUpdated) changes, which is the only freshness this UI needs.
    const nowMs = Date.now();
    const todayStr = tehranParts(nowMs).dateStr;
    const state = getHolidayState(dataset, todayStr);
    const scheduleDay = getMetroScheduleDayType(nowMs, isHolidayDate);
    const upcoming = upcomingHolidays(dataset, todayStr, 5);
    return {
      dataset,
      loaded: dataset !== null,
      isHolidayDate,
      todayStr,
      todayState: state,
      scheduleDay,
      holidayTimetableActive: scheduleDay === "holiday",
      nextHoliday: upcoming[0] ?? null,
      upcoming,
      justUpdated,
      dismissUpdateNotice,
    };
  }, [dataset, justUpdated, dismissUpdateNotice]);
}
