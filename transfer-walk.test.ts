import { afterEach, describe, expect, it } from "vitest";
import { findRoute, type TripLookupArgs } from "./lib/route";
import {
  DEFAULT_TRANSFER_WALK_SECONDS,
  getTransferWalkSeconds,
  hasExplicitTransferRule,
  validateTransferRules,
} from "./lib/metro/transfers";
import { validateMetro } from "./lib/metro/validation";
import {
  __setScheduleDataForTests,
  findTripDetailed,
  type TripLookupResult,
  type TripResult,
} from "./lib/schedule-utils";
import type { LineScheduleData } from "./lib/schedule-data";
import {
  parseServiceTimeToMinutes,
  tehranMinuteToInstant,
  tehranParts,
} from "./lib/tehran-time";

// Fixed Tehran service date (Monday -> saturday_wednesday timetable).
const DATE = "2026-09-07";
const T = (hh: number, mm: number): Date =>
  new Date(tehranMinuteToInstant(DATE, hh * 60 + mm));
const MISSING = (): TripLookupResult => ({ status: "missing_schedule_data" });

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

/** Scripted timetable: earliest arrival with depart >= afterMinutes wins. */
function scriptLookup(legs: ScriptLeg[], calls: TripLookupArgs[] = []) {
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

afterEach(() => {
  __setScheduleDataForTests(null);
});

describe("transfer rules", () => {
  it("gives Eram-e Sabz 480s both directions", () => {
    expect(getTransferWalkSeconds("eram-e-sabz", 4, 5)).toBe(480);
    expect(getTransferWalkSeconds("eram-e-sabz", 5, 4)).toBe(480);
  });

  it("keeps the generic default for ordinary interchanges", () => {
    expect(DEFAULT_TRANSFER_WALK_SECONDS).toBe(240);
    expect(getTransferWalkSeconds("imam-khomeini", 1, 2)).toBe(240);
    expect(getTransferWalkSeconds("tehran-sadeghiyeh", 2, 5)).toBe(240);
  });

  it("flags explicit rules for UI (not a >4min threshold)", () => {
    expect(hasExplicitTransferRule("eram-e-sabz", 4, 5)).toBe(true);
    expect(hasExplicitTransferRule("eram-e-sabz", 5, 4)).toBe(true);
    expect(hasExplicitTransferRule("imam-khomeini", 1, 2)).toBe(false);
  });

  it("falls back to the line-level rule for route-qualified lookups", () => {
    expect(
      getTransferWalkSeconds("eram-e-sabz", 4, 5, "line-4-main", "line-5-main"),
    ).toBe(480);
  });

  it("validates rule uniqueness and interchange membership", () => {
    expect(validateTransferRules()).toEqual([]);
    expect(validateMetro()).toEqual([]);
  });
});

describe("Eram-e Sabz routing (fallback timing)", () => {
  it("L4 -> L5 transfers at Eram with +480s walk", () => {
    const r = findRoute("shahrak-e-ekbatan", "varzeshgah-e-azadi", {
      departAt: T(10, 2),
      tripLookup: MISSING,
    });
    expect(r).not.toBeNull();
    expect(r!.numTransfers).toBe(1);
    expect(r!.numTrainChanges).toBe(0);
    expect(r!.path).toContain("eram-e-sabz");
    const change = r!.segments[1].changeFromPrevious;
    expect(change.type).toBe("line_transfer");
    if (change.type !== "line_transfer") throw new Error("expected transfer");
    expect(change.stationId).toBe("eram-e-sabz");
    expect(change.walkSeconds).toBe(480);
    // Walk contributes to duration/arrival/ranking inputs but not to waiting.
    expect(r!.transferWalkSeconds).toBe(480);
    expect(r!.transferWaitSeconds).toBe(0);
    expect(r!.initialWaitSeconds).toBe(0);
    expect(r!.totalSeconds).toBe(r!.rideSeconds + 480);
    expect(r!.estimatedArrival).not.toBeNull();
    expect(r!.connections).toHaveLength(1);
    expect(r!.connections[0].walkSeconds).toBe(480);
    expect(r!.connections[0].hasExplicitRule).toBe(true);
  });

  it("L5 -> L4 transfers at Eram with +480s walk", () => {
    const r = findRoute("varzeshgah-e-azadi", "shahrak-e-ekbatan", {
      departAt: T(10, 2),
      tripLookup: MISSING,
    });
    expect(r).not.toBeNull();
    expect(r!.numTransfers).toBe(1);
    const change = r!.segments[1].changeFromPrevious;
    expect(change.type).toBe("line_transfer");
    if (change.type !== "line_transfer") throw new Error("expected transfer");
    expect(change.walkSeconds).toBe(480);
    expect(r!.transferWalkSeconds).toBe(480);
  });

  it("passing through Eram on L5 adds no transfer time", () => {
    const r = findRoute("tehran-sadeghiyeh", "varzeshgah-e-azadi", {
      departAt: T(10, 2),
      tripLookup: MISSING,
    });
    expect(r).not.toBeNull();
    expect(r!.path).toContain("eram-e-sabz");
    expect(r!.numTransfers).toBe(0);
    expect(r!.transferWalkSeconds).toBe(0);
    expect(r!.connections).toHaveLength(0);
  });

  it("remaining on L4 adds no transfer time", () => {
    const r = findRoute("shahrak-e-ekbatan", "allameh-jafari", {
      departAt: T(10, 2),
      tripLookup: MISSING,
    });
    expect(r).not.toBeNull();
    expect(r!.numTransfers).toBe(0);
    expect(r!.transferWalkSeconds).toBe(0);
  });

  it("other interchanges keep the 240s default without special UI", () => {
    const r = findRoute("tajrish", "farhangsara", {
      departAt: T(10, 2),
      tripLookup: MISSING,
    });
    expect(r).not.toBeNull();
    expect(r!.numTransfers).toBeGreaterThanOrEqual(1);
    for (const c of r!.connections) {
      if (c.type !== "line_transfer") continue;
      expect(c.walkSeconds).toBe(240);
      expect(c.hasExplicitRule).toBe(false);
    }
    expect(
      r!.transferWalkSeconds,
    ).toBe(r!.numTransfers * DEFAULT_TRANSFER_WALK_SECONDS);
  });

  it("keeps the seconds ledger consistent and travelTimeOnly wait-free", () => {
    const r = findRoute("shahrak-e-ekbatan", "varzeshgah-e-azadi", {
      departAt: T(10, 2),
      tripLookup: MISSING,
    });
    expect(r).not.toBeNull();
    expect(r!.totalSeconds).toBe(
      r!.initialWaitSeconds +
        r!.rideSeconds +
        r!.transferWalkSeconds +
        r!.transferWaitSeconds +
        r!.trainChangeWaitSeconds,
    );
    expect(r!.estimatedSeconds).toBe(r!.totalSeconds);
    expect(r!.travelTimeOnly).toBe(
      Math.round((r!.rideSeconds + r!.transferWalkSeconds) / 60),
    );
  });
});

describe("chronological ETA engine", () => {
  it("counts origin wait from requested departure (10:02 -> 10:07 = 5 min)", () => {
    const r = findRoute("tehran-sadeghiyeh", "tarasht", {
      departAt: T(10, 2),
      tripLookup: scriptLookup([
        {
          from: "tehran-sadeghiyeh",
          to: "tarasht",
          line: 2,
          status: "found",
          departures: [{ depart: "10:07", arrive: "10:12" }],
        },
      ]),
    });
    expect(r).not.toBeNull();
    expect(r!.initialWaitSeconds).toBe(300);
    expect(r!.rideSeconds).toBe(300);
    expect(r!.totalSeconds).toBe(600);
    expect(r!.estimatedArrival).toBe("10:12");
    expect(r!.legTiming).toEqual(["timetable"]);
  });

  it("walks before searching: ready 10:39 skips the 10:36, takes 10:44", () => {
    const calls: TripLookupArgs[] = [];
    const r = findRoute("shahrak-e-ekbatan", "varzeshgah-e-azadi", {
      departAt: T(10, 2),
      tripLookup: scriptLookup(
        [
          {
            from: "shahrak-e-ekbatan",
            to: "eram-e-sabz",
            line: 4,
            status: "found",
            departures: [{ depart: "10:07", arrive: "10:31" }],
          },
          {
            from: "eram-e-sabz",
            to: "varzeshgah-e-azadi",
            line: 5,
            status: "found",
            departures: [
              { depart: "10:36", arrive: "10:40" },
              { depart: "10:44", arrive: "10:48" },
            ],
          },
        ],
        calls,
      ),
    });
    expect(r).not.toBeNull();
    // The connecting search started from the ready instant (10:39 = 639).
    expect(calls[1].afterMinutes).toBe(639);
    const conn = r!.connections[0];
    expect(conn.arriveAt).toBe("10:31");
    expect(conn.walkSeconds).toBe(480);
    expect(conn.readyAt).toBe("10:39");
    expect(conn.nextDepartureAt).toBe("10:44");
    expect(conn.waitSeconds).toBe(300);
    expect(conn.status).toBe("ok");
    // travelTimeOnly includes the walk but excludes every wait.
    expect(r!.travelTimeOnly).toBe(
      Math.round((r!.rideSeconds + r!.transferWalkSeconds) / 60),
    );
    expect(r!.initialWaitSeconds).toBe(300);
    expect(r!.transferWaitSeconds).toBe(300);
    expect(r!.transferWalkSeconds).toBe(480);
    expect(r!.totalSeconds).toBe(300 + 24 * 60 + 480 + 300 + 4 * 60);
    expect(r!.estimatedArrival).toBe("10:48");
    expect(r!.reachableUntilStationId).toBe("varzeshgah-e-azadi");
  });

  it("propagates across two transfers without resetting to departure", () => {
    const calls: TripLookupArgs[] = [];
    const r = findRoute("tajrish", "karaj", {
      departAt: T(10, 2),
      tripLookup: scriptLookup(
        [
          {
            from: "tajrish",
            to: "imam-khomeini",
            line: 1,
            status: "found",
            departures: [{ depart: "10:05", arrive: "10:20" }],
          },
          {
            from: "imam-khomeini",
            to: "tehran-sadeghiyeh",
            line: 2,
            status: "found",
            departures: [
              { depart: "10:22", arrive: "10:38" },
              { depart: "10:27", arrive: "10:40" },
            ],
          },
          {
            from: "tehran-sadeghiyeh",
            to: "karaj",
            line: 5,
            status: "found",
            departures: [
              { depart: "10:41", arrive: "10:58" },
              { depart: "10:47", arrive: "11:00" },
            ],
          },
        ],
        calls,
      ),
    });
    expect(r).not.toBeNull();
    expect(r!.numTransfers).toBe(2);
    // Default walks, each applied before its next search.
    expect(r!.connections[0].walkSeconds).toBe(240);
    expect(r!.connections[0].readyAt).toBe("10:24");
    expect(r!.connections[0].nextDepartureAt).toBe("10:27");
    expect(r!.connections[1].walkSeconds).toBe(240);
    expect(r!.connections[1].readyAt).toBe("10:44");
    expect(r!.connections[1].nextDepartureAt).toBe("10:47");
    // Second search starts from the fully propagated time (10:44 = 644).
    expect(calls[2].afterMinutes).toBe(644);
    expect(r!.estimatedArrival).toBe("11:00");
  });

  it("searches the next branch service only after reaching the junction", () => {
    const calls: TripLookupArgs[] = [];
    const r = findRoute("holy-shrine-of-imam-khomeini", "shahr-e-parand", {
      departAt: T(10, 0),
      tripLookup: scriptLookup(
        [
          {
            from: "holy-shrine-of-imam-khomeini",
            to: "shahed-baghershahr",
            line: 1,
            status: "found",
            departures: [{ depart: "10:04", arrive: "10:08" }],
          },
          {
            from: "shahed-baghershahr",
            to: "shahr-e-parand",
            line: 1,
            status: "found",
            departures: [
              { depart: "10:05", arrive: "10:25" },
              { depart: "10:14", arrive: "10:30" },
            ],
          },
        ],
        calls,
      ),
    });
    expect(r).not.toBeNull();
    expect(r!.numTransfers).toBe(0);
    expect(r!.numTrainChanges).toBe(1);
    expect(calls[1].afterMinutes).toBe(608);
    const conn = r!.connections[0];
    expect(conn.type).toBe("train_change");
    expect(conn.walkSeconds).toBe(0);
    expect(conn.arriveAt).toBe("10:08");
    expect(conn.readyAt).toBe("10:08");
    expect(conn.nextDepartureAt).toBe("10:14");
    expect(conn.waitSeconds).toBe(360);
    expect(r!.trainChangeWaitSeconds).toBe(360);
    expect(r!.transferWalkSeconds).toBe(0);
  });

  it("runs a timetable leg from a fallback leg's arrival", () => {
    const calls: TripLookupArgs[] = [];
    const r = findRoute("shahrak-e-ekbatan", "varzeshgah-e-azadi", {
      departAt: T(10, 2),
      tripLookup: scriptLookup(
        [
          { from: "shahrak-e-ekbatan", to: "eram-e-sabz", line: 4, status: "missing_schedule_data" },
          {
            from: "eram-e-sabz",
            to: "varzeshgah-e-azadi",
            line: 5,
            status: "found",
            departures: [{ depart: "11:00", arrive: "11:04" }],
          },
        ],
        calls,
      ),
    });
    expect(r).not.toBeNull();
    expect(r!.legTiming).toEqual(["estimated", "timetable"]);
    expect(r!.connections[0].status).toBe("estimated");
    // The Line 5 search started from fallback arrival + 480s walk.
    const fallbackRide = r!.rideSeconds - 240;
    const expectedReady = tehranParts(T(10, 2).getTime() + (fallbackRide + 480) * 1000);
    expect(calls[1].afterMinutes).toBe(expectedReady.minuteOfDay);
    expect(r!.estimatedArrival).toBe("11:04");
  });

  it("nulls the ETA on no_service but keeps the reachable partial", () => {
    const r = findRoute("shahrak-e-ekbatan", "varzeshgah-e-azadi", {
      departAt: T(10, 2),
      tripLookup: scriptLookup([
        {
          from: "shahrak-e-ekbatan",
          to: "eram-e-sabz",
          line: 4,
          status: "found",
          departures: [{ depart: "10:07", arrive: "10:31" }],
        },
        { from: "eram-e-sabz", to: "varzeshgah-e-azadi", line: 5, status: "no_service" },
      ]),
    });
    expect(r).not.toBeNull();
    expect(r!.estimatedArrival).toBeNull();
    expect(r!.reachableUntilStationId).toBe("eram-e-sabz");
    expect(r!.reachableUntil).toBe("10:39");
    expect(r!.legTiming).toEqual(["timetable", "no-service"]);
    expect(r!.connections[0].status).toBe("no-service");
    expect(r!.connections[0].nextDepartureAt).toBeNull();
  });
});

describe("journey status", () => {
  it("reports complete with a destination ETA on success", () => {
    const r = findRoute("shahrak-e-ekbatan", "varzeshgah-e-azadi", {
      departAt: T(10, 2),
      tripLookup: scriptLookup([
        {
          from: "shahrak-e-ekbatan",
          to: "eram-e-sabz",
          line: 4,
          status: "found",
          departures: [{ depart: "10:07", arrive: "10:31" }],
        },
        {
          from: "eram-e-sabz",
          to: "varzeshgah-e-azadi",
          line: 5,
          status: "found",
          departures: [{ depart: "10:44", arrive: "10:48" }],
        },
      ]),
    });
    expect(r).not.toBeNull();
    expect(r!.status).toBe("complete");
    expect(r!.estimatedArrival).toBe("10:48");
    expect(r!.reachableUntilStationId).toBe("varzeshgah-e-azadi");
    expect(r!.reachableUntil).toBe("10:48");
  });

  it("reports no_service with null ETA and partial reachability", () => {
    const r = findRoute("shahrak-e-ekbatan", "varzeshgah-e-azadi", {
      departAt: T(10, 2),
      tripLookup: scriptLookup([
        {
          from: "shahrak-e-ekbatan",
          to: "eram-e-sabz",
          line: 4,
          status: "found",
          departures: [{ depart: "10:07", arrive: "10:31" }],
        },
        { from: "eram-e-sabz", to: "varzeshgah-e-azadi", line: 5, status: "no_service" },
      ]),
    });
    expect(r).not.toBeNull();
    expect(r!.status).toBe("no_service");
    expect(r!.estimatedArrival).toBeNull();
    expect(r!.reachableUntilStationId).toBe("eram-e-sabz");
    expect(r!.reachableUntil).toBe("10:39");
    // estimatedSeconds stays backward compatible but covers time only up to
    // reachableUntil: origin wait + first ride + Eram walk, no onward legs.
    expect(r!.totalSeconds).toBe(300 + 24 * 60 + 480);
    expect(r!.estimatedSeconds).toBe(r!.totalSeconds);
  });
});

describe("typed trip lookup", () => {
  const line9: LineScheduleData = {
    line: 9,
    terminalA: "a",
    terminalB: "b",
    isBranch: false,
    scheduleKey: "t",
    trains: [
      {
        line: 9,
        direction: "b",
        dayType: "saturday_wednesday",
        isExpress: false,
        stops: [
          { stationId: "a", time: "10:00" },
          { stationId: "b", time: "10:10" },
        ],
      },
    ],
  };

  it("distinguishes found / missing data / no service per lookup", () => {
    expect(findTripDetailed("a", "b", 9, 0)).toEqual({
      status: "missing_schedule_data",
    });
    __setScheduleDataForTests([line9]);
    const { dayType } = tehranParts(T(10, 0).getTime());
    expect(findTripDetailed("a", "b", 9, 600, dayType).status).toBe("found");
    expect(findTripDetailed("a", "b", 9, 660, dayType)).toEqual({
      status: "no_service",
    });
    // No rows for this line at all -> missing, not no_service.
    expect(findTripDetailed("a", "b", 8, 600, dayType)).toEqual({
      status: "missing_schedule_data",
    });
  });
});

describe("tehran time layer", () => {
  it("round-trips a wall time and parses post-midnight service times", () => {
    expect(parseServiceTimeToMinutes("24:06")).toBe(1446);
    const p = tehranParts(T(10, 2).getTime());
    expect(p.dateStr).toBe(DATE);
    expect(p.minuteOfDay).toBe(602);
    expect(p.dayType).toBe("saturday_wednesday");
  });

  it("lets a trip itself cross midnight", () => {
    const r = findRoute("tehran-sadeghiyeh", "tarasht", {
      departAt: T(23, 45),
      tripLookup: scriptLookup([
        {
          from: "tehran-sadeghiyeh",
          to: "tarasht",
          line: 2,
          status: "found",
          departures: [{ depart: "23:50", arrive: "24:06" }],
        },
      ]),
    });
    expect(r).not.toBeNull();
    expect(r!.rideSeconds).toBe(16 * 60);
    expect(r!.estimatedArrival).toBe("00:06");
  });
});
