// Durable storage for the hot-updated timetable (IndexedDB, never
// localStorage — the dataset is ~5MB, far beyond the localStorage comfort
// zone and its synchronous API would jank startup).
//
// Design:
// - DB `metto-schedule`, store `timetable`, key `active` holds
//   { version, updatedAt, data }. Single-key atomic put = atomic switch.
// - All functions are SSR-safe (no top-level indexedDB access) and never
//   throw: every failure resolves to null/false and callers keep the
//   previous timetable.
// - The backend is injectable so unit tests (node env, no IndexedDB) and
//   any future migration can substitute storage without touching callers.

import type { LineScheduleData } from "../schedule-data";

export const SCHEDULE_DB_NAME = "metto-schedule";
export const SCHEDULE_STORE_NAME = "timetable";
export const SCHEDULE_ACTIVE_KEY = "active";

export interface StoredSchedule {
  version: string;
  updatedAt: string;
  data: LineScheduleData[];
}

export interface ScheduleBackend {
  read(): Promise<StoredSchedule | null>;
  write(entry: StoredSchedule): Promise<boolean>;
}

function isStoredSchedule(v: unknown): v is StoredSchedule {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.version === "string" &&
    typeof e.updatedAt === "string" &&
    Array.isArray(e.data)
  );
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
  async read(): Promise<StoredSchedule | null> {
    try {
      if (typeof indexedDB === "undefined") return null;
      const db = await openDb();
      try {
        const raw = await tx(db, "readonly", (s) => s.get(SCHEDULE_ACTIVE_KEY));
        return isStoredSchedule(raw) ? raw : null;
      } finally {
        db.close();
      }
    } catch {
      return null;
    }
  }

  async write(entry: StoredSchedule): Promise<boolean> {
    try {
      if (typeof indexedDB === "undefined") return false;
      const db = await openDb();
      try {
        await tx(db, "readwrite", (s) => s.put(entry, SCHEDULE_ACTIVE_KEY));
        return true;
      } finally {
        db.close();
      }
    } catch {
      return false;
    }
  }
}

/** In-memory backend: test seam + SSR fallback shape. Never persists. */
export class MemoryScheduleBackend implements ScheduleBackend {
  private entry: StoredSchedule | null = null;
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

  clear(): void {
    this.entry = null;
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
