import type { DayType } from "./schedule-data";

export const TEHRAN_TZ = "Asia/Tehran";
const MS_PER_MINUTE = 60_000;

const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TEHRAN_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TEHRAN_TZ,
  weekday: "short",
});

/**
 * Parse a timetable service time ("H:MM", zero-padded or not). Hours may be
 * >= 24 (e.g. "24:06" = 6 minutes past midnight on the following calendar
 * date but the same service day). Returns absolute service minutes, which may
 * exceed 1439 — callers map them onto a Tehran calendar date explicitly.
 */
export function parseServiceTimeToMinutes(time: string): number {
  const [hRaw, mRaw] = time.trim().split(":");
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || m < 0 || m > 59) {
    throw new Error(`invalid service time: ${time}`);
  }
  return h * 60 + m;
}

export interface TehranParts {
  /** Tehran calendar date "YYYY-MM-DD". */
  dateStr: string;
  /** Minute of the Tehran wall clock (0..1439). */
  minuteOfDay: number;
  dayType: DayType;
}

/** Tehran wall-clock offset (wallAsUTC - instant) in milliseconds. */
function tehranOffsetMs(instantMs: number): number {
  const parts = partsFormatter.formatToParts(new Date(instantMs));
  const get = (type: string): number => {
    const p = parts.find((x) => x.type === type);
    return p ? Number(p.value) : 0;
  };
  const wallAsUTC = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
  );
  // Truncate the instant to the minute so seconds never leak into the offset.
  return wallAsUTC - Math.floor(instantMs / MS_PER_MINUTE) * MS_PER_MINUTE;
}

/** Epoch milliseconds of Tehran midnight starting the given calendar date. */
export function tehranMidnightEpoch(dateStr: string): number {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const utcMidnight = Date.UTC(y, mo - 1, d, 0, 0, 0);
  // Iran currently observes a fixed +3:30 offset; refine via measured offset
  // so historical/future DST transitions still resolve.
  let midnight = utcMidnight - 3.5 * 3_600_000;
  for (let i = 0; i < 3; i++) {
    const offset = tehranOffsetMs(midnight);
    const candidate = utcMidnight - offset;
    if (candidate === midnight) break;
    midnight = candidate;
  }
  return midnight;
}

/**
 * Absolute instant for a service time on a Tehran service date.
 * serviceMinutes may exceed 1439 (post-midnight service, e.g. 24:06) and then
 * lands on the following calendar date — a trip itself may cross midnight.
 */
export function tehranMinuteToInstant(
  dateStr: string,
  serviceMinutes: number,
): number {
  return tehranMidnightEpoch(dateStr) + serviceMinutes * MS_PER_MINUTE;
}

/** Tehran calendar date + minute-of-day + timetable day type at an instant. */
export function tehranParts(instantMs: number): TehranParts {
  const parts = partsFormatter.formatToParts(new Date(instantMs));
  const get = (type: string): string => parts.find((x) => x.type === type)?.value ?? "";
  const dateStr = `${get("year")}-${get("month")}-${get("day")}`;
  const minuteOfDay = (Number(get("hour")) % 24) * 60 + Number(get("minute"));
  const weekday = weekdayFormatter.format(new Date(instantMs));
  let dayType: DayType = "saturday_wednesday";
  if (weekday === "Fri") dayType = "friday";
  else if (weekday === "Thu") dayType = "thursday";
  return { dateStr, minuteOfDay, dayType };
}

/** Tehran "HH:MM" wall clock for an absolute instant. */
export function formatTehranClock(instantMs: number): string {
  const { minuteOfDay } = tehranParts(instantMs);
  return `${String(Math.floor(minuteOfDay / 60)).padStart(2, "0")}:${String(minuteOfDay % 60).padStart(2, "0")}`;
}
