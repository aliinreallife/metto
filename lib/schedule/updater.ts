// Background timetable refresh (same-origin only, never upstream).
//
// v2 (chunked): fetch `/metro-data-manifest.json` (no-store) → compare the
// content-derived schedule version → download ONLY changed
// content-addressed chunks → SHA-256 + size verify each → assemble with
// locally retained unchanged chunks → validate the assembled dataset →
// rotate IndexedDB active (previous kept for rollback) → activate.
// v1 (legacy monolith): previous behavior, kept during transition.
// Any failure keeps the last-known-good copy. Never throws.
//
// Mirrors lib/holidays/client-update.ts. Fetch + persistence are injectable
// so tests can simulate offline/corruption/quota failures deterministically.
import type { LineScheduleData } from "../schedule-data";
import { BUNDLED_CHUNKS, BUNDLED_SCHEDULE_VERSION } from "./bundled-meta";
import { utf8Size, verifySha256 } from "./hash";
import {
  METRO_DATA_MANIFEST_URL,
  isNewerScheduleVersion,
  parseMetroDataManifest,
  type MetroDataManifest,
} from "./manifest";
import { parseScheduleDataset, validateScheduleDataset } from "./validate";
import {
  readActiveSchedule,
  rotateActiveSchedule,
  type StoredChunkMeta,
} from "./store";

export interface ScheduleUpdate {
  version: string;
  data: LineScheduleData[];
  chunks?: Record<string, StoredChunkMeta>;
}

export interface StoredScheduleRef {
  version: string;
  chunks?: Record<string, StoredChunkMeta>;
  data?: LineScheduleData[] | null;
}

export interface ScheduleUpdaterDeps {
  fetchJson?: (url: string) => Promise<unknown>;
  fetchText?: (url: string) => Promise<string>;
  readStored?: () => Promise<StoredScheduleRef | null>;
  /** In-memory active dataset for reusing unchanged chunks without I/O. */
  readActiveData?: () => LineScheduleData[] | null;
  persist?: (update: ScheduleUpdate) => Promise<boolean>;
  online?: () => boolean;
}

async function defaultFetchJson(url: string): Promise<unknown> {
  // no-store: version discovery must never rely on HTTP-cache luck.
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`http-${res.status}`);
  return res.json();
}

async function defaultFetchText(url: string): Promise<string> {
  // Immutable content-addressed chunks: long-lived HTTP caching applies;
  // the hash in the URL already guarantees freshness.
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) throw new Error(`http-${res.status}`);
  return res.text();
}

/** Group timetable rows by scheduleKey, preserving row order. */
export function groupRowsByKey(data: LineScheduleData[]): Map<string, LineScheduleData[]> {
  const map = new Map<string, LineScheduleData[]>();
  for (const row of data) {
    const key = (row as LineScheduleData)?.scheduleKey;
    if (typeof key !== "string" || key.length === 0) continue;
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  }
  return map;
}

