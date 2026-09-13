// Pure service-worker route predicates for the dynamic timetable.
//
// Extracted (not inlined in app/sw.ts) so unit tests can prove the routing
// contract without running a worker:
// - the manifest is never served from precache (NetworkFirst at runtime);
// - a version-pinned schedule download NEVER resolves to the precached
//   bare `/schedule-data.json` entry (NetworkOnly when a query is present).
// app/sw.ts imports these — behavior and tests cannot drift apart.

/** True for the tiny update pointer (must revalidate, never freeze). */
export function isDataManifestRequest(pathname: string): boolean {
  return pathname === "/metro-data-manifest.json";
}

/**
 * True for a version-pinned timetable download, e.g.
 * `/schedule-data.json?v=2026-09-13.1`. The bare precached fallback
 * (`/schedule-data.json` with NO query) intentionally returns false here —
 * it keeps serving deterministically from the precache.
 */
export function isVersionedScheduleRequest(pathname: string, search: string): boolean {
  return pathname === "/schedule-data.json" && search.length > 0;
}
