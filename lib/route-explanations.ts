import { computeRouteTopology, type RouteResult, type RouteTopology } from "./route";
import {
  DEFAULT_TRANSFER_WALK_SECONDS,
  getTransferWalkSeconds,
} from "./metro/transfers";

type SelectedRoute = Pick<RouteResult, "status" | "segments" | "path" | "numTransfers">;

function changesAtEramBetween4And5(
  segments: Pick<RouteTopology, "segments">["segments"],
): boolean {
  return segments.some((segment) => {
    const change = segment.changeFromPrevious;
    return change.type === "line_transfer" &&
      change.stationId === "eram-e-sabz" &&
      ((change.fromLineId === 4 && change.toLineId === 5) ||
        (change.fromLineId === 5 && change.toLineId === 4));
  });
}

export type EramAvoidanceReason = {
  extraTransfers: number;
  eramWalkMinutes: number;
};

/**
 * Only explain additional transfers when a controlled counterfactual proves
 * that the Eram-specific walking penalty caused the preferred route to change.
 * Both paths use the exact same graph and all other routing penalties.
 * Neither is a verified fastest-time claim.
 */
export function compareEramAvoidance(
  selected: SelectedRoute,
  noEramExtraPenalty: RouteTopology | null,
): EramAvoidanceReason | null {
  if (selected.status !== "complete" || !noEramExtraPenalty ||
      selected.numTransfers <= noEramExtraPenalty.numTransfers ||
      changesAtEramBetween4And5(selected.segments) ||
      !changesAtEramBetween4And5(noEramExtraPenalty.segments)) return null;
  const actualWalk = getTransferWalkSeconds("eram-e-sabz", 4, 5);
  if (actualWalk <= DEFAULT_TRANSFER_WALK_SECONDS) return null;
  return {
    extraTransfers: selected.numTransfers - noEramExtraPenalty.numTransfers,
    eramWalkMinutes: Math.round(actualWalk / 60),
  };
}

/** No route-selection change: the second Dijkstra pass is explanation-only. */
export function getEramAvoidanceReason(route: SelectedRoute): EramAvoidanceReason | null {
  if (route.status !== "complete" || !route.path.length ||
      changesAtEramBetween4And5(route.segments)) return null;
  const alternative = computeRouteTopology(
    route.path[0],
    route.path[route.path.length - 1],
    { normalizeEramWalkPenalty: true },
  );
  return compareEramAvoidance(route, alternative);
}
