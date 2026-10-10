// Advanced time routing: depart-at and arrive-by planning.
//
// Depart-at threads an explicit instant through the unchanged forward engine.
// Arrive-by runs reverse timetable propagation on the selected Dijkstra
// topology (latest-departure greedy per leg), then verifies with a full
// forward run — the returned journey always comes from the forward engine.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  computeRouteTopology,
  findRoute,
  type ReverseTripLookupArgs,
  type TripLookupArgs,
} from "./lib/route";
import {
  __setScheduleDataForTests,
  findTripArrivingByDetailed,
  type TripLookupResult,
  type TripResult,
} from "./lib/schedule-utils";
import type { LineScheduleData } from "./lib/schedule-data";
import {
  describePlanDay,
  getArriveByViewState,
  getDayTypeForServiceDate,
  parseTimeModeParams,
  applyTimeParams,
  planRoute,
  PLAN_HORIZON_DAYS,
  seedNextFiveMinutes,
  shiftPlanDay,
  shiftTehranDate,
  shiftTimeOfDay,
} from "./lib/route-planning";
import {
  parseServiceTimeToMinutes,
  tehranMinuteToInstant,
} from "./lib/tehran-time";

// Fixed Tehran service date (Monday -> saturday_wednesday timetable).
const DATE = "2026-09-07";
const T = (date: string, hh: number, mm: number): Date =>
  new Date(tehranMinuteToInstant(date, hh * 60 + mm));
const MON = (hh: number, mm: number): Date => T(DATE, hh, mm);

type ScriptLeg =
  | {
      from: string;
      to: string;
      line: number;
      status: "missing_schedule_data" | "no_service";
    }
  | {
      from: string;
      to: string;
      line: number;
      status: "found";
      departures: { depart: string; arrive: string }[];
    };

function toTrip(
  args: TripLookupArgs | ReverseTripLookupArgs,
  depart: number,
  arrive: number,
  depStr: { depart: string; arrive: string },
): TripResult {
  return {
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
    travelMinutes: arrive - depart,
  };
}

/** Forward script: earliest arrival with depart >= afterMinutes wins. */
function scriptForward(legs: ScriptLeg[], calls: TripLookupArgs[] = []) {
  return (args: TripLookupArgs): TripLookupResult => {
    calls.push(args);
    const leg = legs.find(
      (l) => l.from === args.fromId && l.to === args.toId && l.line === args.line,
    );
    if (!leg || leg.status !== "found") {
      return leg ? { status: leg.status } : { status: "missing_schedule_data" };
    }
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
      (dd) =>
        parseServiceTimeToMinutes(dd.depart) === best!.depart &&
        parseServiceTimeToMinutes(dd.arrive) === best!.arrive,
    )!;
    return { status: "found", trip: toTrip(args, best.depart, best.arrive, depStr) };
  };
}

/**
 * Reverse script: mirrors findTripArrivingByDetailed — latest departure with
 * arrival <= beforeMinutes wins, same-departure ties prefer earlier arrival.
 */
function scriptReverse(legs: ScriptLeg[], calls: ReverseTripLookupArgs[] = []) {
  return (args: ReverseTripLookupArgs): TripLookupResult => {
    calls.push(args);
    const leg = legs.find(
      (l) => l.from === args.fromId && l.to === args.toId && l.line === args.line,
    );
    if (!leg || leg.status !== "found") {
      return leg ? { status: leg.status } : { status: "missing_schedule_data" };
    }
    let best: { depart: number; arrive: number } | null = null;
    for (const d of leg.departures) {
      const dep = parseServiceTimeToMinutes(d.depart);
      let arr = parseServiceTimeToMinutes(d.arrive);
      if (arr < dep) arr += 24 * 60;
      if (arr > args.beforeMinutes) continue;
      if (!best || dep > best.depart || (dep === best.depart && arr < best.arrive)) {
        best = { depart: dep, arrive: arr };
      }
    }
    if (!best) return { status: "no_service" };
    const depStr = leg.departures.find(
      (dd) =>
        parseServiceTimeToMinutes(dd.depart) === best!.depart &&
        parseServiceTimeToMinutes(dd.arrive) === best!.arrive,
    )!;
    return { status: "found", trip: toTrip(args, best.depart, best.arrive, depStr) };
  };
}

afterEach(() => {
  __setScheduleDataForTests(null);
});

