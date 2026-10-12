"use client";

// Single shared client holiday store: bundled baseline → persisted
// last-known-good → background same-origin refresh via the central
// coordinator (`ensureHolidayCurrent` in ./client-update). Components are pure
// consumers: they subscribe to the central snapshot and trigger the shared
// check, but React lifecycle never decides freshness. Routing reads the
// in-memory dataset synchronously; the hook only reflects validated central
// state plus the one-time update notice.
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ensureHolidayCurrent,
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
  // Synchronous stored/baseline upgrade on first render (same semantics as
  // before: first paint already uses last-known-good, never waits).
  ensureHolidayMemory();
  const snapshot = useSyncExternalStore(
    subscribeHoliday,
    getHolidaySnapshot,
    getHolidayServerSnapshot,
  );
  const dataset = snapshot.dataset;
  // Instance boot version: the update notice fires only for adoptions that
  // land during THIS session. A stored newer copy already present at boot is
  // not a new update (same as the previous per-instance adoption behavior).
  const [bootVersion] = useState(() => dataset?.version ?? "");
  // Dismissals are explicit user actions (event handler, never an effect).
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);

  useEffect(() => {
    // Fire-and-forget: single-flight + TTL in the coordinator make concurrent
    // triggers from many mounted instances free (one shared operation).
    void ensureHolidayCurrent();
  }, []);

  // Pure derivation (no setState in effects): the notice shows only for
  // adoptions that land during THIS session and were never dismissed.
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
