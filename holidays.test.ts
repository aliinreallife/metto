import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getTehranTodayAndTomorrow,
  gregorianToJalali,
  nextTehranCalendarDate,
} from "./lib/holidays/jalali";
import {
  fetchDayEvents,
  parseTimestampResponse,
  type FetchFn,
} from "./lib/holidays/timestamp-client";
import { createMemoryHolidayStore, resolveRedisConfig } from "./lib/holidays/store";
import { syncHolidays, type FetchDayFn } from "./lib/holidays/sync";
import {
  createIsHolidayDate,
  getDayTypeForInstant,
  getMetroScheduleDayType,
  scheduleDayToDayType,
} from "./lib/holidays/schedule-day";
import { findRoute, type TripLookupArgs } from "./lib/route";
import { tehranMinuteToInstant, tehranParts } from "./lib/tehran-time";

// Fixed instants via the Tehran helper (never bare getDay()).
const T = (dateStr: string, hh: number, mm: number): Date =>
  new Date(tehranMinuteToInstant(dateStr, hh * 60 + mm));

const SAT = "2026-09-05"; // Saturday
const SUN = "2026-07-05"; // Sunday == Jalali 1405-04-14 (example response)
const WED = "2026-09-09"; // Wednesday
const THU = "2026-09-10"; // Thursday
const FRI = "2026-09-11"; // Friday
const MON = "2026-09-07"; // Monday

const okFalse = () => Promise.resolve({ ok: true as const, isHoliday: false, holidayEvents: [] });
const okTrue = (id = "h1", title = "تعطیلی رسمی") =>
  Promise.resolve({
    ok: true as const,
    isHoliday: true,
    holidayEvents: [{ id, title, jalaliDate: "1405-04-14", gregorianDate: SUN }],
  });
const failed = () => Promise.resolve({ ok: false as const, error: "http-500" });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getMetroScheduleDayType priority", () => {
  it("normal Saturday -> sat_to_wed", () => {
    expect(getMetroScheduleDayType(T(SAT, 10, 0))).toBe("sat_to_wed");
  });
  it("normal Wednesday -> sat_to_wed", () => {
    expect(getMetroScheduleDayType(T(WED, 10, 0))).toBe("sat_to_wed");
  });
  it("normal Thursday -> thursday", () => {
    expect(getMetroScheduleDayType(T(THU, 10, 0))).toBe("thursday");
  });
  it("Friday -> holiday without any cache/resolver", () => {
    expect(getMetroScheduleDayType(T(FRI, 10, 0))).toBe("holiday");
    expect(getMetroScheduleDayType(T(FRI, 10, 0), () => false)).toBe("holiday");
  });
  it("official holiday on Sunday overrides sat_to_wed", () => {
    expect(getMetroScheduleDayType(T(SUN, 10, 0), () => true)).toBe("holiday");
    expect(getMetroScheduleDayType(T(SUN, 10, 0), () => false)).toBe("sat_to_wed");
  });
  it("official holiday on Thursday overrides thursday", () => {
    expect(getMetroScheduleDayType(T(THU, 10, 0), () => true)).toBe("holiday");
  });
  it("unknown (no resolver) is conservatively non-holiday except Friday", () => {
    expect(getMetroScheduleDayType(T(MON, 10, 0))).toBe("sat_to_wed");
    expect(getMetroScheduleDayType(T(THU, 10, 0))).toBe("thursday");
  });
  it("maps onto the existing friday timetable for holidays", () => {
    expect(scheduleDayToDayType("holiday")).toBe("friday");
    expect(scheduleDayToDayType("thursday")).toBe("thursday");
    expect(scheduleDayToDayType("sat_to_wed")).toBe("saturday_wednesday");
  });
});

