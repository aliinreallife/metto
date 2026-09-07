// Server-side timestamp.ir client. Never imported by browser code — the
// API key stays server-side and the client never needs one.

import type { HolidayEvent, TimestampEventsResponse } from "./types";

const TIMESTAMP_BASE = "https://api.timestamp.ir/v1/events";
const FETCH_TIMEOUT_MS = 10_000;

export type FetchDayResult =
  | { ok: true; isHoliday: boolean; holidayEvents: HolidayEvent[] }
  | { ok: false; error: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/**
 * Authoritative holiday detection. ONLY `is_holiday === true` counts.
 * success=true + events=[] (or all false) => non-holiday.
 * success=false / malformed => failure (caller must NOT overwrite cache).
 */
export function parseTimestampResponse(
  raw: unknown,
): FetchDayResult {
  if (!isRecord(raw) || raw.success !== true || !Array.isArray(raw.events)) {
    return { ok: false, error: "malformed-or-unsuccessful-response" };
  }
  const events = raw.events as TimestampEventsResponse["events"];
  const holidayEvents: HolidayEvent[] = [];
  for (const e of events) {
    if (!isRecord(e)) return { ok: false, error: "malformed-event" };
    // Strict boolean check: truthy strings/numbers must NOT count.
    if (e.is_holiday === true) {
      if (
        typeof e.id !== "string" ||
        typeof e.title !== "string" ||
        typeof e.jalali_date !== "string" ||
        typeof e.gregorian_date !== "string"
      ) {
        return { ok: false, error: "malformed-holiday-event" };
      }
      holidayEvents.push({
        id: e.id,
        title: e.title,
        jalaliDate: e.jalali_date,
        gregorianDate: e.gregorian_date,
      });
    }
  }
  return { ok: true, isHoliday: holidayEvents.length > 0, holidayEvents };
}

export type FetchFn = typeof fetch;

/**
 * Fetch one Jalali date's events. Always bypasses framework caching so a
 * cron refresh requests fresh data. Returns a failure result (never throws
 * for transport/API failures) so the caller preserves cached values.
 */
export async function fetchDayEvents(
  jalaliDate: string,
  opts?: { apiKey?: string; fetchFn?: FetchFn },
): Promise<FetchDayResult> {
  const apiKey = opts?.apiKey ?? process.env.TIMESTAMP_IR_API_KEY;
  if (!apiKey) return { ok: false, error: "missing-api-key" };
  const doFetch = opts?.fetchFn ?? fetch;
  let res: Response;
  try {
    res = await doFetch(
      `${TIMESTAMP_BASE}?date=${encodeURIComponent(jalaliDate)}`,
      {
        headers: { "X-API-Key": apiKey },
        cache: "no-store",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      },
    );
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? `fetch-error:${err.name}` : "fetch-error",
    };
  }
  if (!res.ok) return { ok: false, error: `http-${res.status}` };
  let raw: unknown;
  try {
    raw = await res.json();
  } catch {
    return { ok: false, error: "invalid-json" };
  }
  return parseTimestampResponse(raw);
}
