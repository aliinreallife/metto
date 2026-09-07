import { STATIONS } from "./stations";
import { ROUTES } from "./routes";
import { SEGMENTS, SEGMENT_STATUS_OVERRIDES } from "./segments";
import { getStationLines, isInterchange } from "./selectors";
import type { StopStatus } from "./types";

export type ValidationError = string;

const STOP_STATUSES: StopStatus[] = ["operational", "under_construction", "planned"];

/** Fail-closed consistency checks for the metro dataset. Run in tests/CI. */
export function validateMetro(): ValidationError[] {
  const errors: ValidationError[] = [];
  const stationIds = new Set(STATIONS.map((s) => s.id));
  const routeIds = new Set(ROUTES.map((r) => r.id));
  const segmentIds = new Set(SEGMENTS.map((s) => s.id));

  // Unique station IDs.
  if (stationIds.size !== STATIONS.length) {
    errors.push("duplicate station IDs detected");
  }

  // Segment IDs must be globally unique (the id scheme line-n-a-b assumes no
  // pair repeats across routes of the same line).
  if (segmentIds.size !== SEGMENTS.length) {
    errors.push("duplicate segment IDs detected");
  }

  // Route referential integrity + continuity + no self loops.
  for (const r of ROUTES) {
    if (r.stops.length === 0) {
      errors.push(`route ${r.id} has no stops`);
      continue;
    }
    for (const stop of r.stops) {
      if (!stationIds.has(stop.stationId)) {
        errors.push(`route ${r.id} references unknown station ${stop.stationId}`);
      }
      if (!STOP_STATUSES.includes(stop.status)) {
        errors.push(`route ${r.id} stop ${stop.stationId} has invalid status ${stop.status}`);
      }
    }
    for (let i = 0; i < r.stops.length - 1; i++) {
      const a = r.stops[i].stationId;
      const b = r.stops[i + 1].stationId;
      if (a === b) {
        errors.push(`route ${r.id} has self-loop at ${a}`);
        continue;
      }
      const seg = SEGMENTS.find(
        (s) =>
          s.routeId === r.id &&
          ((s.from === a && s.to === b) || (s.from === b && s.to === a)),
      );
      if (!seg) {
        errors.push(`route ${r.id} missing segment for ${a} <-> ${b}`);
      }
    }
  }

  // Segment integrity.
  const edgeKeys = new Set<string>();
  for (const s of SEGMENTS) {
    if (!stationIds.has(s.from)) {
      errors.push(`segment ${s.id} references unknown station ${s.from}`);
    }
    if (!stationIds.has(s.to)) {
      errors.push(`segment ${s.id} references unknown station ${s.to}`);
    }
    if (!routeIds.has(s.routeId)) {
      errors.push(`segment ${s.id} references unknown route ${s.routeId}`);
    }
    if (s.from === s.to) {
      errors.push(`segment ${s.id} is a self-loop`);
    }
    const route = ROUTES.find((r) => r.id === s.routeId);
    if (route && s.lineId !== route.lineId) {
      errors.push(`segment ${s.id} lineId disagrees with route ${s.routeId}`);
    }
    const k = [s.from, s.to].sort().join("|") + "|" + s.routeId;
    if (edgeKeys.has(k)) {
      errors.push(`duplicate segment for ${k} (${s.id})`);
    }
    edgeKeys.add(k);
    // The segment must be a consecutive pair in its route's ordered stops.
    if (route) {
      const ids = route.stops.map((stop) => stop.stationId);
      const adjacent = ids.some(
        (sid, i) =>
          (sid === s.from && ids[i + 1] === s.to) ||
          (sid === s.to && ids[i + 1] === s.from),
      );
      if (!adjacent) {
        errors.push(`segment ${s.id} is not a consecutive pair in ${s.routeId}`);
      }
    }
  }

  // Overrides must reference real segments.
  for (const id of Object.keys(SEGMENT_STATUS_OVERRIDES)) {
    if (!segmentIds.has(id)) {
      errors.push(`override references unknown segment ${id}`);
    }
  }

  // Track status is explicit-only: every non-operational segment must be
  // override-listed. Nothing is derived from station status.
  for (const s of SEGMENTS) {
    if (s.status !== "operational" && !(s.id in SEGMENT_STATUS_OVERRIDES)) {
      errors.push(`segment ${s.id} non-operational without explicit override`);
    }
  }

  // Strict branch rule: a branch of Line N must join another route of the
  // SAME Line N at its junction. Meeting a different line does not count.
  for (const r of ROUTES) {
    if (!r.branchId) continue;
    const junction = r.stops[0]?.stationId;
    const shared = ROUTES.some(
      (o) =>
        o.id !== r.id &&
        o.lineId === r.lineId &&
        o.stops.some((stop) => stop.stationId === junction),
    );
    if (!shared) {
      errors.push(
        `branch route ${r.id} junction ${junction} not shared with same-line route`,
      );
    }
  }

  // Line derivation completeness: every station must appear in >=1 route.
  for (const s of STATIONS) {
    if (getStationLines(s.id).length === 0) {
      errors.push(`station ${s.id} appears in no route (orphan)`);
    }
  }

  // Interchange derivation sanity: isInterchange must equal lines>1.
  for (const s of STATIONS) {
    const lines = getStationLines(s.id);
    if (isInterchange(s.id) !== lines.length > 1) {
      errors.push(`station ${s.id} interchange derivation inconsistent`);
    }
  }

  return errors;
}
