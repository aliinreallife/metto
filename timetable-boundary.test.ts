// Timetable service-day boundary regressions.
//
// Proves the design principle: the caller supplies an absolute departure
// instant (`depart_at`); Metto derives the Tehran service-day timetable
// internally — per routing leg, from the propagated absolute instant, never
// frozen from the departure date and never caller-supplied.
//
// Real categories (from public/schedule-data.json): saturday_wednesday,
// thursday, friday. Official holidays reuse the Friday timetable.
// Real holiday fixtures: the bundled public/holidays.json dataset.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findRoute, type TripLookupArgs } from "./lib/route";
import {
  getMetroScheduleDayType,
  scheduleDayToDayType,
} from "./lib/holidays/schedule-day";
import { createLocalIsHolidayDate } from "./lib/holidays/local-resolver";
import { parseHolidayDataset } from "./lib/holidays/local-dataset";
import type { TripLookupResult, TripResult } from "./lib/schedule-utils";
import {
  __setScheduleDataForTests,
  getNextDepartures,
} from "./lib/schedule-utils";
import type { LineScheduleData } from "./lib/schedule-data";
import {
  parseServiceTimeToMinutes,
  tehranMinuteToInstant,
} from "./lib/tehran-time";
import bundledRaw from "./public/holidays.json";

const dataset = parseHolidayDataset(bundledRaw);
if (!dataset) throw new Error("bundled holidays.json failed to parse");
const realHolidays = createLocalIsHolidayDate(dataset);

// Tehran wall-clock instant on a service date.
const T = (dateStr: string, hh: number, mm: number): Date =>
  new Date(tehranMinuteToInstant(dateStr, hh * 60 + mm));

type ScriptLeg = {
  from: string;
  to: string;
  line: number;
  departures: { depart: string; arrive: string }[];
};

/** Scripted timetable over the proven tajrish→karaj 3-segment topology. */
function scriptLookup(legs: ScriptLeg[], calls: TripLookupArgs[] = []) {
  return (args: TripLookupArgs): TripLookupResult => {
    calls.push(args);
    const leg = legs.find(
      (l) => l.from === args.fromId && l.to === args.toId && l.line === args.line,
    );
    if (!leg) return { status: "missing_schedule_data" };
    let best: { depart: number; arrive: number } | null = null;
    for (const d of leg.departures) {
      const dep = parseServiceTimeToMinutes(d.depart);
      let arr = parseServiceTimeToMinutes(d.arrive);
      if (arr < dep) arr += 24 * 60;
      if (dep < args.afterMinutes) continue;
      if (!best || arr < best.arrive) best = { depart: dep, arrive: arr };
    }
    if (!best) return { status: "no_service" };
    const depStr = leg.departures.find(
      (d) => parseServiceTimeToMinutes(d.depart) === best!.depart,
    )!;
    const trip: TripResult = {
      train: {
        line: args.line,
        direction: args.toId,
        dayType: args.dayType,
        isExpress: false,
        stops: [
          { stationId: args.fromId, time: depStr.depart },
          { stationId: args.toId, time: depStr.arrive },
        ],
      },
      departTime: depStr.depart,
      arriveTime: depStr.arrive,
      travelMinutes: best.arrive - best.depart,
    };
    return { status: "found", trip };
  };
}

// Thu 23:40 → Fri crossings (3 segments, default 240s walks).
const MIDNIGHT_LEGS: ScriptLeg[] = [
  {
    from: "tajrish",
    to: "imam-khomeini",
    line: 1,
    departures: [{ depart: "23:45", arrive: "24:05" }],
  },
  {
    from: "imam-khomeini",
    to: "tehran-sadeghiyeh",
    line: 2,
    departures: [{ depart: "00:15", arrive: "00:35" }],
  },
  {
    from: "tehran-sadeghiyeh",
    to: "karaj",
    line: 5,
    departures: [{ depart: "00:45", arrive: "01:10" }],
  },
];

