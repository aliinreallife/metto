// Dynamic timetable lifecycle: manifest → pinned download → validate →
// persist (IndexedDB) → activate. Fail-closed at every step: the previous
// timetable is never disturbed by a bad update.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  METRO_DATA_MANIFEST_SCHEMA_VERSION,
  isNewerScheduleVersion,
  parseMetroDataManifest,
} from "./manifest";
import { parseScheduleDataset, validateScheduleDataset } from "./validate";
import { MemoryScheduleBackend } from "./store";
import { checkForScheduleUpdate } from "./updater";
import { ensureScheduleData, refreshScheduleData } from "./repository";
import { isDataManifestRequest, isVersionedScheduleRequest } from "./sw-routes";
import type { LineScheduleData } from "../schedule-data";

const VALID_MANIFEST = {
  schemaVersion: 1,
  schedule: { version: "2026-09-13.1", url: "/schedule-data.json?v=2026-09-13.1" },
};

// Minimal but structurally complete timetable using real station slugs.
function validDataset(): LineScheduleData[] {
  return [
    {
      line: 1,
      terminalA: "tajrish",
      terminalB: "kahrizak",
      isBranch: false,
      scheduleKey: "line-1",
      trains: [
        {
          line: 1,
          direction: "tajrish",
          dayType: "saturday_wednesday",
          isExpress: false,
          stops: [
            { stationId: "kahrizak", time: "5:30" },
            { stationId: "gheytariyeh", time: "5:45" },
            { stationId: "tajrish", time: "6:10" },
          ],
        },
      ],
    },
  ];
}

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

describe("metro data manifest", () => {
  it("accepts the committed manifest shape", () => {
    const raw = JSON.parse(
      readFileSync(join(__dirname, "..", "..", "public", "metro-data-manifest.json"), "utf8"),
    );
    const manifest = parseMetroDataManifest(raw);
    expect(manifest).not.toBeNull();
    expect(manifest!.schemaVersion).toBe(METRO_DATA_MANIFEST_SCHEMA_VERSION);
    expect(manifest!.schedule.version.length).toBeGreaterThan(0);
    expect(manifest!.schedule.url.startsWith("/schedule-data.json?v=")).toBe(true);
  });

  it("rejects wrong schema versions, missing fields, and off-origin URLs", () => {
    expect(parseMetroDataManifest(null)).toBeNull();
    expect(parseMetroDataManifest({})).toBeNull();
    expect(
      parseMetroDataManifest({ schemaVersion: 999, schedule: VALID_MANIFEST.schedule }),
    ).toBeNull();
    expect(
      parseMetroDataManifest({ schemaVersion: 1, schedule: { version: "1" } }),
    ).toBeNull();
    expect(
      parseMetroDataManifest({
        schemaVersion: 1,
        schedule: { version: "2026-09-13.1", url: "https://evil.example/s.json" },
      }),
    ).toBeNull();
  });

  it("compares schedule versions (newer / same / older / bundled-unknown)", () => {
    expect(isNewerScheduleVersion("2026-09-13.1", "")).toBe(true);
    expect(isNewerScheduleVersion("2026-09-13.1", "2026-09-13.1")).toBe(false);
    expect(isNewerScheduleVersion("2026-09-14.1", "2026-09-13.1")).toBe(true);
    expect(isNewerScheduleVersion("2026-09-12.9", "2026-09-13.1")).toBe(false);
  });
});

