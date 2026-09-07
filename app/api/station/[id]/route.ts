import { NextRequest, NextResponse } from "next/server";
import {
  getStation,
  getStationLines,
  getStationNeighbors,
  resolveStationId,
} from "@/lib/metro/selectors";
import { STATION_ALIASES } from "@/lib/metro/aliases";
import { STATION_MAP } from "@/lib/route";

function legacyIdsFor(slug: string): string[] {
  return Object.entries(STATION_ALIASES)
    .filter(([, v]) => v === slug)
    .map(([k]) => k);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const slug = resolveStationId(decodeURIComponent(id));
  const station = slug ? getStation(slug) : undefined;

  if (!station) {
    return NextResponse.json(
      {
        error: "Station not found",
        hint: "Use stable station IDs like 'tajrish', 'darvazeh-dolat', 'tehran-sadeghiyeh' (legacy English names still accepted)",
        availableStations: Array.from(STATION_MAP.keys()).slice(0, 20),
      },
      { status: 404 },
    );
  }

  const lines = getStationLines(station.id);
  return NextResponse.json({
    id: station.id,
    legacyIds: legacyIdsFor(station.id),
    name: station.name.en,
    fa: station.name.fa,
    lines,
    lat: station.location.lat,
    lng: station.location.lng,
    status: station.status,
    neighbors: getStationNeighbors(station.id),
    amenities: station.amenities,
  });
}
