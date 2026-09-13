// Version pointer for hot-updatable metro datasets (timetable first).
//
// Mirrors the holidays update architecture: a tiny same-origin manifest is
// polled with `cache: "no-store"` at startup; the full version-pinned
// payload is only downloaded when its version is genuinely newer.
// The manifest itself must NEVER be precached (see serwist.config.js
// globIgnores + the NetworkFirst SW rule) — otherwise clients would poll a
// frozen copy and never discover updates.

export const METRO_DATA_MANIFEST_URL = "/metro-data-manifest.json";
export const METRO_DATA_MANIFEST_SCHEMA_VERSION = 1;

export interface MetroDataManifestSchedule {
  version: string;
  url: string;
}

export interface MetroDataManifest {
  schemaVersion: number;
  schedule: MetroDataManifestSchedule;
}

/**
 * Validate + normalize a downloaded manifest. Returns null when unusable.
 * Unknown extra fields are ignored so future datasets (stations, status)
 * can extend this file without breaking older clients.
 */
export function parseMetroDataManifest(raw: unknown): MetroDataManifest | null {
  if (typeof raw !== "object" || raw === null) return null;
  const d = raw as Record<string, unknown>;
  if (d.schemaVersion !== METRO_DATA_MANIFEST_SCHEMA_VERSION) return null;
  if (typeof d.schedule !== "object" || d.schedule === null) return null;
  const s = d.schedule as Record<string, unknown>;
  if (typeof s.version !== "string" || s.version.length === 0) return null;
  if (typeof s.url !== "string" || s.url.length === 0) return null;
  // Same-origin only: the updater must never fetch upstream/third-party.
  if (!s.url.startsWith("/")) return null;
  return {
    schemaVersion: METRO_DATA_MANIFEST_SCHEMA_VERSION,
    schedule: { version: s.version, url: s.url },
  };
}

/**
 * Compare dotted schedule versions (numeric segments, then lexicographic —
 * same semantics as isNewerHolidayVersion). Empty current version means
 * "bundled/unknown": any well-formed remote version counts as newer.
 */
export function isNewerScheduleVersion(remote: string, current: string): boolean {
  if (remote === current) return false;
  if (current.length === 0) return true;
  const pa = remote.split(".").map((s) => Number(s));
  const pb = current.split(".").map((s) => Number(s));
  const numeric =
    pa.length === pb.length &&
    pa.every((n) => Number.isInteger(n)) &&
    pb.every((n) => Number.isInteger(n));
  if (numeric) {
    for (let i = 0; i < pa.length; i++) {
      if (pa[i] !== pb[i]) return pa[i] > pb[i];
    }
    return false;
  }
  return remote > current;
}