describe("Tehran timezone handling", () => {
  it("classifies correctly around UTC midnight (20:35 UTC = next Tehran day)", () => {
    // 2026-09-07 20:35 UTC == 2026-09-08 00:05 Tehran (Tuesday).
    const after = new Date(Date.UTC(2026, 8, 7, 20, 35));
    expect(tehranParts(after.getTime()).dateStr).toBe("2026-09-08");
    expect(getMetroScheduleDayType(after)).toBe("sat_to_wed");
    // 2026-09-07 20:29 UTC == 2026-09-07 23:59 Tehran (Monday).
    const before = new Date(Date.UTC(2026, 8, 7, 20, 29));
    expect(tehranParts(before.getTime()).dateStr).toBe("2026-09-07");
    expect(getMetroScheduleDayType(before)).toBe("sat_to_wed");
  });
  it("Friday just after UTC midnight is still holiday (Tehran date rules)", () => {
    // 2026-09-10 20:35 UTC == 2026-09-11 00:05 Tehran (Friday).
    const fridayEarly = new Date(Date.UTC(2026, 8, 10, 20, 35));
    expect(tehranParts(fridayEarly.getTime()).dateStr).toBe("2026-09-11");
    expect(getMetroScheduleDayType(fridayEarly)).toBe("holiday");
  });
});

describe("timestamp.ir response parsing (is_holiday authoritative)", () => {
  // Exact example response from the spec.
  const example = {
    success: true,
    count: 2,
    events: [
      {
        id: "calendar_23",
        title: "روز قلم",
        category: "solar",
        is_holiday: false,
        jalali_date: "1405-04-14",
        gregorian_date: "2026-07-05",
        lunar_date: "1448-01-20",
      },
      {
        id: "event_tehran-holiday-14-tir-1405",
        title: "تعطیلی کل کشور - ۱۴ تیر ۱۴۰۵",
        category: "تعطیلات رسمی",
        is_holiday: true,
        jalali_date: "1405-04-14",
        gregorian_date: "2026-07-05",
        lunar_date: "1448-01-20",
      },
    ],
  };

  it("one false + one true event => isHoliday=true", () => {
    const r = parseTimestampResponse(example);
    expect(r).toEqual({
      ok: true,
      isHoliday: true,
      holidayEvents: [
        {
          id: "event_tehran-holiday-14-tir-1405",
          title: "تعطیلی کل کشور - ۱۴ تیر ۱۴۰۵",
          jalaliDate: "1405-04-14",
          gregorianDate: "2026-07-05",
        },
      ],
    });
  });
  it("successful empty events => non-holiday (not failure)", () => {
    expect(parseTimestampResponse({ success: true, count: 0, events: [] })).toEqual({
      ok: true,
      isHoliday: false,
      holidayEvents: [],
    });
  });
  it("all is_holiday=false (incl. روز قلم) => normal timetable day", () => {
    const r = parseTimestampResponse({
      success: true,
      count: 1,
      events: [example.events[0]],
    });
    expect(r).toEqual({ ok: true, isHoliday: false, holidayEvents: [] });
  });
  it("holiday-sounding title/category without is_holiday=true => NOT holiday", () => {
    const r = parseTimestampResponse({
      success: true,
      count: 1,
      events: [
        {
          id: "event_x",
          title: "تعطیلی کل کشور",
          category: "تعطیلات رسمی",
          is_holiday: false,
          jalali_date: "1405-04-15",
          gregorian_date: "2026-07-06",
          lunar_date: "1448-01-21",
        },
      ],
    });
    expect(r).toEqual({ ok: true, isHoliday: false, holidayEvents: [] });
  });
  it("success=false / malformed => failure, never a false value", () => {
    expect(parseTimestampResponse({ success: false, error: "x" }).ok).toBe(false);
    expect(parseTimestampResponse({ nope: 1 }).ok).toBe(false);
    expect(parseTimestampResponse({ success: true, events: null }).ok).toBe(false);
  });
});