function sameHash(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

async function resolveEffectiveVersion(
  currentVersion: string,
  deps: ScheduleUpdaterDeps,
): Promise<string> {
  if (currentVersion.length > 0) return currentVersion;
  try {
    if (deps.readStored) {
      const stored = await deps.readStored();
      if (stored && stored.version.length > 0) return stored.version;
    } else {
      const stored = await readActiveSchedule();
      if (stored) return stored.version;
    }
  } catch {
    // Storage unreadable — fall through to the bundled baseline.
  }
  // Bundled baseline is content-identified (generated at build time), so a
  // fresh install already knows its version: no blind full download.
  return BUNDLED_SCHEDULE_VERSION;
}

async function persistUpdate(
  update: ScheduleUpdate,
  deps: ScheduleUpdaterDeps,
): Promise<ScheduleUpdate | null> {
  const persist =
    deps.persist ??
    ((u: ScheduleUpdate) =>
      rotateActiveSchedule({
        version: u.version,
        updatedAt: new Date().toISOString(),
        data: u.data,
        ...(u.chunks ? { chunks: u.chunks } : {}),
      }));
  const persisted = await persist(update);
  // Durability is mandatory: an unpersisted update must NOT become active,
  // otherwise a restart would silently roll back to older data.
  if (!persisted) return null;
  return update;
}

async function updateFromLegacyMonolith(
  manifest: MetroDataManifest,
  deps: ScheduleUpdaterDeps,
): Promise<ScheduleUpdate | null> {
  const url = manifest.schedule.url;
  if (!url) return null;
  const fetchJson = deps.fetchJson ?? defaultFetchJson;
  const datasetRaw = await fetchJson(url);
  const data = parseScheduleDataset(datasetRaw);
  if (!data) return null;
  return persistUpdate({ version: manifest.schedule.version, data }, deps);
}

async function updateFromChunks(
  manifest: MetroDataManifest,
  deps: ScheduleUpdaterDeps,
): Promise<ScheduleUpdate | null> {
  const chunks = manifest.schedule.chunks;
  if (!chunks) return null;
  const fetchText = deps.fetchText ?? defaultFetchText;

  // Local chunk hashes: durable entry wins; otherwise the bundled baseline
  // (when the active dataset IS the bundled copy) lets us skip unchanged
  // chunks without any extra I/O.
  let localHashes: Record<string, StoredChunkMeta> = {};
  let localData: LineScheduleData[] | null = deps.readActiveData?.() ?? null;
  try {
    const stored = deps.readStored
      ? await deps.readStored()
      : await readActiveSchedule();
    if (stored?.chunks) localHashes = stored.chunks;
    if (!localData && stored?.data) {
      const parsed = parseScheduleDataset(stored.data);
      if (parsed) localData = parsed;
    }
  } catch {
    // Storage unreadable — download every chunk (still fail-closed below).
  }
  if (Object.keys(localHashes).length === 0 && !localData) {
    localHashes = BUNDLED_CHUNKS;
  }
  const localByKey = localData ? groupRowsByKey(localData) : new Map<string, LineScheduleData[]>();

  const changedKeys = Object.entries(chunks)
    .filter(([key, meta]) => {
      const local = localHashes[key];
      return !local || !sameHash(local.sha256, meta.sha256);
    })
    .map(([key]) => key);
  // Same schedule hashes (e.g. only station metadata changed) → nothing to do.
  if (changedKeys.length === 0) return null;

  const downloaded = new Map<string, LineScheduleData[]>();
  const nextHashes: Record<string, StoredChunkMeta> = { ...localHashes };
  for (const key of changedKeys) {
    const meta = chunks[key];
    let text: string;
    try {
      text = await fetchText(meta.url);
    } catch {
      return null;
    }
    if (utf8Size(text) !== meta.size) return null;
    if (!(await verifySha256(text, meta.sha256))) return null;
    let rows: unknown;
    try {
      rows = JSON.parse(text);
    } catch {
      return null;
    }
    if (!Array.isArray(rows) || rows.length === 0) return null;
    // Fail fast per chunk before paying for full assembly.
    if (validateScheduleDataset(rows).length > 0) return null;
    downloaded.set(key, rows as LineScheduleData[]);
    nextHashes[key] = { sha256: meta.sha256.toLowerCase(), size: meta.size };
  }

  // Assemble in manifest order; unchanged keys reuse local rows. A changed
  // key with no downloadable rows, or an unchanged key with no local rows
  // (e.g. brand-new line), fails closed — never half-old + half-new.
  const assembled: LineScheduleData[] = [];
  for (const key of Object.keys(chunks)) {
    const rows = downloaded.get(key) ?? localByKey.get(key);
    if (!rows || rows.length === 0) return null;
    assembled.push(...rows);
  }
  const data = parseScheduleDataset(assembled);
  if (!data) return null;
  return persistUpdate(
    { version: manifest.schedule.version, data, chunks: nextHashes },
    deps,
  );
}

/**
 * Returns the validated + persisted newer timetable, or null when there is
 * nothing new / anything fails. Never throws. Callers adopt the result via
 * the shared in-memory setter (atomic switch for this session).
 */
export async function checkForScheduleUpdate(
  currentVersion: string,
  deps: ScheduleUpdaterDeps = {},
): Promise<ScheduleUpdate | null> {
  try {
    const isOnline = deps.online
      ? deps.online()
      : typeof navigator === "undefined" || navigator.onLine !== false;
    if (!isOnline) return null;

    const fetchJson = deps.fetchJson ?? defaultFetchJson;
    const manifestRaw = await fetchJson(METRO_DATA_MANIFEST_URL);
    const manifest = parseMetroDataManifest(manifestRaw);
    if (!manifest) return null;

    const effective = await resolveEffectiveVersion(currentVersion, deps);
    if (!isNewerScheduleVersion(manifest.schedule.version, effective)) return null;

    // NOTE: `await` (not bare `return`) so helper rejections land in the
    // catch below — the never-throws guarantee depends on it.
    if (manifest.schedule.chunks) {
      return await updateFromChunks(manifest, deps);
    }
    return await updateFromLegacyMonolith(manifest, deps);
  } catch {
    return null;
  }
}
