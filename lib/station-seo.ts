// Public SEO pages use only Tehran's reviewed, boardable station snapshot.
// Existing planner IDs and URLs are deliberately unchanged.
import { STATIONS } from "./metro/stations";
import { getOperationalStationLines } from "./metro/selectors";
import type { MetroStation } from "./metro/types";
import { AMENITY_LABELS } from "./i18n";

export const SEO_STATIONS = STATIONS.filter(
  (station) => station.status === "operational" &&
    getOperationalStationLines(station.id).length > 0 &&
    station.id !== "directory",
);
const stationById = new Map(SEO_STATIONS.map((station) => [station.id, station]));

export function getSeoStation(id: string): MetroStation | undefined {
  // Only canonical IDs are exposed; legacy routing aliases stay in the planner.
  return stationById.get(id);
}

export function stationSeoPath(id: string): string {
  return `/tehran/stations/${encodeURIComponent(id)}`;
}

export function absoluteSeoUrl(path: string): string {
  return `https://metto.ir${path === "/" ? "" : path}`;
}

export function stationJsonLd(station: MetroStation) {
  const verifiedAmenities = station.amenitiesVerified === false ? [] :
    Object.entries(station.amenities)
      .filter(([, value]) => value === true)
      .map(([key]) => AMENITY_LABELS[key as keyof typeof AMENITY_LABELS]?.fa)
      .filter((name): name is string => Boolean(name));
  return {
    "@context": "https://schema.org",
    "@type": "SubwayStation",
    "@id": `${absoluteSeoUrl(stationSeoPath(station.id))}#station`,
    name: station.name.fa,
    alternateName: station.name.en,
    url: absoluteSeoUrl(stationSeoPath(station.id)),
    geo: {
      "@type": "GeoCoordinates",
      latitude: station.location.lat,
      longitude: station.location.lng,
    },
    ...(verifiedAmenities.length ? {
      amenityFeature: verifiedAmenities.map((name) => ({
        "@type": "LocationFeatureSpecification", name, value: true,
      })),
    } : {}),
  };
}

export function breadcrumbsJsonLd(items: readonly { name: string; href: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteSeoUrl(item.href),
    })),
  };
}

/** Prevent dataset text from breaking out of a JSON-LD script. */
export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
