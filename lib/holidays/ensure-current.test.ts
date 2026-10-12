import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetHolidayCoordinatorForTests,
  ensureHolidayCurrent,
  getHolidaySnapshot,
  getHolidayServerSnapshot,
  getLocalHolidayDataset,
  HOLIDAY_CHECK_TTL_MS,
  subscribeHoliday,
  type HolidayCheckStorage,
} from "./client-update";
import type { HolidayDataset } from "./local-dataset";

const LAST_CHECK_KEY = "metto.holidays.lastCheck";
const DATASET_KEY = "metto.holidays.dataset";

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
    },
  };
}

function newerDataset(): HolidayDataset {
  const ds = makeDataset();
  ds.version = "1405.1.1";
  return ds;
}

function memStorage(): HolidayCheckStorage & { dump(): Record<string, string> } {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      m.set(k, v);
    },
    dump: () => Object.fromEntries(m),
  };
}

function versionFetches(fetchMock: ReturnType<typeof vi.fn>): number {
  return fetchMock.mock.calls.filter(
    ([url]) => url === "/holidays.version.json",
  ).length;
}

/** Fetch stub serving a fixed remote version (+ optional dataset payload). */
function stubRemote(
  fetchMock: ReturnType<typeof vi.fn>,
  remoteVersion: unknown,
  dataset: unknown,
): void {
  fetchMock.mockImplementation(async (url: string) => {
    if (url === "/holidays.version.json") {
      return { ok: true, json: async () => ({ version: remoteVersion }) };
    }
    return { ok: true, json: async () => dataset };
  });
}

beforeEach(() => {
  __resetHolidayCoordinatorForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ensureHolidayCurrent — single-flight", () => {
  it("150 simultaneous callers share exactly 1 version fetch", async () => {
    const storage = memStorage();
    const fetchMock = vi.fn();
    stubRemote(fetchMock, "1405.1.1", newerDataset());
    vi.stubGlobal("fetch", fetchMock);
    const results = await Promise.all(
      Array.from({ length: 150 }, () =>
        ensureHolidayCurrent({ nowMs: 1_700_000_000_000, storage }),
      ),
    );
    expect(versionFetches(fetchMock)).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2); // version + pinned dataset
    for (const r of results) expect(r?.version).toBe("1405.1.1");
    expect(getLocalHolidayDataset()?.version).toBe("1405.1.1");
  });

  it("joiners receive the identical shared promise object", async () => {
    const storage = memStorage();
    const fetchMock = vi.fn();
    stubRemote(fetchMock, "1405.1.1", newerDataset());
    vi.stubGlobal("fetch", fetchMock);
    const p1 = ensureHolidayCurrent({ nowMs: 1_700_000_000_000, storage });
    const p2 = ensureHolidayCurrent({ nowMs: 1_700_000_000_000, storage });
    expect(p2).toBe(p1);
    await p1;
    expect(versionFetches(fetchMock)).toBe(1);
  });
});

