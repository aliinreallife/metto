"use client";

// One-shot stale-bundle recovery helpers.
//
// Background: after a deployment, a page served from a stale document
// cache may reference hashed `/_next/static` chunks that no longer exist.
// The route segment then fails with a ChunkLoadError while the layout shell
// (tabs) still renders — a blank-looking page a normal reload sometimes
// cannot fix (the stale document is re-served from cache).
//
// Policy:
// - Automatic: at most ONE `location.reload()` per session per failure
//   class, guarded by sessionStorage. Never loops.
// - Manual ("Reload fresh"): user-initiated only. May clear stale document
//   caches and unregister the worker, because the user explicitly asked
//   for a fresh start.
// - Normal error paths (Try again / reset) must NEVER unregister the
//   service worker or clear caches.

const CHUNK_RETRY_KEY = "metto:chunk-retry";

/** True for Next.js stale-chunk failures (dynamic import / chunk load). */
export function isChunkLoadError(message: unknown): boolean {
  if (typeof message !== "string" || message.length === 0) return false;
  return (
    /Loading chunk [\w-]+ failed/i.test(message) ||
    /ChunkLoadError/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message)
  );
}

function sessionFlagSet(): boolean {
  try {
    return sessionStorage.getItem(CHUNK_RETRY_KEY) === "1";
  } catch {
    // Storage unreadable: treat as already-retried so we never loop.
    return true;
  }
}

function markSessionRetried(): void {
  try {
    sessionStorage.setItem(CHUNK_RETRY_KEY, "1");
  } catch {
    // Ignore — the reload still happens once; worst case the recovery
    // card shows instead of a second silent attempt.
  }
}

/**
 * Returns true when the caller should perform the single automatic reload
 * for a chunk failure. First chunk failure of the session → marks the flag
 * and returns true. Any later one → returns false (show recovery UI).
 */
export function consumeChunkAutoRetry(): boolean {
  if (sessionFlagSet()) return false;
  markSessionRetried();
  return true;
}

/** Delete stale document caches (current + any per-build versioned ones). */
export async function clearDocumentCaches(): Promise<void> {
  try {
    if (typeof caches === "undefined") return;
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k === "metto-pages" || k.startsWith("metto-pages-"))
        .map((k) => caches.delete(k)),
    );
  } catch {
    // Best-effort.
  }
}

/**
 * Aggressive manual recovery: drop stale document caches, unregister the
 * (possibly stale) service worker, then reload. User-initiated only —
 * never called from automatic paths.
 */
export async function reloadFresh(): Promise<void> {
  await clearDocumentCaches();
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
    }
  } catch {
    // Best-effort: still reload below.
  }
  window.location.reload();
}
