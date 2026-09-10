import { describe, expect, it, vi, afterEach } from "vitest";
import {
  isNewerHolidayVersion,
  parseHolidayDataset,
  type HolidayDataset,
} from "./lib/holidays/local-dataset";
import {
  createLocalIsHolidayDate,
  getHolidayState,
  upcomingHolidays,
} from "./lib/holidays/local-resolver";
import { checkForHolidayUpdate } from "./lib/holidays/client-update";
import { findRoute, type TripLookupArgs } from "./lib/route";
import { tehranMinuteToInstant } from "./lib/tehran-time";

const T = (dateStr: string, hh: number, mm: number): Date =>
  new Date(tehranMinuteToInstant(dateStr, hh * 60 + mm));

function makeDataset(): HolidayDataset {
  return {
    version: "1405.1.0",
    generatedAt: "2026-09-09T00:00:00.000Z",
    lastSuccessfulSync: "2026-09-09T00:00:00.000Z",
    validFrom: "2026-03-21",
    validThrough: "2027-03-20",
    source: "test",
    coverage: "test",
    records: {
      "2026-09-13": {
        gregorianDate: "2026-09-13",
        jalaliDate: "1405-06-22",
        state: "holiday",
        kind: "official",
        faName: "تعطیلات آزمایشی",
        enName: "Test holiday",
      },
      "2026-09-09": {
        gregorianDate: "2026-09-09",
        jalaliDate: "1405-06-18",
        state: "non-holiday",
        kind: "unknown",
      },
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("parseHolidayDataset", () => {
  it("accepts a valid dataset", () => {
    expect(parseHolidayDataset(makeDataset())?.version).toBe("1405.1.0");
  });
  it("rejects mismatched key/record dates", () => {
    const ds = makeDataset();
    ds.records["2099-01-01"] = {
      gregorianDate: "2099-01-02",
      jalaliDate: "1405-01-01",
      state: "holiday",
      kind: "official",
    };
    expect(parseHolidayDataset(ds)).toBeNull();
  });
  it("rejects unknown states and non-objects", () => {
    expect(parseHolidayDataset(null)).toBeNull();
    expect(parseHolidayDataset({ version: "x" })).toBeNull();
    const ds = makeDataset();
    (ds.records["2026-09-13"] as { state: string }).state = "maybe";
    expect(parseHolidayDataset(ds)).toBeNull();
  });
});

describe("isNewerHolidayVersion", () => {
  it("compares numeric segments", () => {
    expect(isNewerHolidayVersion("1405.1.1", "1405.1.0")).toBe(true);
    expect(isNewerHolidayVersion("1405.1.0", "1405.1.0")).toBe(false);
    expect(isNewerHolidayVersion("1405.1.0", "1405.1.1")).toBe(false);
  });
  it("same version never notifies", () => {
    expect(isNewerHolidayVersion("1405.1.0", "1405.1.0")).toBe(false);
  });
});

describe("local resolver tri-state", () => {
  it("holiday → true; non-holiday → false; unknown → false (distinct)", () => {
    const ds = makeDataset();
    const isHoliday = createLocalIsHolidayDate(ds);
    expect(isHoliday("2026-09-13")).toBe(true);
    expect(isHoliday("2026-09-09")).toBe(false);
    expect(isHoliday("2026-09-10")).toBe(false); // unknown
    expect(getHolidayState(ds, "2026-09-10")).toBe("unknown");
    expect(getHolidayState(ds, "2026-09-09")).toBe("non-holiday");
    expect(getHolidayState(null, "2026-09-13")).toBe("unknown");
  });
  it("upcoming lists known holidays ascending with limit", () => {
    const ds = makeDataset();
    expect(upcomingHolidays(ds, "2026-09-09", 5).map((h) => h.gregorianDate)).toEqual([
      "2026-09-13",
    ]);
    expect(upcomingHolidays(ds, "2026-09-14", 5)).toEqual([]);
    expect(upcomingHolidays(null, "2026-09-09", 5)).toEqual([]);
  });
});

describe("offline holiday routing (no network)", () => {
  it("uses the local dataset resolver inside findRoute", () => {
    const fetchSpy = vi.fn(async () => {
      throw new Error("routing must not fetch");
    });
    vi.stubGlobal("fetch", fetchSpy);
    const seen: string[] = [];
    const sundayNoon = T("2026-09-13", 12, 0); // Sunday + dataset holiday
    const r = findRoute("tehran-sadeghiyeh", "tarasht", {
      departAt: sundayNoon,
      isHolidayDate: createLocalIsHolidayDate(makeDataset()),
      tripLookup: (args: TripLookupArgs) => {
        seen.push(args.dayType);
        return { status: "missing_schedule_data" };
      },
    });
    expect(r).not.toBeNull();
    expect(new Set(seen)).toEqual(new Set(["friday"]));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("unknown dates fall back to weekday without claiming holiday", () => {
    const seen: string[] = [];
    findRoute("tehran-sadeghiyeh", "tarasht", {
      departAt: T("2026-09-09", 12, 0), // Wednesday, verified non-holiday
      isHolidayDate: createLocalIsHolidayDate(makeDataset()),
      tripLookup: (args: TripLookupArgs) => {
        seen.push(args.dayType);
        return { status: "missing_schedule_data" };
      },
    });
    expect(new Set(seen)).toEqual(new Set(["saturday_wednesday"]));
  });
});

describe("checkForHolidayUpdate", () => {
  const newer = () => {
    const ds = makeDataset();
    ds.version = "1405.1.1";
    return ds;
  };
  it("downloads only when the version file is newer", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/holidays.version.json") {
        return { ok: true, json: async () => ({ version: "1405.1.1" }) };
      }
      return { ok: true, json: async () => newer() };
    });
    vi.stubGlobal("fetch", fetchMock);
    const got = await checkForHolidayUpdate("1405.1.0");
    expect(got?.version).toBe("1405.1.1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("same version → no download, no notify", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ version: "1405.1.0" }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await checkForHolidayUpdate("1405.1.0")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("malformed dataset → keeps old copy (null)", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/holidays.version.json") {
        return { ok: true, json: async () => ({ version: "1405.9.9" }) };
      }
      return { ok: true, json: async () => ({ nope: true }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await checkForHolidayUpdate("1405.1.0")).toBeNull();
  });
  it("network failure → null (last-known-good preserved by caller)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    expect(await checkForHolidayUpdate("1405.1.0")).toBeNull();
  });
});
