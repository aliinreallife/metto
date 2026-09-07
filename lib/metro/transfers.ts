import { STATIONS } from "./stations";
import { ROUTES } from "./routes";
import {
  getStationLines,
  isInterchange,
  resolveStationId,
} from "./selectors";
import type { LineId, RouteId, StationId } from "./types";

/** Default platform-to-platform interchange walking time (seconds). */
export const DEFAULT_TRANSFER_WALK_SECONDS = 4 * 60;

/**
 * Walking time applied when staying on the same physical line while changing
 * service/branch (train_change). Kept separate from line-transfer walking so
 * the transfer helper never hardcodes same-line policy.
 */
export const TRAIN_CHANGE_WALK_SECONDS = 0;

export type TransferConfidence = "verified" | "estimated";

export interface TransferRule {
  stationId: StationId;
  fromLineId: LineId;
  toLineId: LineId;
  /** Interchange walking time in seconds (excludes train waiting). */
  walkSeconds: number;
  confidence?: TransferConfidence;
  /** Optional route-scoped override; falls back to the line-level rule. */
  fromRouteId?: RouteId;
  toRouteId?: RouteId;
}

export const TRANSFER_RULES: TransferRule[] = [
  {
    stationId: "eram-e-sabz",
    fromLineId: 4,
    toLineId: 5,
    walkSeconds: 480,
    confidence: "estimated",
  },
  {
    stationId: "eram-e-sabz",
    fromLineId: 5,
    toLineId: 4,
    walkSeconds: 480,
    confidence: "estimated",
  },
];

function normStation(id: string): string {
  return resolveStationId(id) ?? id;
}

/**
 * Most-specific matching rule for station + from line + to line, with
 * optional route-scoped overrides taking precedence over line-level rules.
 */
export function getTransferRule(
  stationId: StationId,
  fromLineId: LineId,
  toLineId: LineId,
  fromRouteId?: RouteId,
  toRouteId?: RouteId,
): TransferRule | undefined {
  const station = normStation(stationId);
  const candidates = TRANSFER_RULES.filter(
    (r) =>
      normStation(r.stationId) === station &&
      r.fromLineId === fromLineId &&
      r.toLineId === toLineId &&
      (r.fromRouteId === undefined || r.fromRouteId === fromRouteId) &&
      (r.toRouteId === undefined || r.toRouteId === toRouteId),
  );
  if (candidates.length === 0) return undefined;
  // Prefer the most route-specific rule.
  candidates.sort((a, b) => {
    const specificity = (r: TransferRule) =>
      (r.fromRouteId !== undefined ? 1 : 0) + (r.toRouteId !== undefined ? 1 : 0);
    return specificity(b) - specificity(a);
  });
  return candidates[0];
}

/**
 * Station-specific interchange walking time in seconds (excludes waiting).
 * Falls back to the network default when no explicit rule exists.
 */
export function getTransferWalkSeconds(
  stationId: StationId,
  fromLineId: LineId,
  toLineId: LineId,
  fromRouteId?: RouteId,
  toRouteId?: RouteId,
): number {
  return (
    getTransferRule(stationId, fromLineId, toLineId, fromRouteId, toRouteId)
      ?.walkSeconds ?? DEFAULT_TRANSFER_WALK_SECONDS
  );
}

/** True when an explicit station-specific rule exists (drives special UI). */
export function hasExplicitTransferRule(
  stationId: StationId,
  fromLineId: LineId,
  toLineId: LineId,
  fromRouteId?: RouteId,
  toRouteId?: RouteId,
): boolean {
  return (
    getTransferRule(stationId, fromLineId, toLineId, fromRouteId, toRouteId) !==
    undefined
  );
}

/** Fail-closed checks for the transfer-rule table. Run in tests/CI. */
export function validateTransferRules(): string[] {
  const errors: string[] = [];
  const stationIds = new Set(STATIONS.map((s) => s.id));
  const routeById = new Map(ROUTES.map((r) => [r.id, r]));
  const seen = new Set<string>();

  for (const r of TRANSFER_RULES) {
    const station = normStation(r.stationId);
    const key = [
      station,
      r.fromLineId,
      r.toLineId,
      r.fromRouteId ?? "",
      r.toRouteId ?? "",
    ].join("|");
    if (seen.has(key)) {
      errors.push(`duplicate transfer rule for ${key}`);
    }
    seen.add(key);

    if (!stationIds.has(station)) {
      errors.push(`transfer rule references unknown station ${r.stationId}`);
      continue;
    }
    if (!Number.isFinite(r.walkSeconds) || r.walkSeconds <= 0) {
      errors.push(
        `transfer rule ${station} L${r.fromLineId}->L${r.toLineId} has invalid walkSeconds ${r.walkSeconds}`,
      );
    }
    if (r.fromLineId === r.toLineId) {
      errors.push(
        `transfer rule ${station} must span two different lines (got L${r.fromLineId}->L${r.toLineId})`,
      );
    }
    const lines = getStationLines(station);
    if (!lines.includes(r.fromLineId) || !lines.includes(r.toLineId)) {
      errors.push(
        `transfer rule ${station} L${r.fromLineId}->L${r.toLineId} is not served by both lines (served: ${lines.join(",") || "none"})`,
      );
    }
    if (!isInterchange(station)) {
      errors.push(`transfer rule ${station} is not an interchange station`);
    }
    for (const [routeId, label] of [
      [r.fromRouteId, "fromRouteId"],
      [r.toRouteId, "toRouteId"],
    ] as const) {
      if (routeId === undefined) continue;
      const route = routeById.get(routeId);
      if (!route) {
        errors.push(`transfer rule ${station} references unknown route ${routeId}`);
        continue;
      }
      const expectedLine =
        label === "fromRouteId" ? r.fromLineId : r.toLineId;
      if (route.lineId !== expectedLine) {
        errors.push(
          `transfer rule ${station} ${label} ${routeId} belongs to L${route.lineId}, expected L${expectedLine}`,
        );
      }
      if (!route.stops.some((s) => normStation(s.stationId) === station)) {
        errors.push(
          `transfer rule ${station} ${label} ${routeId} does not serve ${station}`,
        );
      }
    }
    if (
      r.confidence !== undefined &&
      r.confidence !== "verified" &&
      r.confidence !== "estimated"
    ) {
      errors.push(`transfer rule ${station} has invalid confidence ${r.confidence}`);
    }
  }

  return errors;
}