describe("service-day categories from absolute instants", () => {
  it("treats Saturday–Wednesday identically", () => {
    for (const date of ["2026-09-05", "2026-09-06", "2026-09-07", "2026-09-08", "2026-09-09"]) {
      expect(getMetroScheduleDayType(T(date, 10, 0), realHolidays)).toBe("sat_to_wed");
      expect(
        scheduleDayToDayType(getMetroScheduleDayType(T(date, 10, 0), realHolidays)),
      ).toBe("saturday_wednesday");
    }
  });

  it("keeps Thursday distinct", () => {
    expect(getMetroScheduleDayType(T("2026-09-10", 10, 0), realHolidays)).toBe("thursday");
  });

  it("maps Friday to the holiday timetable with no resolver at all", () => {
    expect(getMetroScheduleDayType(T("2026-09-11", 10, 0))).toBe("holiday");
    expect(getMetroScheduleDayType(T("2026-09-11", 10, 0), () => false)).toBe("holiday");
  });

  it("maps a weekday official holiday (Nowruz Monday) to the Friday timetable", () => {
    expect(getMetroScheduleDayType(T("2026-03-23", 7, 30), realHolidays)).toBe("holiday");
    expect(
      scheduleDayToDayType(getMetroScheduleDayType(T("2026-03-23", 7, 30), realHolidays)),
    ).toBe("friday");
  });

  it("lets an official holiday override Thursday", () => {
    // 2026-08-13 (Martyrdom of Imam Reza) and 2026-06-25 (Ashura) are Thursdays.
    expect(getMetroScheduleDayType(T("2026-08-13", 10, 0), realHolidays)).toBe("holiday");
    expect(getMetroScheduleDayType(T("2026-06-25", 10, 0), realHolidays)).toBe("holiday");
  });

  it("resolves a Friday holiday identically with or without holiday knowledge", () => {
    // 2026-06-05 (15 Khordad) and 2026-08-21 are Fridays.
    for (const date of ["2026-06-05", "2026-08-21"]) {
      expect(getMetroScheduleDayType(T(date, 10, 0), realHolidays)).toBe("holiday");
      expect(getMetroScheduleDayType(T(date, 10, 0), () => false)).toBe("holiday");
      expect(getMetroScheduleDayType(T(date, 10, 0))).toBe("holiday");
    }
  });

  it("treats Z and +03:30 forms of one instant identically", () => {
    const tehran = new Date("2026-09-07T14:00:00+03:30");
    const utc = new Date("2026-09-07T10:30:00Z");
    expect(tehran.getTime()).toBe(utc.getTime());
    expect(getMetroScheduleDayType(tehran, realHolidays)).toBe(
      getMetroScheduleDayType(utc, realHolidays),
    );
  });

  it("classifies a UTC instant by its Tehran calendar date (holiday edition)", () => {
    // 2026-08-12T20:35Z == 2026-08-13 00:05 Tehran (Thursday, official holiday).
    const instant = new Date(Date.UTC(2026, 7, 12, 20, 35));
    expect(getMetroScheduleDayType(instant, realHolidays)).toBe("holiday");
  });
});

describe("omitted departure uses the Tehran-classified now", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(tehranMinuteToInstant("2026-09-07", 12 * 60));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("Monday noon Tehran classifies as saturday_wednesday", () => {
    expect(getMetroScheduleDayType(new Date(), realHolidays)).toBe("sat_to_wed");
  });
});

describe("station next-departures use Tehran wall clock", () => {
  const line1: LineScheduleData = {
    line: 1,
    terminalA: "tajrish",
    terminalB: "kahrizak",
    isBranch: false,
    scheduleKey: "1",
    trains: [
      {
        line: 1,
        direction: "kahrizak",
        dayType: "saturday_wednesday",
        isExpress: false,
        stops: [
          { stationId: "tajrish", time: "13:00" },
          { stationId: "kahrizak", time: "14:00" },
        ],
      },
      {
        line: 1,
        direction: "kahrizak",
        dayType: "saturday_wednesday",
        isExpress: false,
        stops: [
          { stationId: "tajrish", time: "15:00" },
          { stationId: "kahrizak", time: "16:00" },
        ],
      },
    ],
  };

  beforeEach(() => {
    __setScheduleDataForTests([line1]);
  });
  afterEach(() => {
    __setScheduleDataForTests(null);
  });

  it("filters by Tehran minute-of-day, not the device timezone", () => {
    // 10:30Z == 14:00 Tehran: the 13:00 train is gone, the 15:00 is 60 min out.
    // (On a UTC host the old device-local code saw 10:30 and kept both.)
    const at = new Date("2026-09-07T10:30:00Z");
    const deps = getNextDepartures("tajrish", 1, "saturday_wednesday", 5, at);
    expect(deps.map((d) => d.time)).toEqual(["15:00"]);
    expect(deps[0].minutesUntil).toBe(60);
  });

  it("defaults to the same Tehran conversion as an explicit now", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(Date.parse("2026-09-07T10:30:00Z"));
      const implicit = getNextDepartures("tajrish", 1, "saturday_wednesday");
      const explicit = getNextDepartures(
        "tajrish",
        1,
        "saturday_wednesday",
        5,
        new Date(),
      );
      expect(implicit).toEqual(explicit);
      expect(implicit.map((d) => d.time)).toEqual(["15:00"]);
    } finally {
      vi.useRealTimers();
    }
  });
});
describe("midnight timetable switching across legs", () => {
  it("Thursday 23:40: leg 1 Thursday, post-midnight legs Friday", () => {
    const calls: TripLookupArgs[] = [];
    const r = findRoute("tajrish", "karaj", {
      departAt: T("2026-09-10", 23, 40),
      isHolidayDate: realHolidays,
      tripLookup: scriptLookup(MIDNIGHT_LEGS, calls),
    });
    expect(r).not.toBeNull();
    expect(calls.map((c) => c.dayType)).toEqual(["thursday", "friday", "friday"]);
    expect(r!.estimatedArrival).toBe("01:10");
  });

  it("weekday 23:40 before an official holiday: post-midnight legs use the holiday timetable", () => {
    // Mon 2026-04-13 is an ordinary weekday; Tue 2026-04-14 is the bundled
    // Martyrdom-of-Imam-Jafar-al-Sadiq holiday.
    expect(realHolidays("2026-04-13")).toBe(false);
    expect(realHolidays("2026-04-14")).toBe(true);
    const calls: TripLookupArgs[] = [];
    const r = findRoute("tajrish", "karaj", {
      departAt: T("2026-04-13", 23, 40),
      isHolidayDate: realHolidays,
      tripLookup: scriptLookup(MIDNIGHT_LEGS, calls),
    });
    expect(r).not.toBeNull();
    expect(calls.map((c) => c.dayType)).toEqual([
      "saturday_wednesday",
      "friday",
      "friday",
    ]);
  });
});