describe("ensureHolidayCurrent — TTL", () => {
  it("mounts inside 6h cause 0 additional fetches; expiry re-checks", async () => {
    const storage = memStorage();
    const current = getLocalHolidayDataset()?.version ?? "";
    expect(current.length).toBeGreaterThan(0);
    const fetchMock = vi.fn();
    stubRemote(fetchMock, current, makeDataset());
    vi.stubGlobal("fetch", fetchMock);
    const t0 = 1_700_000_000_000;
    expect(
      await ensureHolidayCurrent({ nowMs: t0, storage }),
    ).toBeNull();
    expect(versionFetches(fetchMock)).toBe(1);
    // Repeat mounts within the window are free.
    for (let i = 0; i < 10; i++) {
      expect(
        await ensureHolidayCurrent({ nowMs: t0 + i * 1000, storage }),
      ).toBeNull();
    }
    expect(versionFetches(fetchMock)).toBe(1);
    // Just before expiry still quiet; at expiry it re-checks.
    expect(
      await ensureHolidayCurrent({
        nowMs: t0 + HOLIDAY_CHECK_TTL_MS - 1,
        storage,
      }),
    ).toBeNull();
    expect(versionFetches(fetchMock)).toBe(1);
    expect(
      await ensureHolidayCurrent({
        nowMs: t0 + HOLIDAY_CHECK_TTL_MS,
        storage,
      }),
    ).toBeNull();
    expect(versionFetches(fetchMock)).toBe(2);
  });

  it("persisted TTL dedupes a new session; absent state re-checks", async () => {
    const storage = memStorage();
    const current = getLocalHolidayDataset()?.version ?? "";
    const fetchMock = vi.fn();
    stubRemote(fetchMock, current, makeDataset());
    vi.stubGlobal("fetch", fetchMock);
    const t0 = 1_700_000_000_000;
    await ensureHolidayCurrent({ nowMs: t0, storage });
    expect(versionFetches(fetchMock)).toBe(1);
    // New process: module state cleared, persisted record survives.
    __resetHolidayCoordinatorForTests();
    await ensureHolidayCurrent({ nowMs: t0 + 1000, storage });
    expect(versionFetches(fetchMock)).toBe(1);
    // Fresh profile without persisted state checks.
    __resetHolidayCoordinatorForTests();
    await ensureHolidayCurrent({ nowMs: t0 + 1000, storage: memStorage() });
    expect(versionFetches(fetchMock)).toBe(2);
  });

  it("storage unavailable: session still dedupes via memory", async () => {
    const current = getLocalHolidayDataset()?.version ?? "";
    const fetchMock = vi.fn();
    stubRemote(fetchMock, current, makeDataset());
    vi.stubGlobal("fetch", fetchMock);
    const t0 = 1_700_000_000_000;
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        ensureHolidayCurrent({ nowMs: t0, storage: null }),
      ),
    );
    expect(versionFetches(fetchMock)).toBe(1);
    for (const r of results) expect(r).toBeNull();
    for (let i = 0; i < 5; i++) {
      await ensureHolidayCurrent({ nowMs: t0 + 60_000 * (i + 1), storage: null });
    }
    expect(versionFetches(fetchMock)).toBe(1);
  });

  it("fresh future-skewed record never suppresses checks", async () => {
    const storage = memStorage();
    storage.setItem(
      LAST_CHECK_KEY,
      JSON.stringify({ at: 9_999_999_999_999, version: "1405.1.0" }),
    );
    const fetchMock = vi.fn();
    stubRemote(fetchMock, "1405.1.0", makeDataset());
    vi.stubGlobal("fetch", fetchMock);
    await ensureHolidayCurrent({ nowMs: 1_700_000_000_000, storage });
    expect(versionFetches(fetchMock)).toBe(1);
  });

  it("fresh record for a different version does not suppress a needed check", async () => {
    const storage = memStorage();
    // A check recorded for a version the store does not hold (e.g. adopted
    // data was lost) must not silence the recovery check.
    storage.setItem(
      LAST_CHECK_KEY,
      JSON.stringify({ at: 1_700_000_000_000, version: "1405.9.9" }),
    );
    const fetchMock = vi.fn();
    stubRemote(fetchMock, "1405.1.1", newerDataset());
    vi.stubGlobal("fetch", fetchMock);
    const got = await ensureHolidayCurrent({
      nowMs: 1_700_000_001_000,
      storage,
    });
    expect(versionFetches(fetchMock)).toBe(1);
    expect(got?.version).toBe("1405.1.1");
  });
});

