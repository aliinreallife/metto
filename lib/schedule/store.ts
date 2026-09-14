// Durable storage for the hot-updated timetable (IndexedDB, never
// localStorage — the dataset is ~5MB, far beyond the localStorage comfort
// zone and its synchronous API would jank startup).
//
// Design:
// - DB `metto-schedule`, store `timetable`, key `active` holds
//   { version, updatedAt, data, chunks? }. Single-key atomic put = atomic
//   switch: the new version becomes active only after every chunk verified.
// - Key `previous` keeps the last replaced known-good entry for rollback /
//   recovery (one version only; cleaned by overwrite, never grown).
// - All functions are SSR-safe (no top-level indexedDB access) and never
//   throw: every failure resolves to null/false and callers keep the
//   previous timetable.
// - The backend is injectable so unit tests (node env, no IndexedDB) and
//   any future migration can substitute storage without touching callers.

import type { LineScheduleData } from "../schedule-data";

export const SCHEDULE_DB_NAME = "metto-schedule";
export const SCHEDULE_STORE_NAME = "timetable";
export const SCHEDULE_ACTIVE_KEY = "active";
export const SCHEDULE_PREVIOUS_KEY = "previous";

export interface StoredChunkMeta {
  sha256: string;
  size: number;
}

export interface StoredSchedule {
  version: string;
  updatedAt: string;
  data: LineScheduleData[];
  /** Per-chunk hashes of the active dataset (absent for legacy entries). */
  chunks?: Record<string, StoredChunkMeta>;
}

export interface ScheduleBackend {
  read(): Promise<StoredSchedule | null>;
  write(entry: StoredSchedule): Promise<boolean>;
  readPrevious?(): Promise<StoredSchedule | null>;
  writePrevious?(entry: StoredSchedule): Promise<boolean>;
}

function isStoredSchedule(v: unknown): v is StoredSchedule {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  if (
    typeof e.version !== "string" ||
    typeof e.updatedAt !== "string" ||
    !Array.isArray(e.data)
  ) {
    return false;
  }
  if (e.chunks !== undefined) {
    if (typeof e.chunks !== "object" || e.chunks === null) return false;
    for (const value of Object.values(e.chunks as Record<string, unknown>)) {
      if (typeof value !== "object" || value === null) return false;
      const c = value as Record<string, unknown>;
      if (typeof c.sha256 !== "string" || typeof c.size !== "number") return false;
    }
  }
  return true;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(SCHEDULE_DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(SCHEDULE_STORE_NAME)) {
          req.result.createObjectStore(SCHEDULE_STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
      req.onblocked = () => reject(new Error("indexedDB open blocked"));
    } catch (err) {
      reject(err);
    }
  });
}

function tx<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    try {
      const t = db.transaction(SCHEDULE_STORE_NAME, mode);
      const store = t.objectStore(SCHEDULE_STORE_NAME);
      const req = run(store);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("indexedDB request failed"));
      t.onerror = () => reject(t.error ?? new Error("indexedDB transaction failed"));
    } catch (err) {
      reject(err);
    }
  });
}

export class IndexedDbScheduleBackend implements ScheduleBackend {
  private async get(key: string): Promise<StoredSchedule | null> {
    try {
      if (typeof indexedDB === "undefined") return null;
      const db = await openDb();
      try {
        const raw = await tx(db, "readonly", (s) => s.get(key));
        return isStoredSchedule(raw) ? raw : null;
      } finally {
        db.close();
      }
    } catch {
      return null;
    }
  }

  private async put(key: string, entry: StoredSchedule): Promise<boolean> {
    try {
      if (typeof indexedDB === "undefined") return false;
      const db = await openDb();
      try {
        await tx(db, "readwrite", (s) => s.put(entry, key));
        return true;
      } finally {
        db.close();
      }
    } catch {
      return false;
    }
  }

  async read(): Promise<StoredSchedule | null> {
    return this.get(SCHEDULE_ACTIVE_KEY);
  }

  async write(entry: StoredSchedule): Promise<boolean> {
    return this.put(SCHEDULE_ACTIVE_KEY, entry);
  }

  async readPrevious(): Promise<StoredSchedule | null> {
    return this.get(SCHEDULE_PREVIOUS_KEY);
  }

  async writePrevious(entry: StoredSchedule): Promise<boolean> {
    return this.put(SCHEDULE_PREVIOUS_KEY, entry);
  }
}

/** In-memory backend: test seam + SSR fallback shape. Never persists. */
export class MemoryScheduleBackend implements ScheduleBackend {
  private entry: StoredSchedule | null = null;
  private previous: StoredSchedule | null = null;
  /** Flip to simulate quota/private-mode write failures. */
  failWrites = false;

  async read(): Promise<StoredSchedule | null> {
    return this.entry;
  }

  async write(entry: StoredSchedule): Promise<boolean> {
    if (this.failWrites) return false;
    this.entry = entry;
    return true;
  }

  async readPrevious(): Promise<StoredSchedule | null> {
    return this.previous;
  }

  async writePrevious(entry: StoredSchedule): Promise<boolean> {
    if (this.failWrites) return false;
    this.previous = entry;
    return true;
  }

  clear(): void {
    this.entry = null;
    this.previous = null;
  }
}

let defaultBackend: ScheduleBackend | null = null;

/** Test-only seam: swap the process-wide backend. */
export function __setScheduleBackendForTests(backend: ScheduleBackend | null): void {
  defaultBackend = backend;
}

function getBackend(): ScheduleBackend {
  if (defaultBackend) return defaultBackend;
  if (typeof indexedDB === "undefined") {
    // SSR / non-browser: a throwaway memory backend (never persisted, but
    // keeps the API total). Cached per-process to behave like a singleton.
    defaultBackend = new MemoryScheduleBackend();
    return defaultBackend;
  }
  defaultBackend = new IndexedDbScheduleBackend();
  return defaultBackend;
}

export function readActiveSchedule(): Promise<StoredSchedule | null> {
  try {
    return getBackend().read();
  } catch {
    return Promise.resolve(null);
  }
}

/** Atomic single-key put. Resolves false (never throws) on any failure. */
export function writeActiveSchedule(entry: StoredSchedule): Promise<boolean> {
  try {
    return getBackend().write(entry);
  } catch {
    return Promise.resolve(false);
  }
}

export function readPreviousSchedule(): Promise<StoredSchedule | null> {
  try {
    const backend = getBackend();
    if (!backend.readPrevious) return Promise.resolve(null);
    return backend.readPrevious();
  } catch {
    return Promise.resolve(null);
  }
}

/**
 * Rotate `active` → `previous`, then store the new entry as `active`.
 * Both writes must succeed; any failure leaves the previous timetable
 * untouched. Never throws.
 */
export async function rotateActiveSchedule(entry: StoredSchedule): Promise<boolean> {
  try {
    const backend = getBackend();
    const current = await backend.read();
    if (current && backend.writePrevious) {
      const kept = await backend.writePrevious(current);
      if (!kept) return false;
    }
    return backend.write(entry);
  } catch {
    return false;
  }
}