describe("schedule validation", () => {
  it("accepts a minimal valid dataset", () => {
    expect(validateScheduleDataset(validDataset())).toEqual([]);
    expect(parseScheduleDataset(validDataset())).not.toBeNull();
  });

  it("accepts the real bundled timetable (format compatibility)", () => {
    const raw: unknown = JSON.parse(
      readFileSync(join(__dirname, "..", "..", "public", "schedule-data.json"), "utf8"),
    );
    expect(validateScheduleDataset(raw)).toEqual([]);
  });

  it("rejects corrupt JSON shapes", () => {
    expect(parseScheduleDataset(null)).toBeNull();
    expect(parseScheduleDataset({})).toBeNull();
    expect(parseScheduleDataset([])).toBeNull();
    expect(validateScheduleDataset("not json").length).toBeGreaterThan(0);
  });

  it("rejects invalid schemas field by field", () => {
    const missingTrains = deepClone(validDataset());
    // @ts-expect-error deliberately malformed
    delete missingTrains[0].trains;
    expect(parseScheduleDataset(missingTrains)).toBeNull();

    const badDay = deepClone(validDataset());
    // @ts-expect-error deliberately malformed
    badDay[0].trains[0].dayType = "sunday";
    expect(parseScheduleDataset(badDay)).toBeNull();

    const badTime = deepClone(validDataset());
    badTime[0].trains[0].stops[0].time = "25:99";
    expect(parseScheduleDataset(badTime)).toBeNull();

    const singleStop = deepClone(validDataset());
    singleStop[0].trains[0].stops = [{ stationId: "tajrish", time: "6:10" }];
    expect(parseScheduleDataset(singleStop)).toBeNull();

    const lineMismatch = deepClone(validDataset());
    lineMismatch[0].trains[0].line = 2;
    expect(parseScheduleDataset(lineMismatch)).toBeNull();
  });

  it("rejects unknown station references", () => {
    const unknownStop = deepClone(validDataset());
    unknownStop[0].trains[0].stops[1].stationId = "no-such-station-xyz";
    expect(parseScheduleDataset(unknownStop)).toBeNull();

    const unknownDir = deepClone(validDataset());
    unknownDir[0].trains[0].direction = "no-such-station-xyz";
    expect(parseScheduleDataset(unknownDir)).toBeNull();
  });
});

