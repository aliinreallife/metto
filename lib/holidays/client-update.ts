// Central holiday update coordinator (same-origin only, never upstream).
//
// Update flow: check `/holidays.version.json` (tiny) → only download the full
// `/holidays.json` when the version is genuinely newer → validate → adopt
// centrally (memory + subscriber notify + durable persist) → record success.
// Any failure keeps the last-known-good copy. No exceptions to callers.
//
// Request discipline (Vercel CDN-request quota): every mounted
// `useHolidayData()` hook shares ONE single-flight `ensureHolidayCurrent()`
// operation, and genuinely successful checks are TTL-gated (6h, persisted).
// Components are pure consumers — React lifecycle is never the source of
// truth for whether a check happens.
//
// Success-gated TTL: the successful-check timestamp advances ONLY on genuine
// success — a valid version response with no newer version, or a newer
// dataset that was downloaded, validated AND adopted (memory adopt always;
// persisted timestamp only when durable persistence held). Network failures,
// invalid responses, and failed downloads/validations/adoptions never advance
// it, so the next caller retries instead of going quiet for 6h.
import bundledRaw from "../../public/holidays.json";
import {
  isNewerHolidayVersion,
  parseHolidayDataset,
  type HolidayDataset,
} from "./local-dataset";
import { createLocalIsHolidayDate } from "./local-resolver";
import type { IsHolidayDate } from "./types";

export const HOLIDAY_DATASET_KEY = "metto.holidays.dataset";
export const HOLIDAY_NOTIFIED_KEY = "metto.holidays.notifiedVersion";

/** Persisted successful-check record (timestamp + covered dataset version). */
const HOLIDAY_LAST_CHECK_KEY = "metto.holidays.lastCheck";

/** Minimum interval between genuinely successful update checks. */
export const HOLIDAY_CHECK_TTL_MS = 6 * 60 * 60 * 1000;

/** Minimal storage surface (localStorage-compatible, injectable for tests). */
export interface HolidayCheckStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): HolidayCheckStorage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

