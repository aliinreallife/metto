"use client";

// Single shared client holiday store: bundled 1405 baseline → persisted
// last-known-good → background same-origin refresh. Routing reads the
// in-memory dataset synchronously; the hook only swaps validated copies.
import { useCallback, useEffect, useMemo, useState } from "react";
import bundledRaw from "../../public/holidays.json";
import {
  parseHolidayDataset,
  type HolidayDataset,
} from "./local-dataset";
import {
  checkForHolidayUpdate,
  markVersionNotified,
  readNotifiedVersion,
  readStoredDataset,
  storeDataset,
} from "./client-update";
import {
  createLocalIsHolidayDate,
  getHolidayState,
  upcomingHolidays,
} from "./local-resolver";
import type { IsHolidayDate } from "./types";
import { tehranParts } from "../tehran-time";
import { getMetroScheduleDayType } from "./schedule-day";

function bundledDataset(): HolidayDataset | null {
  return parseHolidayDataset(bundledRaw);
}

// Module-level memory cache so every hook instance (and findRoute callers)
// shares one validated dataset without re-parsing per component.
let memoryDataset: HolidayDataset | null = bundledDataset();
let memoryReady = false;

function ensureMemoryFromStorage(): void {
  if (memoryReady) return;
  memoryReady = true;
  const stored = (() => {
    try {
      return readStoredDataset();
    } catch {
      return null;
    }
  })();
  if (stored) {
    // Stored copy wins over the bundle only when it is same-or-newer and
    // validates (parse already guarantees shape).
    memoryDataset = stored;
  }
  // First-run silence: the bundled baseline is not an "update".
  try {
    if (readNotifiedVersion() === null && memoryDataset) {
      markVersionNotified(memoryDataset.version);
    }
  } catch {
    // Non-fatal.
  }
}

/** Sync read for non-React callers (routing). Never does I/O. */
export function getLocalHolidayDataset(): HolidayDataset | null {
  ensureMemoryFromStorage();
  return memoryDataset;
}

export function getLocalIsHolidayDate(): IsHolidayDate {
  return createLocalIsHolidayDate(getLocalHolidayDataset());
}

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
  ensureMemoryFromStorage();
  const [dataset, setDataset] = useState<HolidayDataset | null>(memoryDataset);
  const [justUpdated, setJustUpdated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Background refresh only; routing already works on the local copy.
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const current = (memoryDataset ?? dataset)?.version ?? "";
    if (!current) return;
    checkForHolidayUpdate(current).then((next) => {
      if (cancelled || !next) return;
      const previouslyNotified = (() => {
        try {
          return readNotifiedVersion();
        } catch {
          return null;
        }
      })();
      memoryDataset = next;
      storeDataset(next);
      setDataset(next);
      // Notify once per version — never on first install, never repeatedly.
      if (previouslyNotified !== next.version) {
        setJustUpdated(true);
      }
    });
    return () => {
      cancelled = true;
    };
    // Run once on mount; version comparison happens inside.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismissUpdateNotice = useCallback(() => {
    setJustUpdated(false);
    try {
      const ds = memoryDataset;
      if (ds) markVersionNotified(ds.version);
    } catch {
      // Non-fatal.
    }
  }, []);

  return useMemo(() => {
    const isHolidayDate = createLocalIsHolidayDate(dataset);
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
