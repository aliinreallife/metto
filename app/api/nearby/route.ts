import { NextRequest, NextResponse } from "next/server";
import { nearestStations, type AmenityKey } from "@/lib/geo";
import { getStationLines } from "@/lib/metro/selectors";

const VALID_AMENITIES: AmenityKey[] = ["wc", "elevator", "atm", "coffeeShop", "fastFood", "groceryStore", "freeWifi", "prayerRoom", "parking", "police"];

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const latStr = searchParams.get("lat");
  const lngStr = searchParams.get("lng");
  const limitStr = searchParams.get("limit");
  const amenitiesStr = searchParams.get("amenities");

  if (!latStr || !lngStr) {
    return NextResponse.json(
      {
        error: "Missing 'lat' and/or 'lng' query parameters",
        usage: "GET /api/nearby?lat=35.804&lng=51.433&limit=5&amenities=wc,elevator",
        validAmenities: VALID_AMENITIES,
      },
      { status: 400 },
    );
  }

  const lat = parseFloat(latStr);
  const lng = parseFloat(lngStr);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "Invalid lat/lng values" }, { status: 400 });
  }

  const limit = limitStr ? Math.min(parseInt(limitStr, 10) || 5, 20) : 5;

  let amenities: AmenityKey[] = [];
  if (amenitiesStr) {
    amenities = amenitiesStr.split(",").map((a) => a.trim()) as AmenityKey[];
    const invalid = amenities.filter((a) => !VALID_AMENITIES.includes(a));
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `Invalid amenities: ${invalid.join(", ")}`, validAmenities: VALID_AMENITIES },
        { status: 400 },
      );
    }
  }

  const results = nearestStations(lat, lng, { amenities, limit });

  return NextResponse.json({
    query: { lat, lng, limit, amenities },
    count: results.length,
    stations: results.map(({ station, km }) => ({
      id: station.id,
      name: station.name.en,
      fa: station.name.fa,
      lines: getStationLines(station.id),
      lat: station.location.lat,
      lng: station.location.lng,
      status: station.status,
      distanceKm: Math.round(km * 100) / 100,
    })),
  });
}