describe("topology extraction", () => {
  it("computes the same path findRoute uses", () => {
    const topo = computeRouteTopology("tajrish", "karaj");
    expect(topo).not.toBeNull();
    expect(topo!.path[0]).toBe("tajrish");
    expect(topo!.path[topo!.path.length - 1]).toBe("karaj");
    expect(topo!.segments.length).toBeGreaterThanOrEqual(1);
  });

  it("returns null for same station and unknown stations", () => {
    expect(computeRouteTopology("tajrish", "tajrish")).toBeNull();
    expect(computeRouteTopology("tajrish", "nope")).toBeNull();
  });
});

describe("depart-at planning", () => {
  const legs: ScriptLeg[] = [
    {
      from: "tehran-sadeghiyeh",
      to: "tarasht",
      line: 2,
      status: "found",
      departures: [
        { depart: "08:29", arrive: "08:34" },
        { depart: "08:34", arrive: "08:39" },
      ],
    },
  ];

  it("a train at 08:29 cannot be used for reach-station-at 08:30", () => {
    const r = planRoute("tehran-sadeghiyeh", "tarasht", {
      mode: "depart-at",
      at: MON(8, 30),
    }, { notBeforeMs: 0, tripLookup: scriptForward(legs) });
    expect(r).not.toBeNull();
    expect(r!.trips[0]?.departTime).toBe("08:34");
    expect(r!.initialWaitSeconds).toBe(240);
    expect(r!.departedAtMs).toBe(MON(8, 30).getTime());
    expect(r!.estimatedArrival).toBe("08:39");
  });

  it("matches findRoute with the same explicit instant", () => {
    const at = MON(8, 30);
    const planned = planRoute("tehran-sadeghiyeh", "tarasht", {
      mode: "depart-at",
      at,
    }, { notBeforeMs: 0, tripLookup: scriptForward(legs) });
    const direct = findRoute("tehran-sadeghiyeh", "tarasht", {
      departAt: at,
      tripLookup: scriptForward(legs),
    });
    expect(planned).toEqual(direct);
  });

  it("now mode matches findRoute default behavior", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(MON(8, 30).getTime());
      const planned = planRoute("tehran-sadeghiyeh", "tarasht", { mode: "now" }, {
        tripLookup: scriptForward(legs),
      });
      const direct = findRoute("tehran-sadeghiyeh", "tarasht", {
        tripLookup: scriptForward(legs),
      });
      expect(planned?.path).toEqual(direct?.path);
      expect(planned?.departedAtMs).toBe(direct?.departedAtMs);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("arrive-by planning (single leg)", () => {
  const legs: ScriptLeg[] = [
    {
      from: "tehran-sadeghiyeh",
      to: "tarasht",
      line: 2,
      status: "found",
      departures: [
        { depart: "08:20", arrive: "08:40" },
        { depart: "08:30", arrive: "08:50" },
        { depart: "08:40", arrive: "09:10" },
      ],
    },
  ];
  const fwd = () => scriptForward(legs);
  const rev = () => scriptReverse(legs);

  it("returns the latest feasible journey arriving at/before the deadline", () => {
    const r = planRoute("tehran-sadeghiyeh", "tarasht", {
      mode: "arrive-by",
      at: MON(9, 0),
    }, { notBeforeMs: 0, tripLookup: fwd(), reverseTripLookup: rev() });
    expect(r).not.toBeNull();
    expect(r!.trips[0]?.departTime).toBe("08:30");
    expect(r!.estimatedArrival).toBe("08:50");
    // Arrival satisfies the deadline…
    expect(r!.departedAtMs + r!.totalSeconds * 1000).toBeLessThanOrEqual(
      MON(9, 0).getTime(),
    );
    // …and no later origin departure is feasible: 08:40 arrives 09:10.
    const later = findRoute("tehran-sadeghiyeh", "tarasht", {
      departAt: MON(8, 40),
      tripLookup: fwd(),
    });
    expect(later!.estimatedArrival).toBe("09:10");
  });

  it("prefers the later departure over the later arrival (express trap)", () => {
    const trap: ScriptLeg[] = [
      {
        from: "tehran-sadeghiyeh",
        to: "tarasht",
        line: 2,
        status: "found",
        departures: [
          { depart: "08:00", arrive: "09:00" },
          { depart: "08:30", arrive: "08:55" },
        ],
      },
    ];
    const r = planRoute("tehran-sadeghiyeh", "tarasht", {
      mode: "arrive-by",
      at: MON(9, 0),
    }, { notBeforeMs: 0, tripLookup: scriptForward(trap), reverseTripLookup: scriptReverse(trap) });
    expect(r).not.toBeNull();
    // Duration subtraction (09:00 − 60 min) would board the 08:00 slow train.
    expect(r!.trips[0]?.departTime).toBe("08:30");
    expect(r!.departedAt).toBe("08:30");
  });

  it("same departure prefers the earlier arrival", () => {
    const tie: ScriptLeg[] = [
      {
        from: "tehran-sadeghiyeh",
        to: "tarasht",
        line: 2,
        status: "found",
        departures: [
          { depart: "08:30", arrive: "08:58" },
          { depart: "08:30", arrive: "08:50" },
        ],
      },
    ];
    const r = planRoute("tehran-sadeghiyeh", "tarasht", {
      mode: "arrive-by",
      at: MON(9, 0),
    }, { notBeforeMs: 0, tripLookup: scriptForward(tie), reverseTripLookup: scriptReverse(tie) });
    expect(r).not.toBeNull();
    expect(r!.trips[0]?.arriveTime).toBe("08:50");
  });

  it("returns null when nothing arrives by the deadline", () => {
    const r = planRoute("tehran-sadeghiyeh", "tarasht", {
      mode: "arrive-by",
      at: MON(8, 0),
    }, { notBeforeMs: 0, tripLookup: fwd(), reverseTripLookup: rev() });
    expect(r).toBeNull();
  });

  it("mirrors the missing-data fallback (estimated, still ok)", () => {
    const missing: ScriptLeg[] = [
      { from: "tehran-sadeghiyeh", to: "tarasht", line: 2, status: "missing_schedule_data" },
    ];
    const r = planRoute("tehran-sadeghiyeh", "tarasht", {
      mode: "arrive-by",
      at: MON(9, 0),
    }, { notBeforeMs: 0, tripLookup: scriptForward(missing), reverseTripLookup: scriptReverse(missing) });
    expect(r).not.toBeNull();
    expect(r!.status).toBe("complete");
    expect(r!.legTiming).toEqual(["estimated"]);
    expect(r!.departedAtMs + r!.totalSeconds * 1000).toBeLessThanOrEqual(
      MON(9, 0).getTime(),
    );
  });
});

describe("arrive-by planning (transfers)", () => {
  // tajrish -> imam-khomeini (L1) -> tehran-sadeghiyeh (L2), default 240s walk.
  const legs: ScriptLeg[] = [
    {
      from: "tajrish",
      to: "imam-khomeini",
      line: 1,
      status: "found",
      departures: [{ depart: "08:00", arrive: "08:20" }],
    },
    {
      from: "imam-khomeini",
      to: "tehran-sadeghiyeh",
      line: 2,
      status: "found",
      departures: [
        { depart: "08:23", arrive: "08:43" },
        { depart: "08:24", arrive: "08:44" },
      ],
    },
  ];

  it("catches the connection exactly at the walk boundary", () => {
    // Ready 08:24 after the 240s walk: 08:23 is missed, 08:24 boards.
    const r = planRoute("tajrish", "tehran-sadeghiyeh", {
      mode: "arrive-by",
      at: MON(8, 44),
    }, { notBeforeMs: 0, tripLookup: scriptForward(legs), reverseTripLookup: scriptReverse(legs) });
    expect(r).not.toBeNull();
    expect(r!.connections[0].nextDepartureAt).toBe("08:24");
    expect(r!.estimatedArrival).toBe("08:44");
  });

  it("a barely-missed connection makes the deadline infeasible", () => {
    // Only the 08:23 exists now: ready 08:24 misses it -> next is nothing.
    const missed: ScriptLeg[] = [
      legs[0],
      {
        from: "imam-khomeini",
        to: "tehran-sadeghiyeh",
        line: 2,
        status: "found",
        departures: [{ depart: "08:23", arrive: "08:43" }],
      },
    ];
    const r = planRoute("tajrish", "tehran-sadeghiyeh", {
      mode: "arrive-by",
      at: MON(8, 44),
    }, { notBeforeMs: 0, tripLookup: scriptForward(missed), reverseTripLookup: scriptReverse(missed) });
    // Reverse finds 08:23 (arrives 08:43 <= deadline) but forward
    // verification from 08:00 misses it after the walk -> infeasible.
    expect(r).toBeNull();
  });

  it("propagates across two transfers without resetting", () => {
    const three: ScriptLeg[] = [
      {
        from: "tajrish",
        to: "imam-khomeini",
        line: 1,
        status: "found",
        departures: [{ depart: "08:00", arrive: "08:20" }],
      },
      {
        from: "imam-khomeini",
        to: "tehran-sadeghiyeh",
        line: 2,
        status: "found",
        departures: [{ depart: "08:27", arrive: "08:40" }],
      },
      {
        from: "tehran-sadeghiyeh",
        to: "karaj",
        line: 5,
        status: "found",
        departures: [{ depart: "08:47", arrive: "09:00" }],
      },
    ];
    const r = planRoute("tajrish", "karaj", {
      mode: "arrive-by",
      at: MON(9, 0),
    }, { notBeforeMs: 0, tripLookup: scriptForward(three), reverseTripLookup: scriptReverse(three) });
    expect(r).not.toBeNull();
    expect(r!.numTransfers).toBe(2);
    expect(r!.estimatedArrival).toBe("09:00");
    expect(r!.departedAt).toBe("08:00");
  });
});

describe("arrive-by planning (midnight)", () => {
  it("finds a post-midnight arrival from the previous service evening", () => {
    const legs: ScriptLeg[] = [
      {
        from: "tehran-sadeghiyeh",
        to: "tarasht",
        line: 2,
        status: "found",
        departures: [{ depart: "23:50", arrive: "24:06" }],
      },
    ];
    // Tuesday 00:10 deadline (DATE is Monday).
    const r = planRoute("tehran-sadeghiyeh", "tarasht", {
      mode: "arrive-by",
      at: T("2026-09-08", 0, 10),
    }, { notBeforeMs: 0, tripLookup: scriptForward(legs), reverseTripLookup: scriptReverse(legs) });
    expect(r).not.toBeNull();
    expect(r!.trips[0]?.departTime).toBe("23:50");
    expect(r!.estimatedArrival).toBe("00:06");
  });

  it("queries both service-date day types around midnight", () => {
    const calls: ReverseTripLookupArgs[] = [];
    const legs: ScriptLeg[] = [
      {
        from: "tehran-sadeghiyeh",
        to: "tarasht",
        line: 2,
        status: "found",
        departures: [{ depart: "23:50", arrive: "24:06" }],
      },
    ];
    planRoute("tehran-sadeghiyeh", "tarasht", {
      mode: "arrive-by",
      // Friday 00:15 (2026-09-11 is a Friday); previous day is Thursday.
      at: T("2026-09-11", 0, 15),
    }, {
      tripLookup: scriptForward(legs),
      reverseTripLookup: scriptReverse(legs, calls),
      isHolidayDate: () => false,
    });
    const dayTypes = calls.map((c) => c.dayType).sort();
    expect(dayTypes).toEqual(["friday", "thursday"]);
  });
});

describe("reverse lookup against real schedule data", () => {
  const line2: LineScheduleData = {
    line: 2,
    terminalA: "a",
    terminalB: "b",
    isBranch: false,
    scheduleKey: "t",
    trains: [
      {
        line: 2,
        direction: "b",
        dayType: "saturday_wednesday",
        isExpress: false,
        stops: [
          { stationId: "a", time: "08:00" },
          { stationId: "b", time: "09:00" },
        ],
      },
      {
        line: 2,
        direction: "b",
        dayType: "saturday_wednesday",
        isExpress: false,
        stops: [
          { stationId: "a", time: "08:30" },
          { stationId: "b", time: "08:55" },
        ],
      },
      {
        line: 2,
        direction: "b",
        dayType: "saturday_wednesday",
        isExpress: false,
        stops: [
          { stationId: "a", time: "08:30" },
          { stationId: "b", time: "08:58" },
        ],
      },
    ],
  };

  it("picks latest departure, then earliest arrival", () => {
    __setScheduleDataForTests([line2]);
    // 09:00 deadline: all three arrive in time; latest departure is 08:30,
    // and of the two 08:30 trains the 08:55 arrival wins.
    const r = findTripArrivingByDetailed("a", "b", 2, 540, "saturday_wednesday");
    expect(r.status).toBe("found");
    if (r.status !== "found") throw new Error("expected found");
    expect(r.trip.departTime).toBe("08:30");
    expect(r.trip.arriveTime).toBe("08:55");
  });

  it("excludes trains arriving after the deadline", () => {
    __setScheduleDataForTests([line2]);
    // 08:54 deadline: only the 08:00->09:00… no: 09:00 > 534. Nothing.
    expect(
      findTripArrivingByDetailed("a", "b", 2, 534, "saturday_wednesday"),
    ).toEqual({ status: "no_service" });
    expect(
      findTripArrivingByDetailed("a", "b", 2, 535, "saturday_wednesday"),
    ).toEqual({
      status: "found",
      trip: expect.objectContaining({ departTime: "08:30", arriveTime: "08:55" }),
    });
  });

  it("distinguishes missing data from no service", () => {
    __setScheduleDataForTests([line2]);
    expect(
      findTripArrivingByDetailed("a", "b", 9, 540, "saturday_wednesday"),
    ).toEqual({ status: "missing_schedule_data" });
    // NOTE: no omitted-dayType assertion here — the lookup defaults an
    // omitted dayType to today (getCurrentDayType), so that case passes on
    // Thu/Fri and fails Sat–Wed when the fixture has matching trains.
    // A day with no fixture trains covers the branch deterministically.
    expect(findTripArrivingByDetailed("a", "b", 2, 540, "friday")).toEqual({
      status: "missing_schedule_data",
    });
  });
});

describe("service-date day types", () => {
  const never = () => false;
  it("maps Friday/Thursday/weekday service dates", () => {
    expect(getDayTypeForServiceDate("2026-09-11", never)).toBe("friday");
    expect(getDayTypeForServiceDate("2026-09-10", never)).toBe("thursday");
    expect(getDayTypeForServiceDate("2026-09-07", never)).toBe(
      "saturday_wednesday",
    );
  });

  it("maps an official holiday to the Friday timetable", () => {
    expect(getDayTypeForServiceDate("2026-03-23", (d) => d === "2026-03-23")).toBe(
      "friday",
    );
  });
});

describe("continuous picker datetime", () => {
  it("rolls the date forward past midnight", () => {
    expect(shiftTimeOfDay("2026-09-07", 23, 55, 5)).toEqual({
      dateStr: "2026-09-08",
      hh: 0,
      mm: 0,
    });
    expect(shiftTimeOfDay("2026-09-07", 23, 0, 60)).toEqual({
      dateStr: "2026-09-08",
      hh: 0,
      mm: 0,
    });
  });

  it("rolls the date backward past midnight", () => {
    expect(shiftTimeOfDay("2026-09-08", 0, 0, -5)).toEqual({
      dateStr: "2026-09-07",
      hh: 23,
      mm: 55,
    });
  });

  it("spans month boundaries in both directions", () => {
    expect(shiftTehranDate("2026-09-30", 1)).toBe("2026-10-01");
    expect(shiftTehranDate("2026-10-01", -1)).toBe("2026-09-30");
    expect(shiftTimeOfDay("2026-09-30", 23, 59, 2)).toEqual({
      dateStr: "2026-10-01",
      hh: 0,
      mm: 1,
    });
  });

  it("handles multi-hour and zero deltas", () => {
    expect(shiftTimeOfDay("2026-09-07", 8, 30, 0)).toEqual({
      dateStr: "2026-09-07",
      hh: 8,
      mm: 30,
    });
    expect(shiftTimeOfDay("2026-09-07", 10, 0, -180)).toEqual({
      dateStr: "2026-09-07",
      hh: 7,
      mm: 0,
    });
  });
});

describe("plan day badges", () => {
  // 2026-09-07 is a Monday; only 2026-03-23 is a listed holiday here.
  const isHolidayDate = (d: string): boolean => d === "2026-03-23";

  it("caps the picker horizon at one week", () => {
    expect(PLAN_HORIZON_DAYS).toBe(7);
  });

  it("stays quiet on normal weekdays", () => {
    expect(describePlanDay("en", "2026-09-07", isHolidayDate)).toBeNull();
    expect(describePlanDay("fa", "2026-09-08", isHolidayDate)).toBeNull();
  });

  it("labels Thursday service days", () => {
    expect(describePlanDay("en", "2026-09-10", isHolidayDate)).toBe(
      "Thursday service",
    );
    expect(describePlanDay("fa", "2026-09-10", isHolidayDate)).toBe(
      "سرویس پنجشنبه",
    );
  });

  it("labels Friday by rule (not as an official holiday)", () => {
    expect(describePlanDay("en", "2026-09-11", isHolidayDate)).toBe(
      "Friday service",
    );
    expect(describePlanDay("fa", "2026-09-11", isHolidayDate)).toBe(
      "سرویس جمعه",
    );
  });

  it("labels listed holidays with their name when known", () => {
    expect(
      describePlanDay("en", "2026-03-23", isHolidayDate, {
        fa: "نوروز",
        en: "Nowruz",
      }),
    ).toBe("Holiday service · Nowruz");
    expect(
      describePlanDay("fa", "2026-03-23", isHolidayDate, {
        fa: "نوروز",
        en: "Nowruz",
      }),
    ).toBe("سرویس تعطیلات · نوروز");
    expect(describePlanDay("en", "2026-03-23", isHolidayDate)).toBe(
      "Holiday service",
    );
  });
});

describe("arrive-by view classification", () => {
  const legs: ScriptLeg[] = [
    {
      from: "tehran-sadeghiyeh",
      to: "tarasht",
      line: 2,
      status: "found",
      departures: [{ depart: "08:30", arrive: "08:50" }],
    },
  ];
  const opts = {
    tripLookup: scriptForward(legs),
    reverseTripLookup: scriptReverse(legs),
    notBeforeMs: 0,
  };

  it("passes a feasible plan through", () => {
    const planned = planRoute("tehran-sadeghiyeh", "tarasht", {
      mode: "arrive-by",
      at: MON(9, 0),
    }, opts);
    const now = findRoute("tehran-sadeghiyeh", "tarasht", {
      departAt: MON(8, 0),
      tripLookup: scriptForward(legs),
    });
    const state = getArriveByViewState(planned, now, MON(9, 0).getTime());
    expect(state.kind).toBe("planned");
    if (state.kind !== "planned") throw new Error("expected planned");
    expect(state.route).toBe(planned);
  });

  it("reports missed when even now cannot make the deadline", () => {
    const planned = planRoute("tehran-sadeghiyeh", "tarasht", {
      mode: "arrive-by",
      at: MON(8, 40),
    }, opts);
    expect(planned).toBeNull();
    const now = findRoute("tehran-sadeghiyeh", "tarasht", {
      departAt: MON(8, 0),
      tripLookup: scriptForward(legs),
    });
    const state = getArriveByViewState(planned, now, MON(8, 40).getTime());
    expect(state.kind).toBe("missed");
    if (state.kind !== "missed") throw new Error("expected missed");
    // Earliest arrival is the 08:50 train, past the 08:40 deadline.
    expect(state.earliestArrivalMs).toBe(MON(8, 50).getTime());
  });

  it("reuses no_service when the Now route itself has none", () => {
    // One early train: over by the 07:45 deadline (reverse finds nothing)
    // and already gone for a Now lookup from 08:00 (forward finds nothing).
    const early: ScriptLeg[] = [
      {
        from: "tehran-sadeghiyeh",
        to: "tarasht",
        line: 2,
        status: "found",
        departures: [{ depart: "07:30", arrive: "07:50" }],
      },
    ];
    const earlyOpts = {
      tripLookup: scriptForward(early),
      reverseTripLookup: scriptReverse(early),
    };
    const planned = planRoute("tehran-sadeghiyeh", "tarasht", {
      mode: "arrive-by",
      at: MON(7, 45),
    }, earlyOpts);
    expect(planned).toBeNull();
    const now = findRoute("tehran-sadeghiyeh", "tarasht", {
      departAt: MON(8, 0),
      tripLookup: scriptForward(early),
    });
    expect(now?.status).toBe("no_service");
    const state = getArriveByViewState(planned, now, MON(7, 45).getTime());
    expect(state.kind).toBe("no_service");
    if (state.kind !== "no_service") throw new Error("expected no_service");
    expect(state.route).toBe(now);
  });

  it("stays generic without a Now route (no topology, no claims)", () => {
    expect(getArriveByViewState(null, null, MON(9, 0).getTime())).toEqual({
      kind: "generic",
    });
  });

  it("stays generic when the Now arrival is fully estimated", () => {
    const missing: ScriptLeg[] = [
      { from: "tehran-sadeghiyeh", to: "tarasht", line: 2, status: "missing_schedule_data" },
    ];
    const now = findRoute("tehran-sadeghiyeh", "tarasht", {
      departAt: MON(8, 0),
      tripLookup: scriptForward(missing),
    });
    expect(now?.legTiming).toEqual(["estimated"]);
    const state = getArriveByViewState(null, now, MON(8, 1).getTime());
    expect(state.kind).toBe("generic");
  });
});

describe("arrive-by origin floor (no time travel)", () => {
  const legs: ScriptLeg[] = [
    {
      from: "tehran-sadeghiyeh",
      to: "tarasht",
      line: 2,
      status: "found",
      departures: [{ depart: "08:30", arrive: "08:50" }],
    },
  ];
  const plan = (at: Date, notBeforeMs?: number) =>
    planRoute("tehran-sadeghiyeh", "tarasht", { mode: "arrive-by", at }, {
      tripLookup: scriptForward(legs),
      reverseTripLookup: scriptReverse(legs),
      ...(notBeforeMs === undefined ? {} : { notBeforeMs }),
    });

  it("returns null when the latest feasible departure is already gone", () => {
    // Only journey departs 08:30; by 08:35 it cannot start anymore.
    expect(plan(MON(9, 0), MON(8, 35).getTime())).toBeNull();
  });

  it("still plans when the departure is reachable", () => {
    const r = plan(MON(9, 0), MON(8, 0).getTime());
    expect(r?.trips[0]?.departTime).toBe("08:30");
  });

  it("tolerates sub-minute evaluation lag (minute-resolution boarding)", () => {
    const r = plan(MON(9, 0), MON(8, 30).getTime() + 30_000);
    expect(r?.trips[0]?.departTime).toBe("08:30");
  });
});

describe("planning seed (next strictly-future 5-minute boundary)", () => {
  it("rounds up within the hour", () => {
    expect(seedNextFiveMinutes(T(DATE, 8, 31).getTime())).toEqual({
      dateStr: DATE,
      hh: 8,
      mm: 35,
    });
  });

  it("never keeps the current instant, even on the boundary", () => {
    expect(seedNextFiveMinutes(T(DATE, 8, 35).getTime())).toEqual({
      dateStr: DATE,
      hh: 8,
      mm: 40,
    });
  });

  it("rolls to tomorrow after the last boundary", () => {
    expect(seedNextFiveMinutes(T(DATE, 23, 58).getTime())).toEqual({
      dateStr: "2026-09-08",
      hh: 0,
      mm: 0,
    });
  });
});

describe("planned day shifts", () => {
  it("keeps the wall-clock time across days and bounds", () => {
    const at = T(DATE, 9, 0).getTime();
    const next = shiftPlanDay(at, 1, DATE, "2026-10-07");
    expect(next).toBe(T("2026-09-08", 9, 0).getTime());
    expect(shiftPlanDay(at, -1, DATE, "2026-10-07")).toBeNull();
    expect(shiftPlanDay(at, 31, DATE, "2026-10-07")).toBeNull();
  });
});

describe("URL time params", () => {
  it("round-trips depart and arrive modes", () => {
    for (const mode of ["depart", "arrive"] as const) {
      const at = new Date("2026-09-07T05:30:00.000Z");
      const params = new URLSearchParams("from=tajrish&to=karaj");
      applyTimeParams(params, mode, at);
      expect(params.get("timeMode")).toBe(mode);
      const parsed = parseTimeModeParams(params);
      expect(parsed.mode).toBe(mode);
      expect(parsed.at?.getTime()).toBe(at.getTime());
    }
  });

  it("now clears params and legacy links parse as now", () => {
    const params = new URLSearchParams("from=tajrish&to=karaj&timeMode=arrive&at=2026-09-07T05%3A30%3A00.000Z");
    applyTimeParams(params, "now", null);
    expect(params.has("timeMode")).toBe(false);
    expect(params.has("at")).toBe(false);
    expect(parseTimeModeParams(new URLSearchParams("from=tajrish&to=karaj"))).toEqual({
      mode: "now",
      at: null,
    });
  });

  it("rejects naive timestamps and unknown modes", () => {
    expect(
      parseTimeModeParams(new URLSearchParams("timeMode=depart&at=2026-09-07T14:00:00")),
    ).toEqual({ mode: "now", at: null });
    expect(
      parseTimeModeParams(new URLSearchParams("timeMode=later&at=2026-09-07T14:00:00Z")),
    ).toEqual({ mode: "now", at: null });
  });
});