describe("ensureHolidayCurrent — failure semantics", () => {
  it("network failure advances neither TTL and the next attempt retries", async () => {
    const storage = memStorage();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    const t0 = 1_700_000_000_000;
    expect(await ensureHolidayCurrent({ nowMs: t0, storage })).toBeNull();
    expect(LAST_CHECK_KEY in storage.dump()).toBe(false);
    expect(
      await ensureHolidayCurrent({ nowMs: t0 + 1000, storage }),
    ).toBeNull();
    // Retry happened (flight was cleared, not poisoned).
    const fetchMock = vi.fn(async () => {
      throw new Error("offline");
    });
    vi.stubGlobal("fetch", fetchMock);
    await ensureHolidayCurrent({ nowMs: t0 + 2000, storage });
    expect(fetchMock).toHaveBeenCalled();
  });

  it("failed flight clears: a later attempt can succeed", async () => {
    const storage = memStorage();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    const t0 = 1_700_000_000_000;
    expect(await ensureHolidayCurrent({ nowMs: t0, storage })).toBeNull();
    const fetchMock = vi.fn();
    stubRemote(fetchMock, "1405.1.1", newerDataset());
    vi.stubGlobal("fetch", fetchMock);
    const got = await ensureHolidayCurrent({ nowMs: t0 + 1000, storage });
    expect(got?.version).toBe("1405.1.1");
    expect(versionFetches(fetchMock)).toBe(1);
  });

  it("invalid version response advances neither TTL", async () => {
    const storage = memStorage();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ nope: true }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const t0 = 1_700_000_000_000;
    expect(await ensureHolidayCurrent({ nowMs: t0, storage })).toBeNull();
    expect(LAST_CHECK_KEY in storage.dump()).toBe(false);
    await ensureHolidayCurrent({ nowMs: t0 + 1000, storage });
    expect(versionFetches(fetchMock)).toBe(2);
  });

  it("dataset download/parse/version mismatch advances neither TTL", async () => {
    const storage = memStorage();
    const t0 = 1_700_000_000_000;
    // Malformed payload.
    let fetchMock = vi.fn(async (url: string) => {
      if (url === "/holidays.version.json") {
        return { ok: true, json: async () => ({ version: "1405.1.1" }) };
      }
      return { ok: true, json: async () => ({ nope: true }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await ensureHolidayCurrent({ nowMs: t0, storage })).toBeNull();
    expect(LAST_CHECK_KEY in storage.dump()).toBe(false);
    // Version mismatch between pointer and payload.
    const mismatched = newerDataset();
    mismatched.version = "1405.1.2";
    fetchMock = vi.fn(async (url: string) => {
      if (url === "/holidays.version.json") {
        return { ok: true, json: async () => ({ version: "1405.1.1" }) };
      }
      return { ok: true, json: async () => mismatched };
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await ensureHolidayCurrent({ nowMs: t0 + 1000, storage })).toBeNull();
    expect(LAST_CHECK_KEY in storage.dump()).toBe(false);
    expect(getLocalHolidayDataset()?.version).toBe("1405.1.0");
  });
});

describe("ensureHolidayCurrent — commit semantics", () => {
  it("initiator may drop the promise; central adoption still completes", async () => {
    const storage = memStorage();
    let resolveDataset!: (value: unknown) => void;
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/holidays.version.json") {
        return { ok: true, json: async () => ({ version: "1405.1.1" }) };
      }
      return { ok: true, json: () => new Promise((res) => {
        resolveDataset = res;
      }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const t0 = 1_700_000_000_000;
    const p1 = ensureHolidayCurrent({ nowMs: t0, storage });
    const p2 = ensureHolidayCurrent({ nowMs: t0, storage });
    // Initiating component unmounts: result ignored.
    void p1.then(
      () => undefined,
      () => undefined,
    );
    await vi.waitFor(() => {
      if (typeof resolveDataset !== "function") throw new Error("pending");
    });
    resolveDataset(newerDataset());
    const got = await p2;
    expect(got?.version).toBe("1405.1.1");
    expect(getLocalHolidayDataset()?.version).toBe("1405.1.1");
    // TTL advanced centrally: further mounts are quiet.
    await ensureHolidayCurrent({ nowMs: t0 + 1000, storage });
    expect(versionFetches(fetchMock)).toBe(1);
  });

  it("persistence failure keeps memory fresh, withholds persisted TTL", async () => {
    const mem = new Map<string, string>();
    const storage: HolidayCheckStorage = {
      getItem: (k: string) => (mem.has(k) ? (mem.get(k) as string) : null),
      setItem: (k: string, v: string) => {
        if (k === DATASET_KEY) throw new Error("quota exceeded");
        mem.set(k, v);
      },
    };
    const fetchMock = vi.fn();
    stubRemote(fetchMock, "1405.1.1", newerDataset());
    vi.stubGlobal("fetch", fetchMock);
    const t0 = 1_700_000_000_000;
    const got = await ensureHolidayCurrent({ nowMs: t0, storage });
    // Session is fresh despite the persistence failure.
    expect(got?.version).toBe("1405.1.1");
    expect(getLocalHolidayDataset()?.version).toBe("1405.1.1");
    expect(LAST_CHECK_KEY in Object.fromEntries(mem)).toBe(false);
    // Same session stays quiet via the in-memory record.
    await ensureHolidayCurrent({ nowMs: t0 + 1000, storage });
    expect(versionFetches(fetchMock)).toBe(1);
    // New launch (memory cleared, no persisted record) re-checks: fail open.
    __resetHolidayCoordinatorForTests();
    await ensureHolidayCurrent({ nowMs: t0 + 2000, storage });
    expect(versionFetches(fetchMock)).toBe(2);
  });

  it("listener errors are isolated from adoption and TTL", async () => {
    const storage = memStorage();
    const fetchMock = vi.fn();
    stubRemote(fetchMock, "1405.1.1", newerDataset());
    vi.stubGlobal("fetch", fetchMock);
    const calls: string[] = [];
    const bad = subscribeHoliday(() => {
      throw new Error("broken subscriber");
    });
    const release = subscribeHoliday(() => {
      calls.push("good");
    });
    const t0 = 1_700_000_000_000;
    const got = await ensureHolidayCurrent({ nowMs: t0, storage });
    expect(got?.version).toBe("1405.1.1");
    expect(calls).toEqual(["good"]);
    expect(getLocalHolidayDataset()?.version).toBe("1405.1.1");
    bad();
    release();
  });

  it("no-update success advances both TTL records", async () => {
    const storage = memStorage();
    const current = getLocalHolidayDataset()?.version ?? "";
    const fetchMock = vi.fn();
    stubRemote(fetchMock, current, makeDataset());
    vi.stubGlobal("fetch", fetchMock);
    const t0 = 1_700_000_000_000;
    expect(await ensureHolidayCurrent({ nowMs: t0, storage })).toBeNull();
    const record = JSON.parse(storage.dump()[LAST_CHECK_KEY] as string) as {
      at: number;
      version: string;
    };
    expect(record).toEqual({ at: t0, version: current });
    await ensureHolidayCurrent({ nowMs: t0 + 1000, storage });
    expect(versionFetches(fetchMock)).toBe(1);
  });

  it("update + adoption + persistence advances both records", async () => {
    const storage = memStorage();
    const fetchMock = vi.fn();
    stubRemote(fetchMock, "1405.1.1", newerDataset());
    vi.stubGlobal("fetch", fetchMock);
    const t0 = 1_700_000_000_000;
    const got = await ensureHolidayCurrent({ nowMs: t0, storage });
    expect(got?.version).toBe("1405.1.1");
    const record = JSON.parse(storage.dump()[LAST_CHECK_KEY] as string) as {
      at: number;
      version: string;
    };
    expect(record).toEqual({ at: t0, version: "1405.1.1" });
    expect(
      JSON.parse(storage.dump()[DATASET_KEY] as string).version,
    ).toBe("1405.1.1");
    await ensureHolidayCurrent({ nowMs: t0 + 1000, storage });
    expect(versionFetches(fetchMock)).toBe(1);
  });
});

describe("holiday snapshot identities", () => {
  it("snapshot identity is stable until the store changes", async () => {
    const storage = memStorage();
    const current = getLocalHolidayDataset()?.version ?? "";
    const fetchMock = vi.fn();
    stubRemote(fetchMock, current, makeDataset());
    vi.stubGlobal("fetch", fetchMock);
    const before = getHolidaySnapshot();
    expect(getHolidaySnapshot()).toBe(before);
    expect(getHolidayServerSnapshot()).toBe(getHolidayServerSnapshot());
    // A no-update check does not swap the snapshot.
    const t0 = 1_700_000_000_000;
    await ensureHolidayCurrent({ nowMs: t0, storage });
    expect(getHolidaySnapshot()).toBe(before);
    // Past the TTL, an adoption swaps it exactly once.
    stubRemote(fetchMock, "1405.1.1", newerDataset());
    await ensureHolidayCurrent({ nowMs: t0 + HOLIDAY_CHECK_TTL_MS + 1, storage });
    const after = getHolidaySnapshot();
    expect(after).not.toBe(before);
    expect(after.dataset?.version).toBe("1405.1.1");
    expect(getHolidaySnapshot()).toBe(after);
  });
});
