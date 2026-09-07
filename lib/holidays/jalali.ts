// Tehran-calendar helpers for the holiday sync job.
// All date logic uses Asia/Tehran via lib/tehran-time — never the Vercel
// server timezone, browser timezone, or Date.getDay().

import { toJalaali } from "jalaali-js";
import { tehranMidnightEpoch, tehranParts } from "../tehran-time";

export interface TehranDay {
  /** Gregorian Tehran calendar date "YYYY-MM-DD". */
  gregorianDate: string;
  /** Jalali date "YYYY-MM-DD" required by timestamp.ir `?date=`. */
  jalaliDate: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Gregorian "YYYY-MM-DD" -> Jalali "YYYY-MM-DD" via jalaali-js. */
export function gregorianToJalali(gregorianDate: string): string {
  const [y, m, d] = gregorianDate.split("-").map(Number);
  const { jy, jm, jd } = toJalaali(y, m, d);
  return `${jy}-${pad2(jm)}-${pad2(jd)}`;
}

/**
 * Next Asia/Tehran CALENDAR DATE after the given Tehran date.
 * Encapsulates all epoch arithmetic here so sync logic never bakes raw
 * `+ 86400000` math into itself. Midnight + 36h lands at ~noon the next
 * day, robust to historical/future DST shifts.
 */
export function nextTehranCalendarDate(tehranDateStr: string): string {
  const noonNextDayMs =
    tehranMidnightEpoch(tehranDateStr) + 36 * 3_600_000;
  return tehranParts(noonNextDayMs).dateStr;
}

/**
 * Today + tomorrow as Tehran calendar dates for the sync job.
 * Fetching tomorrow again when it becomes "today" catches late Iranian
 * holiday announcements before morning metro service.
 */
export function getTehranTodayAndTomorrow(nowMs: number): {
  today: TehranDay;
  tomorrow: TehranDay;
} {
  const todayGregorian = tehranParts(nowMs).dateStr;
  const tomorrowGregorian = nextTehranCalendarDate(todayGregorian);
  return {
    today: {
      gregorianDate: todayGregorian,
      jalaliDate: gregorianToJalali(todayGregorian),
    },
    tomorrow: {
      gregorianDate: tomorrowGregorian,
      jalaliDate: gregorianToJalali(tomorrowGregorian),
    },
  };
}
