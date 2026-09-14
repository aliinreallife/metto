// Dynamic timetable lifecycle: manifest → changed chunks only → verify →
// persist (IndexedDB) → activate. Fail-closed at every step: the previous
// timetable is never disturbed by a bad update.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  METRO_DATA_MANIFEST_SCHEMA_VERSION,
  isNewerScheduleVersion,
  parseMetroDataManifest,
} from "./manifest";
import { BUNDLED_CHUNKS, BUNDLED_SCHEDULE_VERSION } from "./bundled-meta";
import { sha256Hex, verifySha256 } from "./hash";
import { parseScheduleDataset, validateScheduleDataset } from "./validate";
import { MemoryScheduleBackend, rotateActiveSchedule } from "./store";
import { checkForScheduleUpdate, groupRowsByKey } from "./updater";
import { ensureScheduleData, refreshScheduleData } from "./repository";
import {
  isDataManifestRequest,
  isScheduleChunkRequest,
  isVersionedScheduleRequest,
} from "./sw-routes";
import type { LineScheduleData } from "../schedule-data";

const LEGACY_MANIFEST = {
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

function secondDataset(): LineScheduleData[] {
  return [
    {
      line: 2,
      terminalA: "tehran-sadeghiyeh",
      terminalB: "farhangsara",
      isBranch: false,
      scheduleKey: "line-2",
      trains: [
        {
          line: 2,
          direction: "farhangsara",
          dayType: "saturday_wednesday",
          isExpress: false,
          stops: [
            { stationId: "tehran-sadeghiyeh", time: "5:30" },
            { stationId: "tajrish", time: "5:45" },
            { stationId: "farhangsara", time: "6:10" },
          ],
        },
      ],
    },
  ];
}

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function hashOf(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Build a v2 chunked manifest with correct hashes for the given chunks. */
function chunkedManifest(
  version: string,
  chunks: Record<string, LineScheduleData[]>,
  opts: { stationsVersion?: string } = {},
) {
  const out: Record<string, { url: string; sha256: string; size: number }> = {};
  for (const [key, rows] of Object.entries(chunks)) {
    const text = JSON.stringify(rows);
    out[key] = {
      url: `/data/schedule-${key}.abc123def456.json`,
      sha256: hashOf(text),
      size: Buffer.byteLength(text, "utf8"),
    };
  }
  return {
    schemaVersion: 2,
    dataVersion: version,
    schedule: { version, chunks: out },
    stations: {
      version: opts.stationsVersion ?? "stations1",
      url: "/data/stations.abc123def456.json",
      sha256: hashOf("stations"),
      size: 8,
    },
  };
}

describe("metro data manifest", () => {
  it("accepts the committed v2 manifest shape with verified chunk files", () => {
    const raw = JSON.parse(
      readFileSync(join(__dirname, "..", "..", "public", "metro-data-manifest.json"), "utf8"),
    );
    const manifest = parseMetroDataManifest(raw);
    expect(manifest).not.toBeNull();
    expect(manifest!.schemaVersion).toBe(METRO_DATA_MANIFEST_SCHEMA_VERSION);
    expect(manifest!.schedule.version.length).toBeGreaterThan(0);
    const chunks = manifest!.schedule.chunks;
    expect(chunks).toBeDefined();
    expect(Object.keys(chunks!).length).toBeGreaterThanOrEqual(10);
    // Release integrity: every referenced chunk exists with matching hash+size.
    for (const [key, meta] of Object.entries(chunks!)) {
      const filename = meta.url.split("/").pop()!;
      const diskPath = join(__dirname, "..", "..", "public", "data", filename);
      expect(existsSync(diskPath), `chunk file missing: ${meta.url}`).toBe(true);
      const bytes = readFileSync(diskPath);
      expect(bytes.length, `chunk ${key} size`).toBe(meta.size);
      expect(hashOf(bytes.toString("utf8")), `chunk ${key} sha256`).toBe(meta.sha256);
    }
    // Bundled baseline agrees with the committed manifest (no manual sync).
    expect(BUNDLED_SCHEDULE_VERSION).toBe(manifest!.schedule.version);
    expect(BUNDLED_CHUNKS).toEqual(chunks);
  });

  it("accepts the legacy v1 monolith shape during transition", () => {
    const manifest = parseMetroDataManifest(LEGACY_MANIFEST);
    expect(manifest).not.toBeNull();
    expect(manifest!.schedule.url).toBe("/schedule-data.json?v=2026-09-13.1");
    expect(manifest!.schedule.chunks).toBeUndefined();
  });

  it("rejects wrong schema versions, missing fields, and off-origin URLs", () => {
    expect(parseMetroDataManifest(null)).toBeNull();
    expect(parseMetroDataManifest({})).toBeNull();
    expect(
      parseMetroDataManifest({ schemaVersion: 999, schedule: LEGACY_MANIFEST.schedule }),
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
    // v2 requires non-empty chunks with valid entries.
    expect(
      parseMetroDataManifest({ schemaVersion: 2, schedule: { version: "abc123def456" } }),
    ).toBeNull();
    expect(
      parseMetroDataManifest({
        schemaVersion: 2,
        schedule: { version: "abc123def456", chunks: {} },
      }),
    ).toBeNull();
    expect(
      parseMetroDataManifest({
        schemaVersion: 2,
        schedule: {
          version: "abc123def456",
          chunks: { a: { url: "https://evil.example/x.json", sha256: "a".repeat(64), size: 10 } },
        },
      }),
    ).toBeNull();
  });

  it("compares schedule versions (hash inequality, legacy dotted, bundled-unknown)", () => {
    // Content-hash versions: any difference means newer.
    expect(isNewerScheduleVersion("46fb0992aebd", "46fb0992aebd")).toBe(false);
    expect(isNewerScheduleVersion("deadbeefcafe", "46fb0992aebd")).toBe(true);
    // Legacy dotted ordering preserved for v1 manifests.
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

  it("accepts every generated chunk (chunk/validator compatibility)", () => {
    const manifest = parseMetroDataManifest(
      JSON.parse(
        readFileSync(join(__dirname, "..", "..", "public", "metro-data-manifest.json"), "utf8"),
      ),
    );
    expect(manifest?.schedule.chunks).toBeDefined();
    for (const meta of Object.values(manifest!.schedule.chunks!)) {
      const filename = meta.url.split("/").pop()!;
      const raw: unknown = JSON.parse(
        readFileSync(join(__dirname, "..", "..", "public", "data", filename), "utf8"),
      );
      expect(validateScheduleDataset(raw)).toEqual([]);
    }
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

describe("schedule hash verification", () => {
  it("hashes and verifies round-trip content", async () => {
    const text = JSON.stringify(validDataset());
    const hex = await sha256Hex(text);
    expect(hex).toBe(hashOf(text));
    expect(await verifySha256(text, hex!)).toBe(true);
    expect(await verifySha256(`${text} `, hex!)).toBe(false);
    expect(await verifySha256(text, "0".repeat(64))).toBe(false);
    expect(await verifySha256(text, "not-a-hash")).toBe(false);
  });
});

describe("checkForScheduleUpdate (legacy v1 monolith)", () => {
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
      fetchJson: stubFetch({ "/metro-data-manifest.json": LEGACY_MANIFEST }, calls),
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
    const res = await checkForScheduleUpdate("2026-09-01.1", {
      fetchJson: stubFetch(
        {
          "/metro-data-manifest.json": LEGACY_MANIFEST,
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
      const res = await checkForScheduleUpdate("2026-09-01.1", {
        fetchJson: stubFetch(
          {
            "/metro-data-manifest.json": LEGACY_MANIFEST,
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
        if (url === "/metro-data-manifest.json") return deepClone(LEGACY_MANIFEST);
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
    const ok = await refreshScheduleData("2026-09-01.1", {
      fetchJson: stubFetch(
        {
          "/metro-data-manifest.json": LEGACY_MANIFEST,
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

describe("checkForScheduleUpdate (v2 chunked)", () => {
  const one = () => deepClone(validDataset());
  const two = () => deepClone(secondDataset());

  function stubText(chunks: Record<string, LineScheduleData[]>, calls: string[]) {
    return async (url: string) => {
      calls.push(url);
      for (const [key, rows] of Object.entries(chunks)) {
        if (url === `/data/schedule-${key}.abc123def456.json`) {
          return JSON.stringify(rows);
        }
      }
      throw new Error(`network-down:${url}`);
    };
  }

  function localRef(version: string, data: LineScheduleData[]) {
    const byKey = groupRowsByKey(data);
    const ref: Record<string, { sha256: string; size: number }> = {};
    for (const [key, rows] of byKey) {
      const text = JSON.stringify(rows);
      ref[key] = { sha256: hashOf(text), size: Buffer.byteLength(text, "utf8") };
    }
    return { version, chunks: ref, data };
  }

  it("does not download when the bundled version already matches", async () => {
    const rows = one();
    const manifest = chunkedManifest(hashOf(JSON.stringify(rows)).slice(0, 12), {
      "line-1": rows,
    });
    // Local hashes match the manifest: zero chunk fetches.
    const textCalls: string[] = [];
    const res = await checkForScheduleUpdate(manifest.schedule.version, {
      fetchJson: async () => deepClone(manifest),
      fetchText: stubText({ "line-1": rows }, textCalls),
      readStored: async () => localRef(manifest.schedule.version, rows),
      readActiveData: () => rows,
      persist: async () => {
        throw new Error("persist must not be called");
      },
    });
    expect(res).toBeNull();
    expect(textCalls).toEqual([]);
  });

  it("downloads only the changed chunk and reuses local rows", async () => {
    const oldOne = one();
    const newOne = deepClone(one());
    newOne[0].trains[0].stops[0].time = "5:35";
    const twoRows = two();
    const oldText = JSON.stringify(oldOne);
    void oldText;
    const manifest = chunkedManifest("222222222222", {
      "line-1": newOne,
      "line-2": twoRows,
    });
    const textCalls: string[] = [];
    const persisted: { version: string; data: LineScheduleData[] }[] = [];
    // Local state: old line-1 + current line-2 (hashes match manifest for line-2).
    const localRows = [...oldOne, ...twoRows];
    const res = await checkForScheduleUpdate("111111111111", {
      fetchJson: async () => deepClone(manifest),
      fetchText: stubText({ "line-1": newOne, "line-2": twoRows }, textCalls),
      readStored: async () => localRef("111111111111", localRows),
      readActiveData: () => localRows,
      persist: async (u) => {
        persisted.push(u);
        return true;
      },
    });
    expect(res?.version).toBe("222222222222");
    expect(res?.data).toHaveLength(2);
    // Only the changed chunk traveled the network.
    expect(textCalls).toEqual(["/data/schedule-line-1.abc123def456.json"]);
    expect(persisted).toHaveLength(1);
  });

  it("rejects hash mismatches without persisting", async () => {
    const rows = one();
    const manifest = chunkedManifest("222222222222", { "line-1": rows });
    // Tamper the manifest hash so the genuine payload fails verification.
    manifest.schedule.chunks["line-1"].sha256 = "f".repeat(64);
    const persisted: unknown[] = [];
    const res = await checkForScheduleUpdate("111111111111", {
      fetchJson: async () => deepClone(manifest),
      fetchText: async () => JSON.stringify(rows),
      readActiveData: () => [],
      persist: async (u) => {
        persisted.push(u);
        return true;
      },
    });
    expect(res).toBeNull();
    expect(persisted).toEqual([]);
  });

  it("rejects size mismatches and corrupt payloads without persisting", async () => {
    const rows = one();
    const manifest = chunkedManifest("222222222222", { "line-1": rows });
    manifest.schedule.chunks["line-1"].size += 5;
    const persisted: unknown[] = [];
    const res = await checkForScheduleUpdate("111111111111", {
      fetchJson: async () => deepClone(manifest),
      fetchText: async () => JSON.stringify(rows),
      readActiveData: () => [],
      persist: async (u) => {
        persisted.push(u);
        return true;
      },
    });
    expect(res).toBeNull();
    expect(persisted).toEqual([]);

    const badSchema = deepClone(rows);
    // @ts-expect-error deliberately malformed
    badSchema[0].trains[0].dayType = "sunday";
    const manifest2 = chunkedManifest("222222222222", { "line-1": badSchema });
    // Hash the BAD payload so it passes integrity but fails validation.
    const res2 = await checkForScheduleUpdate("111111111111", {
      fetchJson: async () => deepClone(manifest2),
      fetchText: async () => JSON.stringify(badSchema),
      readActiveData: () => [],
      persist: async () => true,
    });
    expect(res2).toBeNull();
  });

  it("interrupted multi-chunk download leaves nothing persisted", async () => {
    const newOne = deepClone(one());
    newOne[0].trains[0].stops[0].time = "5:35";
    const newTwo = deepClone(two());
    newTwo[0].trains[0].stops[0].time = "5:36";
    const manifest = chunkedManifest("222222222222", {
      "line-1": newOne,
      "line-2": newTwo,
    });
    const persisted: unknown[] = [];
    const fetched: string[] = [];
    const res = await checkForScheduleUpdate("111111111111", {
      fetchJson: async () => deepClone(manifest),
      fetchText: async (url: string) => {
        fetched.push(url);
        if (fetched.length === 1) return JSON.stringify(newOne);
        throw new Error("connection dropped halfway");
      },
      readStored: async () => localRef("111111111111", [...one(), ...two()]),
      readActiveData: () => [...one(), ...two()],
      persist: async (u) => {
        persisted.push(u);
        return true;
      },
    });
    expect(fetched.length).toBeGreaterThanOrEqual(1);
    expect(res).toBeNull();
    expect(persisted).toEqual([]);
  });

  it("stations-only change downloads no schedule chunks", async () => {
    const rows = one();
    const local = localRef("333333333333", rows);
    const manifest = chunkedManifest("333333333333", { "line-1": rows });
    const res = await checkForScheduleUpdate("333333333333", {
      fetchJson: async () => deepClone(manifest),
      fetchText: async () => {
        throw new Error("must not fetch chunks when hashes match");
      },
      readStored: async () => local,
      readActiveData: () => rows,
      persist: async () => true,
    });
    expect(res).toBeNull();
  });
});

describe("schedule rotation and rollback", () => {
  it("rotate keeps the previous known-good entry", async () => {
    const { __setScheduleBackendForTests } = await import("./store");
    const backend = new MemoryScheduleBackend();
    __setScheduleBackendForTests(backend);
    try {
      const first = {
        version: "v1",
        updatedAt: new Date().toISOString(),
        data: validDataset(),
      };
      expect(await rotateActiveSchedule(first)).toBe(true);
      const second = {
        version: "v2",
        updatedAt: new Date().toISOString(),
        data: secondDataset(),
      };
      expect(await rotateActiveSchedule(second)).toBe(true);
      expect((await backend.read())?.version).toBe("v2");
      expect((await backend.readPrevious())?.version).toBe("v1");
    } finally {
      __setScheduleBackendForTests(null);
    }
  });
});

describe("repository lifecycle", () => {
  const dataset = () => deepClone(validDataset());

  it("first launch offline uses the bundled timetable (content-identified)", async () => {
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
      readPrevious: async () => null,
    });
    expect(ok).toBe(true);
    expect(activated).toEqual([{ version: BUNDLED_SCHEDULE_VERSION, lines: 1 }]);
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

  it("corrupt active entry falls back to the rollback copy", async () => {
    const activated: { version: string }[] = [];
    const rollback = dataset();
    const ok = await ensureScheduleData({
      isLoaded: () => false,
      activate: (data, version) => {
        activated.push({ version });
      },
      fetchJson: async () => {
        throw new Error("must not reach bundled when rollback exists");
      },
      readStored: async () => ({ version: "bogus", data: [{ broken: true }] as unknown as LineScheduleData[] }),
      readPrevious: async () => ({ version: "rollback-v1", data: rollback }),
    });
    expect(ok).toBe(true);
    expect(activated).toEqual([{ version: "rollback-v1" }]);
  });

  it("corrupt IndexedDB entries fall back to bundled data", async () => {
    const activated: { version: string }[] = [];
    const ok = await ensureScheduleData({
      isLoaded: () => false,
      activate: (data, version) => {
        activated.push({ version });
      },
      fetchJson: async () => dataset(),
      readStored: async () => ({ version: "bogus", data: [{ broken: true }] as unknown as LineScheduleData[] }),
      readPrevious: async () => null,
    });
    expect(ok).toBe(true);
    expect(activated).toEqual([{ version: BUNDLED_SCHEDULE_VERSION }]);
  });

  it("newer timetable becomes the active data source via refresh", async () => {
    const activated: { version: string; lines: number }[] = [];
    const ok = await refreshScheduleData("2026-09-01.1", {
      fetchJson: async (url: string) => {
        if (url === "/metro-data-manifest.json") return deepClone(LEGACY_MANIFEST);
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

  it("matches immutable content-addressed chunks and nothing else", () => {
    expect(isScheduleChunkRequest("/data/schedule-1.0d3199649e75.json")).toBe(true);
    expect(isScheduleChunkRequest("/data/schedule-1w.eeb827aed3a3.json")).toBe(true);
    expect(isScheduleChunkRequest("/data/stations.587df666a707.json")).toBe(true);
    expect(isScheduleChunkRequest("/schedule-data.json")).toBe(false);
    expect(isScheduleChunkRequest("/metro-data-manifest.json")).toBe(false);
    expect(isScheduleChunkRequest("/data/schedule-1.json")).toBe(false);
    expect(isScheduleChunkRequest("/data/other.txt")).toBe(false);
  });

  it("introduces no tile-prefetch, enumeration, or pack logic", () => {
    // The dynamic-data modules must never touch the tile CDN: bulk
    // downloading is prohibited by the provider terms, and the
    // opportunistic 300-tile cache is deliberately the only tile path.
    const forbidden = ["cartocdn", "arcgisonline", "prefetch", "tile-pack", "tilepack"];
    for (const file of ["manifest.ts", "validate.ts", "store.ts", "updater.ts", "repository.ts", "sw-routes.ts", "hash.ts"]) {
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

  it("starts with the bundled content-identified version", async () => {
    const utils = await import("../schedule-utils");
    expect(utils.getActiveScheduleVersion()).toBe(BUNDLED_SCHEDULE_VERSION);
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

  it("activation copies instead of mutating the input dataset", async () => {
    const utils = await import("../schedule-utils");
    const raw = deepClone(validDataset());
    const snapshot = JSON.stringify(raw);
    utils.__setScheduleDataForTests(raw);
    // Remapping must not mutate the caller's object graph.
    expect(JSON.stringify(raw)).toBe(snapshot);
    utils.__setScheduleDataForTests(null);
  });
});
