import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createMemoryHolidayStore } from "./lib/holidays/store";
import type { HolidayCacheEntry } from "./lib/holidays/types";
import { tehranMinuteToInstant } from "./lib/tehran-time";
import {
  classifyTimingSource,
  departureScheduleLabel,
  findRouteWithSchedule,
  getRequestHolidayResolver,
  parseDepartAtParam,
} from "./lib/schedule-server";

const SAT = "2026-09-05"; // Saturday (Tehran)
const SUN = "2026-09-06"; // Sunday
const MON = "2026-09-07"; // Monday

function entry(gregorianDate: string, isHoliday: boolean): HolidayCacheEntry {
  return {
    jalaliDate: "1405-06-14",
    gregorianDate,
    isHoliday,
    events: [],
    fetchedAt: new Date().toISOString(),
    source: "timestamp.ir",
  };
}

// Tehran wall-clock instant as a Date.
const T = (dateStr: string, hh: number, mm: number): Date =>
  new Date(tehranMinuteToInstant(dateStr, hh * 60 + mm));

describe("getRequestHolidayResolver", () => {
  it("departing tomorrow preloads tomorrow + the following day (not today)", async () => {
    const store = createMemoryHolidayStore({
      [SUN]: entry(SUN, true),
      [MON]: entry(MON, false),
    });
    const resolver = await getRequestHolidayResolver(T(SUN, 10, 0), store);
    expect(resolver(SUN)).toBe(true); // tomorrow preloaded
    expect(resolver(MON)).toBe(false); // following day preloaded
    expect(resolver(SAT)).toBe(false); // today NOT preloaded (unknown -> false)
  });

  it("midnight-crossing departure preloads the departure date + next date", async () => {
    const store = createMemoryHolidayStore({
      [SAT]: entry(SAT, false),
      [SUN]: entry(SUN, true),
    });
    const resolver = await getRequestHolidayResolver(T(SAT, 23, 50), store);
    expect(resolver(SAT)).toBe(false);
    expect(resolver(SUN)).toBe(true);
    // Label describes the departure instant only.
    expect(departureScheduleLabel(T(SAT, 23, 50), resolver)).toBe(
      "Saturday–Wednesday",
    );
  });

  it("uses the requested departure, never Date.now()", async () => {
    // Store knows ONLY about the far-future departure dates; today is unknown.
    const store = createMemoryHolidayStore({
      [SUN]: entry(SUN, true),
      [MON]: entry(MON, false),
    });
    const resolver = await getRequestHolidayResolver(T(SUN, 10, 0), store);
    expect(resolver(SUN)).toBe(true);
  });
});

describe("parseDepartAtParam", () => {
  it("accepts ISO-8601 with explicit offset or Z", () => {
    const tehran = parseDepartAtParam("2026-09-07T14:00:00+03:30");
    const utc = parseDepartAtParam("2026-09-07T10:30:00Z");
    expect(tehran).not.toBeNull();
    expect(utc).not.toBeNull();
    // 14:00+03:30 is the same instant as 10:30Z.
    expect(tehran!.getTime()).toBe(utc!.getTime());
  });

  it("rejects ambiguous timestamps without timezone", () => {
    expect(parseDepartAtParam("2026-09-07T14:00:00")).toBeNull();
    expect(parseDepartAtParam("2026-09-07")).toBeNull();
    expect(parseDepartAtParam("tomorrow at 2pm")).toBeNull();
    expect(parseDepartAtParam("")).toBeNull();
  });
});

describe("classifyTimingSource", () => {
  it("never classifies an empty legTiming as timetable", () => {
    expect(classifyTimingSource([])).toBe("estimated");
  });

  it("classifies timetable / mixed / estimated", () => {
    expect(classifyTimingSource(["timetable", "timetable"])).toBe("timetable");
    expect(classifyTimingSource(["timetable", "estimated"])).toBe("mixed");
    expect(classifyTimingSource(["estimated", "no-service"])).toBe("estimated");
  });
});

