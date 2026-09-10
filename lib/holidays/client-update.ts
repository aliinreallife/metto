// Background refresh of the SAME-ORIGIN holiday dataset (never upstream).
// Flow: check `/holidays.version.json` (tiny) → only download the full
// `/holidays.json` when the version is genuinely newer → validate → adopt.
// Any failure keeps the last-known-good copy. No exceptions to callers.
import {
  isNewerHolidayVersion,
  parseHolidayDataset,
  type HolidayDataset,
} from "./local-dataset";

export const HOLIDAY_DATASET_KEY = "metto.holidays.dataset";
export const HOLIDAY_NOTIFIED_KEY = "metto.holidays.notifiedVersion";

export function readStoredDataset(): HolidayDataset | null {
  try {
    const raw = localStorage.getItem(HOLIDAY_DATASET_KEY);
    if (!raw) return null;
    return parseHolidayDataset(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function storeDataset(dataset: HolidayDataset): void {
  try {
    localStorage.setItem(HOLIDAY_DATASET_KEY, JSON.stringify(dataset));
  } catch {
    // Quota/private-mode: memory copy still works for this session.
  }
}

export function readNotifiedVersion(): string | null {
  try {
    return localStorage.getItem(HOLIDAY_NOTIFIED_KEY);
  } catch {
    return null;
  }
}

export function markVersionNotified(version: string): void {
  try {
    localStorage.setItem(HOLIDAY_NOTIFIED_KEY, version);
  } catch {
    // Non-fatal.
  }
}

async function fetchJson(path: string): Promise<unknown> {
  // no-store: version discovery must never rely on HTTP-cache luck.
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`http-${res.status}`);
  return res.json();
}

/**
 * Returns a validated newer dataset, or null when there is nothing new /
 * anything fails. Never throws. Callers adopt the result + persist it.
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
