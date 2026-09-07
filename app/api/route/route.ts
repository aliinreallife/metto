import { NextRequest, NextResponse } from "next/server";
import { findRoute, STATION_MAP } from "@/lib/route";
import { getStationLines, resolveStationId } from "@/lib/metro/selectors";
import { nearestStations } from "@/lib/geo";

function stationPayload(s: NonNullable<ReturnType<typeof STATION_MAP.get>>) {
  return {
    id: s.id,
    name: s.name.en,
    fa: s.name.fa,
    lines: getStationLines(s.id),
    lat: s.location.lat,
    lng: s.location.lng,
    status: s.status,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const fromLat = searchParams.get("from_lat");
  const fromLng = searchParams.get("from_lng");
  const toLat = searchParams.get("to_lat");
  const toLng = searchParams.get("to_lng");

  // Resolve origin
  let originId: string | null = null;
  if (from) {
    originId = resolveStationId(from) ?? from;
  } else if (fromLat && fromLng) {
    const lat = parseFloat(fromLat);
    const lng = parseFloat(fromLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: "Invalid from_lat/from_lng" }, { status: 400 });
    }
    const nearest = nearestStations(lat, lng, { limit: 1 });
    if (nearest.length === 0) {
      return NextResponse.json({ error: "No stations found near origin coordinates" }, { status: 404 });
    }
    originId = nearest[0].station.id;
  }

  // Resolve destination
  let destId: string | null = null;
  if (to) {
    destId = resolveStationId(to) ?? to;
  } else if (toLat && toLng) {
    const lat = parseFloat(toLat);
    const lng = parseFloat(toLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: "Invalid to_lat/to_lng" }, { status: 400 });
    }
    const nearest = nearestStations(lat, lng, { limit: 1 });
    if (nearest.length === 0) {
      return NextResponse.json({ error: "No stations found near destination coordinates" }, { status: 404 });
    }
    destId = nearest[0].station.id;
  }

  if (!originId || !destId) {
    return NextResponse.json(
      {
        error: "Missing parameters",
        usage: {
          byName: "GET /api/route?from={stationId}&to={stationId}",
          byCoords: "GET /api/route?from_lat=35.804&from_lng=51.433&to_lat=35.689&to_lng=51.389",
        },
      },
      { status: 400 },
    );
  }

  const origin = STATION_MAP.get(originId);
  const destination = STATION_MAP.get(destId);

  if (!origin || !destination) {
    return NextResponse.json(
      {
        error: "Station not found",
        hint: "Use stable station IDs like 'tajrish', 'darvazeh-dolat', 'tehran-sadeghiyeh' (legacy English names still accepted)",
        availableStations: Array.from(STATION_MAP.keys()).slice(0, 20),
      },
      { status: 404 },
    );
  }

  const result = findRoute(originId, destId);

  if (!result) {
    return NextResponse.json(
      { error: "No route found between these stations" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    origin: stationPayload(origin),
    destination: stationPayload(destination),
    route: {
      stops: result.numStops,
      transfers: result.numTransfers,
      estimatedMinutes: Math.round(result.estimatedSeconds / 60),
      estimatedArrival: result.estimatedArrival,
      path: result.path,
      hops: result.hops.map((h) => ({
        from: h.from,
        to: h.to,
        line: h.line,
        routeId: h.route,
        ...(h.branch ? { branchId: h.branch } : {}),
      })),
      segments: result.segments.map((s) => ({
        line: s.line,
        routeId: s.routeId,
        ...(s.branchId ? { branchId: s.branchId } : {}),
        stations: s.stations,
        terminal: s.terminal,
        changeFromPrevious: s.changeFromPrevious,
      })),
      numTrainChanges: result.numTrainChanges,
    },
  });
}
