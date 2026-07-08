import { NextRequest, NextResponse } from "next/server";
import { STATION_MAP } from "@/lib/route";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const station = STATION_MAP.get(id);

  if (!station) {
    return NextResponse.json(
      {
        error: "Station not found",
        hint: "Use English station IDs like 'Tajrish', 'Darvazeh Sharq', 'Vali-Asr'",
        availableStations: Array.from(STATION_MAP.keys()).slice(0, 20),
      },
      { status: 404 },
    );
  }

  return NextResponse.json({
    id: station.id,
    name: station.name,
    fa: station.fa,
    lines: station.lines,
    lat: station.lat,
    lng: station.lng,
    relations: station.relations,
    amenities: station.amenities,
  });
}
