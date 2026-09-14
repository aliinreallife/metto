// Timetable lifecycle: last-known-good first, bundled fallback, silent
// background refresh. Single orchestration point so components never scatter
// IndexedDB/fetch logic.
//
// Startup order (all steps fail-soft to the next):
//  1. memory already active → done (fast in-session revisit);
//  2. IndexedDB `active` entry (last valid dynamic timetable) → activate;
//  3. IndexedDB `previous` entry (rollback after a bad rotation) → activate;
//  4. bundled precached `/schedule-data.json` (offline bootstrap, content-
//     identified via generated bundled-meta — NOT unknown vintage) → activate;
//  5. background (when online): manifest → changed chunks only → verify →
//     persist → atomically activate for this session.
//
// Activation itself is always delegated to the caller's `activate`
// callback (production: the shared in-memory setter in schedule-utils, so
// every consumer reads the dynamically selected timetable). This module
// never touches component state and never throws.
import type { LineScheduleData } from "../schedule-data";
import { BUNDLED_SCHEDULE_VERSION } from "./bundled-meta";
import { parseScheduleDataset } from "./validate";
import { readActiveSchedule, readPreviousSchedule } from "./store";
import { checkForScheduleUpdate, type ScheduleUpdaterDeps } from "./updater";

export const BUNDLED_SCHEDULE_URL = "/schedule-data.json";

export interface RepositoryDeps {
  isLoaded: () => boolean;
  activate: (data: LineScheduleData[], version: string) => void;
  fetchJson?: (url: string) => Promise<unknown>;
  readStored?: () => Promise<{ version: string; data: LineScheduleData[] } | null>;
  readPrevious?: () => Promise<{ version: string; data: LineScheduleData[] } | null>;
}

async function defaultFetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`http-${res.status}`);
  return res.json();
}

/**
 * Blocking startup load. Resolves true when any timetable is active
 * (dynamic → rollback → bundled), false when nothing could be loaded
 * (caller falls back to geometric estimates). Never throws.
 */
export async function ensureScheduleData(deps: RepositoryDeps): Promise<boolean> {
  try {
    if (deps.isLoaded()) return true;

    // 1. Last valid dynamic timetable (survives offline restarts).
    try {
      const readStored = deps.readStored ?? readActiveSchedule;
      const stored = await readStored();
      if (stored) {
        const data = parseScheduleDataset(stored.data);
        if (data) {
          deps.activate(data, stored.version);
          return true;
        }
        // Corrupt durable entry: fall through to rollback, then bundled.
      }
    } catch {
      // Storage unreadable — fall through.
    }

    // 2. Rollback entry (previous known-good, kept across one rotation).
    try {
      const readPrevious = deps.readPrevious ?? readPreviousSchedule;
      const previous = await readPrevious();
      if (previous) {
        const data = parseScheduleDataset(previous.data);
        if (data) {
          deps.activate(data, previous.version);
          return true;
        }
      }
    } catch {
      // Storage unreadable — fall through to bundled.
    }

    // 3. Bundled/precache offline bootstrap. Content-identified at build
    // time, so the first online refresh compares versions instead of
    // blindly redownloading the ~5MB monolith.
    const fetchJson = deps.fetchJson ?? defaultFetchJson;
    const bundledRaw = await fetchJson(BUNDLED_SCHEDULE_URL);
    const bundled = parseScheduleDataset(bundledRaw);
    if (!bundled) return false;
    deps.activate(bundled, BUNDLED_SCHEDULE_VERSION);
    return true;
  } catch {
    return false;
  }
}

export interface RefreshDeps extends ScheduleUpdaterDeps {
  activate: (data: LineScheduleData[], version: string) => void;
}

/**
 * Non-blocking background refresh. Resolves true only when a newer
 * validated + persisted timetable became active. Never throws; any failure
 * leaves the previous timetable untouched.
 */
export async function refreshScheduleData(
  currentVersion: string,
  deps: RefreshDeps,
): Promise<boolean> {
  try {
    const { activate, ...updaterDeps } = deps;
    const update = await checkForScheduleUpdate(currentVersion, updaterDeps);
    if (!update) return false;
    activate(update.data, update.version);
    return true;
  } catch {
    return false;
  }
}