describe("fetchDayEvents transport", () => {
  it("sends X-API-Key and bypasses caching with a timeout", async () => {
    const json = vi.fn(async () => ({ success: true, count: 0, events: [] }));
    const fetchFn = vi.fn(async () => ({ ok: true, json }) as unknown as Response);
    const r = await fetchDayEvents("1405-04-14", {
      apiKey: "test-key",
      fetchFn: fetchFn as unknown as FetchFn,
    });
    expect(r).toEqual({ ok: true, isHoliday: false, holidayEvents: [] });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit & { signal: AbortSignal }];
    expect(url).toContain("date=1405-04-14");
    expect((init.headers as Record<string, string>)["X-API-Key"]).toBe("test-key");
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
  it("HTTP failure / throw => failure result (never throws)", async () => {
    const bad = vi.fn(async () => ({ ok: false, status: 500 }) as unknown as Response);
    expect((await fetchDayEvents("1405-04-14", { apiKey: "k", fetchFn: bad as unknown as FetchFn })).ok).toBe(false);
    const throwing = vi.fn(async () => {
      throw new Error("down");
    });
    expect((await fetchDayEvents("1405-04-14", { apiKey: "k", fetchFn: throwing as unknown as FetchFn })).ok).toBe(false);
    expect((await fetchDayEvents("1405-04-14", {})).ok).toBe(false); // missing key
  });
});

describe("redis env resolution", () => {
  const KEYS = [
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
  ] as const;

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns null when nothing is configured", () => {
    expect(resolveRedisConfig()).toBeNull();
  });

  it("accepts the Vercel Marketplace KV_* names", () => {
    vi.stubEnv("KV_REST_API_URL", "https://kv.example.upstash.io");
    vi.stubEnv("KV_REST_API_TOKEN", "kv-token");
    expect(resolveRedisConfig()).toEqual({
      url: "https://kv.example.upstash.io",
      token: "kv-token",
    });
  });

  it("prefers UPSTASH_* when both pairs are set", () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://upstash.example.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "upstash-token");
    vi.stubEnv("KV_REST_API_URL", "https://kv.example.upstash.io");
    vi.stubEnv("KV_REST_API_TOKEN", "kv-token");
    expect(resolveRedisConfig()).toEqual({
      url: "https://upstash.example.io",
      token: "upstash-token",
    });
  });

  it("ignores a half-configured pair", () => {
    vi.stubEnv("KV_REST_API_URL", "https://kv.example.upstash.io");
    expect(resolveRedisConfig()).toBeNull();
  });
});

describe("sync job (today + tomorrow)", () => {
  const nowMs = T(MON, 3, 30).getTime(); // Monday 2026-09-07 Tehran

  it("requests exactly today + tomorrow Jalali dates (2 fetches)", async () => {
    const store = createMemoryHolidayStore();
    const seen: string[] = [];
    const fetchDay: FetchDayFn = (jalali) => {
      seen.push(jalali);
      return okFalse();
    };
    const summary = await syncHolidays({ nowMs, store, fetchDay });
    const { today, tomorrow } = getTehranTodayAndTomorrow(nowMs);
    expect(seen).toEqual([today.jalaliDate, tomorrow.jalaliDate]);
    expect(summary.dates).toHaveLength(2);
    expect(summary.success).toBe(true);
    expect(gregorianToJalali("2026-07-05")).toBe("1405-04-14");
  });
  it("computes tomorrow as next Tehran calendar date (no raw arithmetic in sync)", () => {
    expect(nextTehranCalendarDate("2026-09-07")).toBe("2026-09-08");
  });
  it("caches both true and false; entry dates come from the request", async () => {
    const store = createMemoryHolidayStore();
    const { today, tomorrow } = getTehranTodayAndTomorrow(nowMs);
    await syncHolidays({
      nowMs,
      store,
      fetchDay: (jalali) => (jalali === today.jalaliDate ? okTrue() : okFalse()),
    });
    const t = await store.get(today.gregorianDate);
    const n = await store.get(tomorrow.gregorianDate);
    expect(t?.isHoliday).toBe(true);
    expect(t?.jalaliDate).toBe(today.jalaliDate);
    expect(t?.gregorianDate).toBe(today.gregorianDate);
    expect(n?.isHoliday).toBe(false);
  });
  it("newly announced holiday replaces previously cached false on resync", async () => {
    const store = createMemoryHolidayStore();
    await syncHolidays({ nowMs, store, fetchDay: () => okFalse() });
    const { tomorrow } = getTehranTodayAndTomorrow(nowMs);
    expect((await store.get(tomorrow.gregorianDate))?.isHoliday).toBe(false);
    // Next run (tomorrow is now "today"): the announcement is picked up.
    const later = T(nextTehranCalendarDate("2026-09-07"), 3, 30).getTime();
    await syncHolidays({ nowMs: later, store, fetchDay: () => okTrue() });
    expect((await store.get(tomorrow.gregorianDate))?.isHoliday).toBe(true);
  });
  it("API failure preserves previous cached result (incl. true stays true)", async () => {
    const store = createMemoryHolidayStore();
    await syncHolidays({ nowMs, store, fetchDay: () => okTrue() });
    const { today } = getTehranTodayAndTomorrow(nowMs);
    const before = await store.get(today.gregorianDate);
    const summary = await syncHolidays({ nowMs, store, fetchDay: failed });
    const after = await store.get(today.gregorianDate);
    expect(after).toEqual(before);
    expect(after?.isHoliday).toBe(true); // never converted to false
    expect(summary.results.find((r) => r.gregorianDate === today.gregorianDate)?.status).toBe("kept");
    expect(summary.success).toBe(false);
  });
  it("failure with no cache => failed status, null holiday, keeps lastSuccessfulFetch", async () => {
    const store = createMemoryHolidayStore();
    const s1 = await syncHolidays({ nowMs, store, fetchDay: failed });
    expect(s1.results.every((r) => r.status === "failed" && r.isHoliday === null)).toBe(true);
    expect(await store.getLastSuccessfulFetch()).toBeNull();
    await syncHolidays({ nowMs, store, fetchDay: () => okFalse() });
    const kept = await store.getLastSuccessfulFetch();
    expect(kept).not.toBeNull();
    await syncHolidays({ nowMs, store, fetchDay: failed });
    expect(await store.getLastSuccessfulFetch()).toBe(kept);
  });
  it("store distinguishes miss (null) from confirmed false", async () => {
    const store = createMemoryHolidayStore();
    expect(await store.get("2026-09-07")).toBeNull(); // unknown
    await syncHolidays({ nowMs, store, fetchDay: () => okFalse() });
    expect((await store.get("2026-09-07"))?.isHoliday).toBe(false); // confirmed
  });
});

