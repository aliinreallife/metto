// Cron sync job: refresh exactly today + tomorrow (Tehran calendar).
// Same function can run daily (Hobby) or every 6h (Pro) with no logic change.

import { getTehranTodayAndTomorrow } from "./jalali";
import { fetchDayEvents, type FetchDayResult } from "./timestamp-client";
import type { HolidayStore } from "./store";

export interface SyncDayResult {
  gregorianDate: string;
  jalaliDate: string;
  /** "updated" on success (true or false); "kept" on failure; "failed" fresh. */
  status: "updated" | "kept" | "failed";
  isHoliday: boolean | null;
  hadPrevious: boolean;
}

export interface SyncSummary {
  syncedAt: string;
  dates: { gregorianDate: string; jalaliDate: string }[];
  results: SyncDayResult[];
  /** True when at least one date refreshed successfully. */
  success: boolean;
  lastSuccessfulFetch: string | null;
}

export type FetchDayFn = (jalaliDate: string) => Promise<FetchDayResult>;

/**
 * Sync today + tomorrow. Exactly 2 fetchDay calls per run.
 * - Success (true OR false, incl. empty events) overwrites that date.
 * - Failure/malformed NEVER overwrites an existing value.
 * - Dates on the entry come from the request, never from events[0].
 */
export async function syncHolidays(deps: {
  nowMs: number;
  store: HolidayStore;
  fetchDay?: FetchDayFn;
  syncedAtIso?: string;
}): Promise<SyncSummary> {
  const { nowMs, store } = deps;
  const syncedAt = deps.syncedAtIso ?? new Date(nowMs).toISOString();
  const fetchDay = deps.fetchDay ?? fetchDayEvents;
  const { today, tomorrow } = getTehranTodayAndTomorrow(nowMs);
  const days = [today, tomorrow];

  const results: SyncDayResult[] = [];
  let anySuccess = false;

  for (const day of days) {
    const previous = await store.get(day.gregorianDate);
    let fetched: FetchDayResult;
    try {
      // Exactly one timestamp.ir request per day (2 per run).
      fetched = await fetchDay(day.jalaliDate);
    } catch {
      fetched = { ok: false, error: "fetch-threw" };
    }
    if (fetched.ok) {
      anySuccess = true;
      await store.set({
        jalaliDate: day.jalaliDate,
        gregorianDate: day.gregorianDate,
        isHoliday: fetched.isHoliday,
        events: fetched.holidayEvents,
        fetchedAt: syncedAt,
        source: "timestamp.ir",
      });
      results.push({
        gregorianDate: day.gregorianDate,
        jalaliDate: day.jalaliDate,
        status: "updated",
        isHoliday: fetched.isHoliday,
        hadPrevious: previous !== null,
      });
    } else {
      results.push({
        gregorianDate: day.gregorianDate,
        jalaliDate: day.jalaliDate,
        status: previous ? "kept" : "failed",
        isHoliday: previous ? previous.isHoliday : null,
        hadPrevious: previous !== null,
      });
    }
  }

  if (anySuccess) await store.setLastSuccessfulFetch(syncedAt);
  const lastSuccessfulFetch = await store.getLastSuccessfulFetch();

  // Useful metadata only — never secrets.
  console.log(
    JSON.stringify({
      job: "sync-holidays",
      syncedAt,
      dates: days.map((d) => d.jalaliDate),
      results: results.map((r) => ({
        jalaliDate: r.jalaliDate,
        status: r.status,
        isHoliday: r.isHoliday,
      })),
      success: anySuccess,
    }),
  );
  for (const r of results) {
    if (r.status === "kept" || r.status === "failed") {
      console.error(
        JSON.stringify({
          job: "sync-holidays",
          level: "warn",
          jalaliDate: r.jalaliDate,
          status: r.status,
        }),
      );
    }
  }

  return {
    syncedAt,
    dates: days,
    results,
    success: anySuccess,
    lastSuccessfulFetch,
  };
}
