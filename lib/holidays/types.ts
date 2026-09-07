// Shared holiday-sync types. Schedule selection depends ONLY on the
// normalized `isHoliday` boolean, never on title/category/id/count.

export type ScheduleDayType = "sat_to_wed" | "thursday" | "holiday";

/** Raw event object as returned by timestamp.ir (authoritative: is_holiday). */
export interface TimestampEvent {
  id: string;
  title: string;
  category: string;
  /** Authoritative holiday flag. Only `=== true` means an official day off. */
  is_holiday: boolean;
  jalali_date: string;
  gregorian_date: string;
  lunar_date: string;
}

export interface TimestampEventsResponse {
  success: boolean;
  count: number;
  events: TimestampEvent[];
}

/** Minimal holiday metadata kept for optional future UI display. */
export interface HolidayEvent {
  id: string;
  title: string;
  jalaliDate: string;
  gregorianDate: string;
}

export interface HolidayCacheEntry {
  /** Jalali date that was requested, "YYYY-MM-DD". */
  jalaliDate: string;
  /** Gregorian (Tehran calendar) date that was requested, "YYYY-MM-DD". */
  gregorianDate: string;
  /** Normalized from `events.some(e => e.is_holiday === true)`. */
  isHoliday: boolean;
  /** Only the `is_holiday === true` events (may be empty). */
  events: HolidayEvent[];
  /** ISO timestamp of the successful fetch that produced this entry. */
  fetchedAt: string;
  source: "timestamp.ir";
}

/**
 * Storage tri-state per date:
 * - `HolidayCacheEntry` with isHoliday=true  -> confirmed official holiday
 * - `HolidayCacheEntry` with isHoliday=false -> API-confirmed non-holiday
 * - `null`                                  -> cache miss / unknown (never
 *   confuse with confirmed false). Routing treats unknown as non-holiday
 *   (except Friday, always holiday timetable) but storage keeps the
 *   distinction for debugging/observability.
 */
export type CachedHoliday = HolidayCacheEntry | null;

/** Synchronous holiday lookup over already-loaded cache (no I/O in routing). */
export type IsHolidayDate = (tehranDateStr: string) => boolean;
