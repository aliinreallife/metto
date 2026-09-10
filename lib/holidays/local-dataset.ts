// Offline-first holiday dataset for client routing + compact UI.
// Same-origin `/holidays.json` is precached by Serwist; routing reads the
// in-memory copy synchronously and NEVER fetches upstream (timestamp.ir).
// Unknown dates stay UNKNOWN — never silently treated as confirmed days.

export type HolidayState = "holiday" | "non-holiday" | "unknown";
export type HolidayKind = "official" | "exceptional_closure" | "unknown";

export interface HolidayRecord {
  /** Gregorian Tehran-calendar date "YYYY-MM-DD" (canonical key). */
  gregorianDate: string;
  /** Jalali date "YYYY-MM-DD" (e.g. "1405-06-22"). */
  jalaliDate: string;
  state: HolidayState;
  kind: HolidayKind;
  faName?: string;
  enName?: string;
  source?: string;
  checkedAt?: string;
}

export interface HolidayDataset {
  version: string;
  generatedAt: string;
  lastSuccessfulSync: string;
  validFrom: string;
  validThrough: string;
  source: string;
  coverage: string;
  records: Record<string, HolidayRecord>;
}

const GREG_RE = /^\d{4}-\d{2}-\d{2}$/;
const JALALI_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(v: unknown): v is HolidayRecord {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.gregorianDate === "string" &&
    GREG_RE.test(r.gregorianDate) &&
    typeof r.jalaliDate === "string" &&
    JALALI_RE.test(r.jalaliDate) &&
    (r.state === "holiday" ||
      r.state === "non-holiday" ||
      r.state === "unknown") &&
    (r.kind === "official" ||
      r.kind === "exceptional_closure" ||
      r.kind === "unknown") &&
    (r.faName === undefined || typeof r.faName === "string") &&
    (r.enName === undefined || typeof r.enName === "string")
  );
}

/** Validate + normalize a downloaded dataset. Returns null when unusable. */
export function parseHolidayDataset(raw: unknown): HolidayDataset | null {
  if (typeof raw !== "object" || raw === null) return null;
  const d = raw as Record<string, unknown>;
  if (
    typeof d.version !== "string" ||
    d.version.length === 0 ||
    typeof d.lastSuccessfulSync !== "string" ||
    typeof d.validThrough !== "string" ||
    typeof d.source !== "string" ||
    typeof d.coverage !== "string" ||
    typeof d.records !== "object" ||
    d.records === null
  ) {
    return null;
  }
  const records: Record<string, HolidayRecord> = {};
  for (const [key, value] of Object.entries(
    d.records as Record<string, unknown>,
  )) {
    if (!GREG_RE.test(key) || !isRecord(value)) return null;
    // Key must match the record's own canonical date (no aliasing bugs).
    if (value.gregorianDate !== key) return null;
    records[key] = value;
  }
  return {
    version: d.version,
    generatedAt:
      typeof d.generatedAt === "string" ? d.generatedAt : d.lastSuccessfulSync,
    lastSuccessfulSync: d.lastSuccessfulSync,
    validFrom: typeof d.validFrom === "string" ? d.validFrom : "",
    validThrough: d.validThrough,
    source: d.source,
    coverage: d.coverage,
    records,
  };
}

/** Compare semantic-ish versions (numeric segments, then lexicographic). */
export function isNewerHolidayVersion(a: string, b: string): boolean {
  if (a === b) return false;
  const pa = a.split(".").map((s) => Number(s));
  const pb = b.split(".").map((s) => Number(s));
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
  return a > b;
}
