// Best-effort persistent storage (never a guarantee).
// Users can always clear site data; browsers may still evict. Persistence
// only reduces the chance of the offline precache disappearing.
let persistAttempted = false;

export async function ensurePersistentStorage(): Promise<boolean> {
  try {
    if (persistAttempted) return true;
    persistAttempted = true;
    if (
      typeof navigator === "undefined" ||
      !navigator.storage ||
      typeof navigator.storage.persist !== "function"
    ) {
      return false;
    }
    if (typeof navigator.storage.persisted === "function") {
      try {
        if (await navigator.storage.persisted()) return true;
      } catch {
        // Fall through to persist().
      }
    }
    try {
      return await navigator.storage.persist();
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

export async function getStorageEstimate(): Promise<{
  quota?: number;
  usage?: number;
} | null> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage) return null;
    if (typeof navigator.storage.estimate !== "function") return null;
    const est = await navigator.storage.estimate();
    return { quota: est.quota, usage: est.usage };
  } catch {
    return null;
  }
}
