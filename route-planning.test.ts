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
  getDayTypeForServiceDate,
  parseTimeModeParams,
  applyTimeParams,
  planRoute,
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
    }, { tripLookup: scriptForward(legs) });
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
    }, { tripLookup: scriptForward(legs) });
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
    }, { tripLookup: fwd(), reverseTripLookup: rev() });
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
    }, { tripLookup: scriptForward(trap), reverseTripLookup: scriptReverse(trap) });
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
    }, { tripLookup: scriptForward(tie), reverseTripLookup: scriptReverse(tie) });
    expect(r).not.toBeNull();
    expect(r!.trips[0]?.arriveTime).toBe("08:50");
  });

  it("returns null when nothing arrives by the deadline", () => {
    const r = planRoute("tehran-sadeghiyeh", "tarasht", {
      mode: "arrive-by",
      at: MON(8, 0),
    }, { tripLookup: fwd(), reverseTripLookup: rev() });
    expect(r).toBeNull();
  });

  it("mirrors the missing-data fallback (estimated, still ok)", () => {
    const missing: ScriptLeg[] = [
      { from: "tehran-sadeghiyeh", to: "tarasht", line: 2, status: "missing_schedule_data" },
    ];
    const r = planRoute("tehran-sadeghiyeh", "tarasht", {
      mode: "arrive-by",
      at: MON(9, 0),
    }, { tripLookup: scriptForward(missing), reverseTripLookup: scriptReverse(missing) });
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
    }, { tripLookup: scriptForward(legs), reverseTripLookup: scriptReverse(legs) });
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
    }, { tripLookup: scriptForward(missed), reverseTripLookup: scriptReverse(missed) });
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
    }, { tripLookup: scriptForward(three), reverseTripLookup: scriptReverse(three) });
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
    }, { tripLookup: scriptForward(legs), reverseTripLookup: scriptReverse(legs) });
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
    expect(findTripArrivingByDetailed("a", "b", 2, 540)).toEqual({
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