describe("routing integration (no live timestamp.ir calls)", () => {
  it("holiday Sunday selects the friday timetable; findRoute performs no fetch", async () => {
    const fetchSpy = vi.fn(async () => {
      throw new Error("network must not be touched by routing");
    });
    vi.stubGlobal("fetch", fetchSpy);

    const seenDayTypes: string[] = [];
    const sundayNoon = T(SUN, 12, 0);
    const r = findRoute("tehran-sadeghiyeh", "tarasht", {
      departAt: sundayNoon,
      isHolidayDate: createIsHolidayDate(new Set(["2026-07-05"])),
      tripLookup: (args: TripLookupArgs) => {
        seenDayTypes.push(args.dayType);
        return { status: "missing_schedule_data" };
      },
    });
    expect(r).not.toBeNull(); // geometric fallback still works
    expect(seenDayTypes.length).toBeGreaterThan(0);
    expect(new Set(seenDayTypes)).toEqual(new Set(["friday"]));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("same Sunday without holiday cache selects saturday_wednesday timetable", () => {
    const seenDayTypes: string[] = [];
    findRoute("tehran-sadeghiyeh", "tarasht", {
      departAt: T(SUN, 12, 0),
      tripLookup: (args: TripLookupArgs) => {
        seenDayTypes.push(args.dayType);
        return { status: "missing_schedule_data" };
      },
    });
    expect(new Set(seenDayTypes)).toEqual(new Set(["saturday_wednesday"]));
  });
  it("Friday works with no cache and no network", () => {
    const fetchSpy = vi.fn(async () => {
      throw new Error("network must not be touched by routing");
    });
    vi.stubGlobal("fetch", fetchSpy);
    expect(getDayTypeForInstant(T(FRI, 12, 0).getTime()).dayType).toBe("friday");
    const seenDayTypes: string[] = [];
    findRoute("tehran-sadeghiyeh", "tarasht", {
      departAt: T(FRI, 12, 0),
      tripLookup: (args: TripLookupArgs) => {
        seenDayTypes.push(args.dayType);
        return { status: "missing_schedule_data" };
      },
    });
    expect(new Set(seenDayTypes)).toEqual(new Set(["friday"]));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