function readStoredDatasetFrom(
  storage: HolidayCheckStorage | null,
): HolidayDataset | null {
  try {
    if (!storage) return null;
    const raw = storage.getItem(HOLIDAY_DATASET_KEY);
    if (!raw) return null;
    return parseHolidayDataset(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Persists the dataset. Returns false when storage is unavailable/fails. */
function writeDatasetTo(
  storage: HolidayCheckStorage | null,
  dataset: HolidayDataset,
): boolean {
  try {
    if (!storage) return false;
    storage.setItem(HOLIDAY_DATASET_KEY, JSON.stringify(dataset));
    return true;
  } catch {
    return false;
  }
}

function readNotifiedFrom(
  storage: HolidayCheckStorage | null,
): string | null {
  try {
    return storage?.getItem(HOLIDAY_NOTIFIED_KEY) ?? null;
  } catch {
    return null;
  }
}

function writeNotifiedTo(
  storage: HolidayCheckStorage | null,
  version: string,
): void {
  try {
    storage?.setItem(HOLIDAY_NOTIFIED_KEY, version);
  } catch {
    // Non-fatal.
  }
}

// Legacy single-purpose helpers (default storage). Kept for compatibility;
// the coordinator below routes through the seam-aware internals.
export function readStoredDataset(): HolidayDataset | null {
  return readStoredDatasetFrom(defaultStorage());
}

export function storeDataset(dataset: HolidayDataset): void {
  writeDatasetTo(defaultStorage(), dataset);
}

export function readNotifiedVersion(): string | null {
  return readNotifiedFrom(defaultStorage());
}

export function markVersionNotified(version: string): void {
  writeNotifiedTo(defaultStorage(), version);
}

interface HolidayCheckRecord {
  at: number;
  version: string;
}

function readCheckRecord(
  storage: HolidayCheckStorage | null,
): HolidayCheckRecord | null {
  try {
    if (!storage) return null;
    const raw = storage.getItem(HOLIDAY_LAST_CHECK_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { at, version } = parsed as { at?: unknown; version?: unknown };
    if (
      typeof at !== "number" ||
      !Number.isFinite(at) ||
      at < 0 ||
      typeof version !== "string"
    ) {
      return null;
    }
    return { at, version };
  } catch {
    return null;
  }
}

function writeCheckRecord(
  storage: HolidayCheckStorage | null,
  record: HolidayCheckRecord,
): void {
  try {
    storage?.setItem(HOLIDAY_LAST_CHECK_KEY, JSON.stringify(record));
  } catch {
    // Persistence failure must not break the session: the in-memory
    // timestamp still dedupes this page lifetime (fail open for freshness
    // on the next launch, quiet within this session).
  }
}

function bundledDataset(): HolidayDataset | null {
  return parseHolidayDataset(bundledRaw);
}

export interface HolidaySnapshot {
  dataset: HolidayDataset | null;
}

// Deterministic initial state (bundled baseline). The server snapshot is a
// stable const; the client snapshot starts as the SAME reference so
// hydration compares equal until real store state changes.
const bundledInitial = bundledDataset();
const serverSnapshot: HolidaySnapshot = { dataset: bundledInitial };
let snapshot: HolidaySnapshot = serverSnapshot;

// Module-level memory cache so every hook instance (and sync non-React
// callers) shares one validated dataset without re-parsing per component.
let memoryDataset: HolidayDataset | null = bundledInitial;
let memoryReady = false;

// Successful-check record for this page lifetime. Set ONLY on genuine
// success (valid no-update response, or validated + adopted update).
let lastCheckMem: HolidayCheckRecord | null = null;

let inFlight: Promise<HolidayDataset | null> | null = null;
const holidayListeners = new Set<() => void>();

function ensureMemoryFromStorage(
  storage: HolidayCheckStorage | null,
): void {
  if (memoryReady) return;
  memoryReady = true;
  const stored = readStoredDatasetFrom(storage);
  if (stored) {
    // Stored copy wins over the bundle only when it validates (parse
    // already guarantees shape).
    memoryDataset = stored;
    snapshot = { dataset: stored };
  }
  // First-run silence: the bundled baseline is not an "update".
  try {
    if (readNotifiedFrom(storage) === null && memoryDataset) {
      writeNotifiedTo(storage, memoryDataset.version);
    }
  } catch {
    // Non-fatal.
  }
}

/** Sync stored/baseline upgrade entry for the hook render path. */
export function ensureHolidayMemory(): void {
  ensureMemoryFromStorage(defaultStorage());
}

/** Sync read for non-React callers (routing). Never does I/O. */
export function getLocalHolidayDataset(): HolidayDataset | null {
  ensureMemoryFromStorage(defaultStorage());
  return memoryDataset;
}

export function getLocalIsHolidayDate(): IsHolidayDate {
  return createLocalIsHolidayDate(getLocalHolidayDataset());
}

function notifyHolidayListeners(): void {
  // Isolated per listener: one broken subscriber must not prevent central
  // adoption progress or corrupt TTL state.
  for (const listener of Array.from(holidayListeners)) {
    try {
      listener();
    } catch {
      // A broken listener must not break the others.
    }
  }
}

/** Subscribe to central holiday-store changes (for useSyncExternalStore). */
export function subscribeHoliday(listener: () => void): () => void {
  holidayListeners.add(listener);
  return () => {
    holidayListeners.delete(listener);
  };
}

/** Current central snapshot. Identity changes ONLY on store changes. */
export function getHolidaySnapshot(): HolidaySnapshot {
  return snapshot;
}

/**
 * Deterministic server snapshot for SSR/hydration: the bundled baseline with
 * stable identity forever (the server never adopts). The client starts from
 * the same reference, so hydration compares equal until real state changes.
 */
export function getHolidayServerSnapshot(): HolidaySnapshot {
  return serverSnapshot;
}

/**
 * Central commit phase. Order is contractual:
 *  1. adopt into central memory,
 *  2. swap the snapshot + notify subscribers (per-listener isolated),
 *  3. attempt durable dataset persistence.
 * Returns true iff durable persistence succeeded. Never throws: persistence
 * failure keeps the adopted memory dataset (this session is fresh) while the
 * caller withholds the persisted success timestamp (next launch re-checks).
 */
function commitHolidayDataset(
  dataset: HolidayDataset,
  storage: HolidayCheckStorage | null,
): boolean {
  memoryDataset = dataset;
  snapshot = { dataset };
  notifyHolidayListeners();
  return writeDatasetTo(storage, dataset);
}

function recordSuccessfulCheck(
  now: number,
  version: string,
  storage: HolidayCheckStorage | null,
  persisted: boolean,
): void {
  // In-memory timestamp always advances on genuine success: the session now
  // holds validated current data, so further checks this page lifetime are
  // useless. The persisted timestamp advances only when durability held, so a
  // failed persist re-checks on the next launch (fail open for freshness).
  lastCheckMem = { at: now, version };
  if (persisted) writeCheckRecord(storage, { at: now, version });
}

function isRecordFresh(
  record: HolidayCheckRecord | null,
  currentVersion: string,
  now: number,
): boolean {
  if (!record || record.version !== currentVersion) return false;
  // Clock-skew guard: future timestamps never suppress checks.
  if (!(record.at <= now)) return false;
  return now - record.at < HOLIDAY_CHECK_TTL_MS;
}

export interface EnsureHolidayOptions {
  /** Override for "now" (tests). Defaults to Date.now(). */
  nowMs?: number;
  /**
   * Storage seam. Defaults to guarded localStorage. Pass `null` to simulate
   * unavailable storage; tests pass an in-memory stub.
   */
  storage?: HolidayCheckStorage | null;
}

/**
 * Central "ensure current" operation: the ONLY holiday update check entry
 * point for UI code. Single-flight across all mounted hook instances plus a
 * success-gated 6h TTL (memory + persisted, version-paired). The coordinator
 * reads the authoritative current version from its own store — callers pass
 * no version, so no stale caller snapshot can suppress an update. Returns the
 * adopted newer dataset, or null when there is nothing new / anything fails /
 * a fresh successful check already covers the current version. Never throws.
 */
export function ensureHolidayCurrent(
  options: EnsureHolidayOptions = {},
): Promise<HolidayDataset | null> {
  const now = options.nowMs ?? Date.now();
  const storage =
    options.storage !== undefined ? options.storage : defaultStorage();
  ensureMemoryFromStorage(storage);
  const current = memoryDataset?.version ?? "";
  if (current.length > 0) {
    const fresh =
      isRecordFresh(lastCheckMem, current, now) ||
      isRecordFresh(readCheckRecord(storage), current, now);
    if (fresh) return Promise.resolve(null);
  }
  // No current dataset at all (bundled parse failed): fail open and check.
  if (inFlight) return inFlight;
  // Non-async body: every joiner receives the SAME promise object.
  inFlight = runHolidayCheck(current, now, storage).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runHolidayCheck(
  current: string,
  now: number,
  storage: HolidayCheckStorage | null,
): Promise<HolidayDataset | null> {
  try {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return null;
    }
    const versionRaw = await fetchJson("/holidays.version.json");
    const remoteVersion =
      typeof versionRaw === "object" && versionRaw !== null
        ? (versionRaw as { version?: unknown }).version
        : undefined;
    if (typeof remoteVersion !== "string" || remoteVersion.length === 0) {
      return null; // Invalid version response: TTL must NOT advance.
    }
    if (current.length > 0 && !isNewerHolidayVersion(remoteVersion, current)) {
      // Valid response, nothing newer: genuine success, TTL advances.
      recordSuccessfulCheck(now, current, storage, true);
      return null;
    }
    // Version-pinned query bypasses the precached `/holidays.json` key so a
    // genuinely newer dataset is downloaded instead of the frozen copy.
    // (The SW maps this exact rule to NetworkOnly; offline it just fails
    // and the caller keeps last-known-good.)
    const datasetRaw = await fetchJson(
      `/holidays.json?v=${encodeURIComponent(remoteVersion)}`,
    );
    const dataset = parseHolidayDataset(datasetRaw);
    if (!dataset || dataset.version !== remoteVersion) {
      return null; // Download/validation failure: TTL must NOT advance.
    }
    const persisted = commitHolidayDataset(dataset, storage);
    recordSuccessfulCheck(now, dataset.version, storage, persisted);
    return dataset;
  } catch {
    return null;
  }
}

async function fetchJson(path: string): Promise<unknown> {
  // no-store: version discovery must never rely on HTTP-cache luck.
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`http-${res.status}`);
  return res.json();
}

/**
 * Raw single update check (no TTL, no single-flight): returns a validated
 * newer dataset, or null when there is nothing new / anything fails. Never
 * throws. Callers adopt the result + persist it. UI code should prefer
 * `ensureHolidayCurrent`; this stays as the testable primitive.
 */
export async function checkForHolidayUpdate(
  currentVersion: string,
): Promise<HolidayDataset | null> {
  try {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return null;
    }
    const versionRaw = await fetchJson("/holidays.version.json");
    const remoteVersion =
      typeof versionRaw === "object" && versionRaw !== null
        ? (versionRaw as { version?: unknown }).version
        : undefined;
    if (typeof remoteVersion !== "string" || remoteVersion.length === 0) {
      return null;
    }
    if (!isNewerHolidayVersion(remoteVersion, currentVersion)) return null;
    // Version-pinned query bypasses the precached `/holidays.json` key so a
    // genuinely newer dataset is downloaded instead of the frozen copy.
    // (The SW maps this exact rule to NetworkOnly; offline it just fails
    // and the caller keeps last-known-good.)
    const datasetRaw = await fetchJson(
      `/holidays.json?v=${encodeURIComponent(remoteVersion)}`,
    );
    const dataset = parseHolidayDataset(datasetRaw);
    if (!dataset || dataset.version !== remoteVersion) return null;
    return dataset;
  } catch {
    return null;
  }
}

/**
 * Test-only: reset coordinator module state so tests are order-independent.
 * Does NOT touch caller storage (tests inject their own seam storage).
 */
export function __resetHolidayCoordinatorForTests(): void {
  inFlight = null;
  lastCheckMem = null;
  holidayListeners.clear();
  memoryReady = false;
  memoryDataset = bundledDataset();
  snapshot = serverSnapshot;
}