describe("departureScheduleLabel", () => {
  it("labels Friday, Thursday, weekdays and official holidays", async () => {
    const empty = await getRequestHolidayResolver(
      T(SAT, 10, 0),
      createMemoryHolidayStore(),
    );
    expect(departureScheduleLabel(T("2026-09-04", 10, 0), empty)).toBe(
      "Friday (holiday)",
    );
    expect(departureScheduleLabel(T("2026-09-10", 10, 0), empty)).toBe(
      "Thursday",
    );
    expect(departureScheduleLabel(T(SAT, 10, 0), empty)).toBe(
      "Saturday–Wednesday",
    );

    const holiday = await getRequestHolidayResolver(
      T(MON, 10, 0),
      createMemoryHolidayStore({ [MON]: entry(MON, true) }),
    );
    expect(departureScheduleLabel(T(MON, 10, 0), holiday)).toBe(
      "Weekday (official holiday)",
    );
  });
});

describe("findRouteWithSchedule input validation", () => {  it("returns ok:false (not throw) for ambiguous depart_at", async () => {
    const result = await findRouteWithSchedule(
      "tajrish",
      "tehran-sadeghiyeh",
      "2026-09-07T14:00:00",
    );
    expect(result).not.toBeNull();
    expect(result!.ok).toBe(false);
    if (!result!.ok) expect(result!.error).toMatch(/timezone/i);
  });
});

describe("getRequestHolidayResolver without Redis env", () => {
  const ENV_KEYS = [
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
  ] as const;
  const saved: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("makes zero fetch attempts and falls back to weekday classification", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("must not be called"));
    const resolver = await getRequestHolidayResolver(T(SAT, 10, 0));
    expect(resolver(SAT)).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("omitted departure resolves once to the runtime instant", () => {
  // 2026-09-05T20:29:30Z == 23:59:30 Asia/Tehran, Saturday.
  const FROZEN_MS = Date.parse("2026-09-05T20:29:30Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_MS);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses the frozen now exactly, with Tehran calendar interpretation", async () => {
    // Shared helper behind MCP HTTP, MCP stdio and REST: all pass the raw
    // optional param straight through, so this covers every omitted path.
    const res = await findRouteWithSchedule("tajrish", "tehran-sadeghiyeh");
    expect(res?.ok).toBe(true);
    if (res?.ok) {
      expect(res.route.departedAtMs).toBe(FROZEN_MS);
      expect(res.scheduleNote.startsWith("Saturday–Wednesday")).toBe(true);
    }
  });

  it("near-midnight instant preloads departure date + next date, no mismatch", async () => {
    const store = createMemoryHolidayStore({
      "2026-09-05": entry("2026-09-05", false),
      "2026-09-06": entry("2026-09-06", true),
    });
    const resolver = await getRequestHolidayResolver(new Date(), store);
    // 23:59:30 resolves to Sep 5 (not the post-midnight Sep 6)...
    expect(resolver("2026-09-05")).toBe(false);
    // ...while the following date is preloaded for crossing legs.
    expect(resolver("2026-09-06")).toBe(true);
  });
});

describe("next.config tracing", () => {
  it("includes schedule-data.json for /api/route and /api/mcp", () => {
    const config = readFileSync(
      join(process.cwd(), "next.config.mjs"),
      "utf8",
    );
    expect(config).toContain("outputFileTracingIncludes");
    expect(config).toContain("/api/route");
    expect(config).toContain("/api/mcp");
    expect(config).toContain("public/schedule-data.json");
  });

  it("keeps outputFileTracingIncludes top-level (not experimental) and pins the project root", () => {
    const config = readFileSync(
      join(process.cwd(), "next.config.mjs"),
      "utf8",
    );
    expect(config).not.toMatch(/experimental\s*:\s*\{[^}]*outputFileTracingIncludes/);
    expect(config).toContain("outputFileTracingRoot");
    expect(config).toContain("turbopack");
    expect(config).toMatch(/root\s*:\s*__dirname/);
  });
});
