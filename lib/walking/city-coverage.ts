import { CITY_STATIONS } from "../city-catalog";
import { haversineKm } from "../geo";
import type { WalkPoint } from "./route";

/**
 * The pedestrian API is shared by every Metto city, independent of whether
 * its timetable is public, in preview, or not yet published. Only allow
 * points near a known metro network, and require both endpoints to belong
 * to the same supported city. This is a provider quota / abuse boundary,
 * not a shortcut to Tehran's private station list.
 */
const MAX_DISTANCE_TO_STATION_KM = 15;

export function isSupportedWalkingPair(from: WalkPoint, to: WalkPoint): boolean {
  const citiesNearFrom = new Set(
    CITY_STATIONS.filter(station =>
      haversineKm(from.lat, from.lng, station.location.lat, station.location.lng) <= MAX_DISTANCE_TO_STATION_KM,
    ).map(station => station.cityId),
  );
  return citiesNearFrom.size > 0 && CITY_STATIONS.some(station =>
    citiesNearFrom.has(station.cityId) &&
    haversineKm(to.lat, to.lng, station.location.lat, station.location.lng) <= MAX_DISTANCE_TO_STATION_KM,
  );
}