describe("checkForScheduleUpdate", () => {
  const dataset = () => deepClone(validDataset());

  function stubFetch(routes: Record<string, unknown>, calls: string[]) {
    return async (url: string) => {
      calls.push(url);
      if (!(url in routes)) throw new Error(`network-down:${url}`);
      const v = routes[url];
      if (v instanceof Error) throw v;
      return deepClone(v);
    };
  }

  it("returns null (no crash) when the manifest is unavailable", async () => {
    const calls: string[] = [];
    const res = await checkForScheduleUpdate("", {
      fetchJson: stubFetch({}, calls),
      persist: async () => true,
    });
    expect(res).toBeNull();
    expect(calls).toEqual(["/metro-data-manifest.json"]);
  });

  it("does not redownload when the version is unchanged", async () => {
    const calls: string[] = [];
    const res = await checkForScheduleUpdate("2026-09-13.1", {
      fetchJson: stubFetch({ "/metro-data-manifest.json": VALID_MANIFEST }, calls),
      persist: async () => {
        throw new Error("persist must not be called");
      },
    });
    expect(res).toBeNull();
    // Manifest polled, timetable never fetched.
    expect(calls).toEqual(["/metro-data-manifest.json"]);
  });

  it("downloads, validates, and persists a newer timetable", async () => {
    const calls: string[] = [];
    const persisted: { version: string; data: LineScheduleData[] }[] = [];
    const res = await checkForScheduleUpdate("", {
      fetchJson: stubFetch(
        {
          "/metro-data-manifest.json": VALID_MANIFEST,
          "/schedule-data.json?v=2026-09-13.1": dataset(),
        },
        calls,
      ),
      persist: async (u) => {
        persisted.push(u);
        return true;
      },
    });
    expect(res?.version).toBe("2026-09-13.1");
    expect(res?.data).toHaveLength(1);
    expect(persisted).toHaveLength(1);
    expect(calls).toEqual([
      "/metro-data-manifest.json",
      "/schedule-data.json?v=2026-09-13.1",
    ]);
  });

  it("rejects corrupt JSON and invalid schemas without persisting", async () => {
    for (const bad of [null, "garbage", [], { nope: true }]) {
      const persisted: unknown[] = [];
      const res = await checkForScheduleUpdate("", {
        fetchJson: stubFetch(
          {
            "/metro-data-manifest.json": VALID_MANIFEST,
            "/schedule-data.json?v=2026-09-13.1": bad,
          },
          [],
        ),
        persist: async (u) => {
          persisted.push(u);
          return true;
        },
      });
      expect(res).toBeNull();
      expect(persisted).toEqual([]);
    }

    const badSchema = dataset();
    // @ts-expect-error deliberately malformed
    badSchema[0].trains[0].dayType = "sunday";
    const res = await checkForScheduleUpdate("", {
      fetchJson: stubFetch(
        {
          "/metro-data-manifest.json": VALID_MANIFEST,
          "/schedule-data.json?v=2026-09-13.1": badSchema,
        },
        [],
      ),
      persist: async () => true,
    });
    expect(res).toBeNull();
  });

  it("keeps the previous timetable when the download fails", async () => {
    const backend = new MemoryScheduleBackend();
    await backend.write({
      version: "2026-09-01.1",
      updatedAt: new Date().toISOString(),
      data: dataset(),
    });
    const res = await checkForScheduleUpdate("2026-09-01.1", {
      fetchJson: async (url: string) => {
        if (url === "/metro-data-manifest.json") return deepClone(VALID_MANIFEST);
        throw new Error("offline");
      },
      persist: async () => true,
    });
    expect(res).toBeNull();
    // Durable previous entry untouched.
    expect((await backend.read())?.version).toBe("2026-09-01.1");
  });

  it("never activates when IndexedDB persistence fails", async () => {
    const backend = new MemoryScheduleBackend();
    backend.failWrites = true;
    const activated: unknown[] = [];
    const ok = await refreshScheduleData("", {
      fetchJson: stubFetch(
        {
          "/metro-data-manifest.json": VALID_MANIFEST,
          "/schedule-data.json?v=2026-09-13.1": dataset(),
        },
        [],
      ),
      readStored: () => backend.read(),
      persist: async (u) =>
        backend.write({
          version: u.version,
          updatedAt: new Date().toISOString(),
          data: u.data,
        }),
      activate: (data, version) => {
        activated.push({ data, version });
      },
    });
    expect(ok).toBe(false);
    expect(activated).toEqual([]);
  });
});

describe("repository lifecycle", () => {
  const dataset = () => deepClone(validDataset());

  it("first launch offline uses the bundled timetable (version unknown)", async () => {
    const activated: { version: string; lines: number }[] = [];
    const ok = await ensureScheduleData({
      isLoaded: () => false,
      activate: (data, version) => {
        activated.push({ version, lines: data.length });
      },
      fetchJson: async (url: string) => {
        expect(url).toBe("/schedule-data.json");
        return dataset();
      },
      readStored: async () => null,
    });
    expect(ok).toBe(true);
    expect(activated).toEqual([{ version: "", lines: 1 }]);
  });

  it("offline restart loads the updated timetable from IndexedDB without network", async () => {
    const backend = new MemoryScheduleBackend();
    await backend.write({
      version: "2026-09-13.1",
      updatedAt: new Date().toISOString(),
      data: dataset(),
    });
    const fetchJson = vi.fn(async () => {
      throw new Error("must not hit network when IDB has data");
    });
    const activated: { version: string; lines: number }[] = [];
    const ok = await ensureScheduleData({
      isLoaded: () => false,
      activate: (data, version) => {
        activated.push({ version, lines: data.length });
      },
      fetchJson,
      readStored: () => backend.read(),
    });
    expect(ok).toBe(true);
    expect(fetchJson).not.toHaveBeenCalled();
    expect(activated).toEqual([{ version: "2026-09-13.1", lines: 1 }]);
  });

  it("corrupt IndexedDB entry falls back to bundled data", async () => {
    const activated: { version: string }[] = [];
    const ok = await ensureScheduleData({
      isLoaded: () => false,
      activate: (data, version) => {
        activated.push({ version });
      },
      fetchJson: async () => dataset(),
      readStored: async () => ({ version: "bogus", data: [{ broken: true }] as unknown as LineScheduleData[] }),
    });
    expect(ok).toBe(true);
    expect(activated).toEqual([{ version: "" }]);
  });

  it("newer timetable becomes the active data source via refresh", async () => {
    const activated: { version: string; lines: number }[] = [];
    const ok = await refreshScheduleData("", {
      fetchJson: async (url: string) => {
        if (url === "/metro-data-manifest.json") return deepClone(VALID_MANIFEST);
        return dataset();
      },
      persist: async () => true,
      activate: (data, version) => {
        activated.push({ version, lines: data.length });
      },
    });
    expect(ok).toBe(true);
    expect(activated).toEqual([{ version: "2026-09-13.1", lines: 1 }]);
  });

  it("failed refresh preserves the previous timetable", async () => {
    const activated: unknown[] = [];
    const ok = await refreshScheduleData("2026-09-13.1", {
      fetchJson: async () => {
        throw new Error("offline");
      },
      activate: (data, version) => {
        activated.push({ data, version });
      },
    });
    expect(ok).toBe(false);
    expect(activated).toEqual([]);
  });
});

