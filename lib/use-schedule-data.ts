"use client";

import { useSyncExternalStore } from "react";
import { isScheduleDataLoaded, onScheduleDataReady } from "./schedule-utils";

export function useScheduleData(): boolean {
  return useSyncExternalStore(
    (notify) => onScheduleDataReady(notify),
    isScheduleDataLoaded,
    // The timetable never loads during SSR; the client snapshot takes over.
    () => false,
  );
}
