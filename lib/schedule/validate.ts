// Full-dataset validation for downloaded timetables.
//
// Runs BEFORE activation: a payload that fails any check here is discarded
// and the previous timetable stays active. Reuses the canonical types from
// lib/schedule-data.ts, Tehran service-time parsing, and the station
// resolver (which also accepts legacy English-name IDs, so both vintages
// of schedule-data.json validate).
import type { LineScheduleData } from "../schedule-data";
import { resolveStationId } from "../metro/selectors";
import { parseServiceTimeToMinutes } from "../tehran-time";
import type { DayType } from "../schedule-data";

const DAY_TYPES: ReadonlySet<string> = new Set([
  "saturday_wednesday",
  "thursday",
  "friday",
]);

export type ScheduleValidationError = string;

function isDayType(v: unknown): v is DayType {
  return typeof v === "string" && DAY_TYPES.has(v);
}

/** Fail-closed structural + referential checks. Empty array = valid. */
export function validateScheduleDataset(raw: unknown): ScheduleValidationError[] {
  const errors: ScheduleValidationError[] = [];
  if (!Array.isArray(raw)) {
    return ["schedule dataset must be an array of line schedules"];
  }
  if (raw.length === 0) {
    return ["schedule dataset must not be empty"];
  }
  raw.forEach((line, li) => {
    const where = `line[${li}]`;
    if (typeof line !== "object" || line === null) {
      errors.push(`${where} must be an object`);
      return;
    }
    const l = line as Record<string, unknown>;
    if (typeof l.line !== "number" || !Number.isInteger(l.line) || l.line <= 0) {
      errors.push(`${where}.line must be a positive integer`);
    }
    for (const f of ["terminalA", "terminalB", "scheduleKey"] as const) {
      if (typeof l[f] !== "string" || (l[f] as string).length === 0) {
        errors.push(`${where}.${f} must be a non-empty string`);
      }
    }
    if (typeof l.isBranch !== "boolean") {
      errors.push(`${where}.isBranch must be a boolean`);
    }
    if (!Array.isArray(l.trains) || l.trains.length === 0) {
      errors.push(`${where}.trains must be a non-empty array`);
      return;
    }
    (l.trains as unknown[]).forEach((train, ti) => {
      const twhere = `${where}.trains[${ti}]`;
      if (typeof train !== "object" || train === null) {
        errors.push(`${twhere} must be an object`);
        return;
      }
      const t = train as Record<string, unknown>;
      if (typeof t.line !== "number" || t.line !== l.line) {
        errors.push(`${twhere}.line must match its line group (${String(l.line)})`);
      }
      if (typeof t.direction !== "string" || t.direction.length === 0) {
        errors.push(`${twhere}.direction must be a non-empty string`);
      } else if (resolveStationId(t.direction) === undefined) {
        errors.push(`${twhere}.direction references unknown station ${t.direction}`);
      }
      if (!isDayType(t.dayType)) {
        errors.push(`${twhere}.dayType must be a known day type`);
      }
      if (typeof t.isExpress !== "boolean") {
        errors.push(`${twhere}.isExpress must be a boolean`);
      }
      if (!Array.isArray(t.stops) || (t.stops as unknown[]).length < 2) {
        errors.push(`${twhere}.stops must be an array of at least 2 stops`);
        return;
      }
      (t.stops as unknown[]).forEach((stop, si) => {
        const swhere = `${twhere}.stops[${si}]`;
        if (typeof stop !== "object" || stop === null) {
          errors.push(`${swhere} must be an object`);
          return;
        }
        const s = stop as Record<string, unknown>;
        if (typeof s.stationId !== "string" || s.stationId.length === 0) {
          errors.push(`${swhere}.stationId must be a non-empty string`);
        } else if (resolveStationId(s.stationId) === undefined) {
          errors.push(`${swhere}.stationId references unknown station ${s.stationId}`);
        }
        if (typeof s.time !== "string" || s.time.length === 0) {
          errors.push(`${swhere}.time must be a non-empty string`);
        } else {
          try {
            parseServiceTimeToMinutes(s.time);
          } catch {
            errors.push(`${swhere}.time is not a valid service time (${s.time})`);
          }
        }
      });
    });
  });
  return errors;
}

/**
 * Type-narrowing wrapper: returns the dataset when valid, null otherwise.
 * Never throws.
 */
export function parseScheduleDataset(raw: unknown): LineScheduleData[] | null {
  try {
    if (validateScheduleDataset(raw).length > 0) return null;
    return raw as LineScheduleData[];
  } catch {
    return null;
  }
}
