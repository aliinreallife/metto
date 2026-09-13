// Background timetable refresh (same-origin only, never upstream).
// Flow: fetch `/metro-data-manifest.json` (no-store) → compare versions →
// only download the full version-pinned `/schedule-data.json?v=…` when the
// version is genuinely newer → validate → persist to IndexedDB.
// Any failure keeps the last-known-good copy. Never throws.
//
// Mirrors lib/holidays/client-update.ts. Fetch + persistence are injectable
// so tests can simulate offline/corruption/quota failures deterministically.
import type { LineScheduleData } from "../schedule-data";
import {
  METRO_DATA_MANIFEST_URL,
  isNewerScheduleVersion,
  parseMetroDataManifest,
} from "./manifest";
import { parseScheduleDataset } from "./validate";
import { readActiveSchedule, writeActiveSchedule } from "./store";

export interface ScheduleUpdate {
  version: string;
  data: LineScheduleData[];
}

export interface ScheduleUpdaterDeps {
  fetchJson?: (url: string) => Promise<unknown>;
  readStored?: () => Promise<{ version: string } | null>;
  persist?: (update: ScheduleUpdate) => Promise<boolean>;
  online?: () => boolean;
}

async function defaultFetchJson(url: string): Promise<unknown> {
  // no-store: version discovery must never rely on HTTP-cache luck.
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`http-${res.status}`);
  return res.json();
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

    // Resolve the effective current version: explicit arg wins, otherwise
    // fall back to whatever is durably stored (covers fresh sessions where
    // the caller has only the bundled copy with unknown version).
    let effective = currentVersion;
    if (effective.length === 0 && deps.readStored === undefined) {
      const stored = await readActiveSchedule();
      if (stored) effective = stored.version;
    } else if (effective.length === 0 && deps.readStored) {
      const stored = await deps.readStored();
      if (stored) effective = stored.version;
    }

    if (!isNewerScheduleVersion(manifest.schedule.version, effective)) return null;

    // Version-pinned query bypasses the precached bare `/schedule-data.json`
    // key so a genuinely newer dataset is downloaded instead of the frozen
    // copy. (The SW maps this exact rule to NetworkOnly; offline it just
    // fails and the caller keeps last-known-good.)
    const datasetRaw = await fetchJson(manifest.schedule.url);
    const data = parseScheduleDataset(datasetRaw);
    if (!data) return null;

    const update: ScheduleUpdate = { version: manifest.schedule.version, data };
    const persist =
      deps.persist ??
      ((u: ScheduleUpdate) =>
        writeActiveSchedule({
          version: u.version,
          updatedAt: new Date().toISOString(),
          data: u.data,
        }));
    const persisted = await persist(update);
    // Durability is mandatory: an unpersisted update must NOT become active,
    // otherwise a restart would silently roll back to older data.
    if (!persisted) return null;
    return update;
  } catch {
    return null;
  }
}