describe("service-worker routing contract", () => {
  it("matches the update manifest but nothing else", () => {
    expect(isDataManifestRequest("/metro-data-manifest.json")).toBe(true);
    expect(isDataManifestRequest("/schedule-data.json")).toBe(false);
    expect(isDataManifestRequest("/holidays.version.json")).toBe(false);
  });

  it("routes only version-pinned schedule downloads to the network", () => {
    // Stale precache must never shadow the versioned request.
    expect(isVersionedScheduleRequest("/schedule-data.json", "?v=2026-09-13.1")).toBe(true);
    // Bare precached fallback keeps its deterministic precache route.
    expect(isVersionedScheduleRequest("/schedule-data.json", "")).toBe(false);
    expect(isVersionedScheduleRequest("/holidays.json", "?v=1")).toBe(false);
    expect(isVersionedScheduleRequest("/other.json", "?v=1")).toBe(false);
  });

  it("introduces no tile-prefetch, enumeration, or pack logic", () => {
    // The dynamic-data modules must never touch the tile CDN: bulk
    // downloading is prohibited by the provider terms, and the
    // opportunistic 300-tile cache is deliberately the only tile path.
    const forbidden = ["cartocdn", "arcgisonline", "prefetch", "tile-pack", "tilepack"];
    for (const file of ["manifest.ts", "validate.ts", "store.ts", "updater.ts", "repository.ts", "sw-routes.ts"]) {
      const src = readFileSync(join(__dirname, file), "utf8").toLowerCase();
      for (const token of forbidden) {
        expect(src, `${file} must not contain ${token}`).not.toContain(token);
      }
    }
  });
});

describe("schedule-utils integration", () => {
  beforeEach(async () => {
    const utils = await import("../schedule-utils");
    utils.__setScheduleDataForTests(null);
  });

  it("starts with unknown version and activates bundled data offline-first", async () => {
    const utils = await import("../schedule-utils");
    expect(utils.getActiveScheduleVersion()).toBe("");
    expect(utils.isScheduleDataLoaded()).toBe(false);
  });

  it("all consumers read the dynamically activated timetable", async () => {
    const utils = await import("../schedule-utils");
    const raw: unknown = JSON.parse(
      readFileSync(join(__dirname, "..", "..", "public", "schedule-data.json"), "utf8"),
    );
    utils.__setScheduleDataForTests(raw as LineScheduleData[]);
    expect(utils.isScheduleDataLoaded()).toBe(true);
    // Offline planner path works against the activated data.
    const departures = utils.getNextDepartures("tajrish", 1, "saturday_wednesday", 3);
    expect(Array.isArray(departures)).toBe(true);
    utils.__setScheduleDataForTests(null);
    expect(utils.isScheduleDataLoaded()).toBe(false);
  });
});
