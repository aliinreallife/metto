"use client";

import { useState, useEffect } from "react";
import { isScheduleDataLoaded, onScheduleDataReady } from "./schedule-utils";

export function useScheduleData(): boolean {
  const [loaded, setLoaded] = useState(isScheduleDataLoaded);

  useEffect(() => {
    if (isScheduleDataLoaded()) {
      setLoaded(true);
      return;
    }
    return onScheduleDataReady(() => setLoaded(true));
  }, []);

  return loaded;
}
