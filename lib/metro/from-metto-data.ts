// SPDX-License-Identifier: ODbL-1.0
// Reviewable, offline-bundled adapter for pinned metto-data/Tehran.
// This file converts from namespaced dataset IDs to existing public Metto IDs.
// No upstream fetch, dynamic import, station renaming, or runtime network access.
import rawStations from "../../data/metto-data/tehran/stations.json";
import rawLines from "../../data/metto-data/tehran/lines.json";
import rawGraph from "../../data/metto-data/tehran/graph.json";
import type {
  MetroStation, MetroLine, MetroRoute, MetroSegment, SegmentId,
  SegmentStatus, StationId,
} from "./types";
import type { TransferRule } from "./transfers";

function localId(value: string, kind: string): string {
  const prefix = `tehran:${kind}:`;
  if (!value.startsWith(prefix) || value.length <= prefix.length) {
    throw new Error(`metto-data: unexpected ${kind} ID ${value}`);
  }
  return value.slice(prefix.length);
}

const faDigits = "۰۱۲۳۴۵۶۷۸۹";
function persianDigits(value: string): string {
  return value.replace(/[0-9]/g, (n) => faDigits[Number(n)]);
}

export const importedStations: MetroStation[] = rawStations.map((s) => ({
  id: localId(s.id, "station"),
  name: { fa: s.names.fa, en: s.names.en },
  location: { lat: s.location.lat, lng: s.location.lng },
  amenities: { ...s.amenities },
  ...(s.amenitiesVerified !== undefined
    ? { amenitiesVerified: s.amenitiesVerified }
    : {}),
  status: s.status as MetroStation["status"],
}));

export const importedLines: MetroLine[] = rawLines.map((l) => ({
  id: Number(localId(l.id, "line")),
  name: { fa: persianDigits(l.names.fa), en: l.names.en },
  color: l.color,
}));

export const importedRoutes: MetroRoute[] = rawGraph.routes.map((r) => ({
  id: localId(r.id, "route"),
  lineId: Number(localId(r.lineId, "line")),
  ...(r.branchId ? { branchId: r.branchId } : {}),
  stops: r.stops.map((stop) => ({
    stationId: localId(stop.stationId, "station"),
    status: stop.status as MetroRoute["stops"][number]["status"],
  })),
}));

export const importedSegments: MetroSegment[] = rawGraph.segments.map((s) => ({
  id: localId(s.id, "segment"),
  lineId: Number(localId(s.lineId, "line")),
  routeId: localId(s.routeId, "route"),
  ...(s.branchId ? { branchId: s.branchId } : {}),
  from: localId(s.from, "station"),
  to: localId(s.to, "station"),
  status: s.status as SegmentStatus,
}));

export const importedSegmentStatusOverrides: Partial<Record<SegmentId, SegmentStatus>> =
  Object.fromEntries(
    importedSegments.filter((s) => s.status !== "operational")
      .map((s) => [s.id, s.status]),
  );

export const importedAliases: Record<string, StationId> =
  Object.fromEntries(
    Object.entries(rawGraph.aliases).map(([alias, id]) => [
      alias, localId(id, "station"),
    ]),
  );

export const importedTransferRules: TransferRule[] = rawGraph.transfers.map((t) => ({
  stationId: localId(t.stationId, "station"),
  fromLineId: Number(localId(t.fromLineId, "line")),
  toLineId: Number(localId(t.toLineId, "line")),
  walkSeconds: t.walkSeconds,
  ...(t.confidence ? { confidence: t.confidence as TransferRule["confidence"] } : {}),
  ...(t.fromRouteId ? { fromRouteId: localId(t.fromRouteId, "route") } : {}),
  ...(t.toRouteId ? { toRouteId: localId(t.toRouteId, "route") } : {}),
}));
