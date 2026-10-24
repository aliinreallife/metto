// SPDX-License-Identifier: ODbL-1.0 — see DATA_LICENSE.md.
// Display-only upstream reports. These never replace canonical null amenities
// or turn an unverified elevator into a confirmed accessibility assertion.
import upstream from "../data/previews/mashhad/upstream-stations.json";
import type { StationAmenities } from "./metro/types";

const fields = {
  wc: "wc", elevator: "elevator", atm: "atm", coffeeShop: "coffeeShop",
  fastFood: "fastFood", groceryStore: "groceryStore", freeWifi: "freeWifi",
  prayerRoom: "prayerRoom", parking: "bicycleParking", police: "metroPolice",
} as const;

export function reportedMashhadAmenities(upstreamKey: string): Partial<StationAmenities> {
  const source: Record<string, unknown> | undefined = (upstream as Record<string, Record<string, unknown>>)[upstreamKey];
  if (!source) return {};
  return Object.fromEntries(Object.entries(fields).flatMap(([key, field]) =>
    typeof source[field] === "boolean" ? [[key, source[field]]] : []));
  // The existing parking UI means bike parking; missing fields stay unknown.
}
