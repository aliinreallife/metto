// Sync holiday resolver over the LOCAL dataset (no I/O inside routing).
// Semantics:
// - "holiday": authoritative known holiday (official calendar or a later
//   announced exceptional closure merged by the server sync).
// - "non-holiday": a date the daily sync explicitly verified as a normal day.
// - "unknown": anything else — falls back to the normal day-of-week
//   timetable but stays flagged as unverified (never claimed authoritative).
import type { IsHolidayDate } from "./types";
import type { HolidayDataset, HolidayState } from "./local-dataset";

export function getHolidayState(
  dataset: HolidayDataset | null,
  tehranDateStr: string,
): HolidayState {
  if (!dataset) return "unknown";
  const rec = dataset.records[tehranDateStr];
  if (!rec) return "unknown";
  return rec.state;
}

/** True only for authoritative known holidays (routing timetable switch). */
export function createLocalIsHolidayDate(
  dataset: HolidayDataset | null,
): IsHolidayDate {
  return (tehranDateStr: string) =>
    getHolidayState(dataset, tehranDateStr) === "holiday";
}

/** Upcoming known holidays on/after `fromDateStr` (inclusive), ascending. */
export function upcomingHolidays(
  dataset: HolidayDataset | null,
  fromDateStr: string,
  limit = 5,
): { gregorianDate: string; jalaliDate: string; faName: string; enName: string }[] {
  if (!dataset) return [];
  return Object.values(dataset.records)
    .filter((r) => r.state === "holiday" && r.gregorianDate >= fromDateStr)
    .sort((a, b) => (a.gregorianDate < b.gregorianDate ? -1 : 1))
    .slice(0, limit)
    .map((r) => ({
      gregorianDate: r.gregorianDate,
      jalaliDate: r.jalaliDate,
      faName: r.faName ?? r.jalaliDate,
      enName: r.enName ?? r.jalaliDate,
    }));
}
