// Every publicly available, timed city uses the same station guide policy.
// Review-only stops, unboardable stops and untimed cities are not indexed.
import { STATIONS } from "./metro/stations";
import { getOperationalStationLines } from "./metro/selectors";
import type { MetroStation } from "./metro/types";
import { AMENITY_LABELS } from "./i18n";
import { CITIES, getCityMeta, type CityId } from "./cities";
import { availableCityIds } from "./city-availability";
import { CITY_STATIONS, type CityStation } from "./city-catalog";

export const SEO_STATIONS = STATIONS.filter(station =>
  station.status === "operational" && getOperationalStationLines(station.id).length > 0 &&
  station.id !== "directory",
);
const tehranStationById = new Map(SEO_STATIONS.map(station => [station.id, station]));

/** Maintains existing Tehran consumers and their bookmarkable station URLs. */
export function getSeoStation(id: string): MetroStation | undefined {
  return tehranStationById.get(id);
}
export function stationSeoPath(id: string): string {
  return cityStationSeoPath("tehran", id);
}

/** Adding a new city is data-driven: public + timing + boardable inventory. */
const availableTimedCities = new Set(
  availableCityIds().filter(cityId => CITIES.some(city =>
    city.slug === cityId && city.timing && city.release === "public")),
);

export const SEO_CITY_STATIONS: CityStation[] = CITY_STATIONS.filter(station =>
  availableTimedCities.has(station.cityId) &&
  station.status === "operational" &&
  station.operationalLineIds.length > 0 &&
  station.localId !== "directory",
);
const cityStationByKey = new Map(
  SEO_CITY_STATIONS.map(station => [`${station.cityId}:${station.localId}`, station]),
);
/** A city may use a full internal planner ID while its public URLs use a
 * short station slug. Do not change CityStation.localId: existing route
 * bookmarks and city planner queries depend on that full ID. */
export function cityStationSeoSlug(cityId: CityId, localId: string): string {
  const prefix = `${cityId}:station:`;
  return localId.startsWith(prefix) ? localId.slice(prefix.length) : localId;
}
export function getSeoCityStation(city: string, stationSlugOrId: string): CityStation | undefined {
  const exact = cityStationByKey.get(`${city}:${stationSlugOrId}`);
  if (exact) return exact;
  // Tehran already uses plain slugs; the other cities use full scoped IDs.
  return cityStationByKey.get(`${city}:${city}:station:${stationSlugOrId}`);
}
export function cityStationSeoPath(cityId: CityId, localId: string): string {
  return `/${cityId}/stations/${encodeURIComponent(cityStationSeoSlug(cityId, localId))}`;
}
export function cityStationListPath(cityId: CityId): string {
  return cityId === "tehran" ? "/stations" : `/${cityId}/stations`;
}
export function absoluteSeoUrl(path: string): string {
  return `https://metto.ir${path === "/" ? "" : path}`;
}

export const SEO_CITY = getCityMeta("tehran")!;

/** Only verified station facilities may be exposed as structured-data facts. */
function verifiedAmenitiesFor(station: CityStation): string[] {
  if (station.cityId !== "tehran") return [];
  const localStation = tehranStationById.get(station.localId);
  if (!localStation || localStation.amenitiesVerified === false) return [];
  return Object.entries(localStation.amenities)
    .filter(([, value]) => value === true)
    .map(([key]) => AMENITY_LABELS[key as keyof typeof AMENITY_LABELS]?.fa)
    .filter((name): name is string => Boolean(name));
}

export function cityStationJsonLd(station: CityStation) {
  const city = getCityMeta(station.cityId)!;
  const url = absoluteSeoUrl(cityStationSeoPath(station.cityId, station.localId));
  const amenities = verifiedAmenitiesFor(station);
  return {
    "@context": "https://schema.org",
    "@type": "SubwayStation",
    "@id": `${url}#station`,
    name: station.names.fa,
    alternateName: station.names.en,
    url,
    mainEntityOfPage: { "@id": `${url}#webpage` },
    address: {
      "@type": "PostalAddress",
      addressLocality: city.name.fa,
      addressCountry: "IR",
    },
    containedInPlace: {
      "@type": "City",
      name: city.name.fa,
      alternateName: city.name.en,
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: station.location.lat,
      longitude: station.location.lng,
    },
    ...(amenities.length ? {
      amenityFeature: amenities.map(name => ({
        "@type": "LocationFeatureSpecification", name, value: true,
      })),
    } : {}),
  };
}

/** Describes canonical station pages inside the single existing Metto site. */
export function cityStationPageJsonLd(station: CityStation) {
  const url = absoluteSeoUrl(cityStationSeoPath(station.cityId, station.localId));
  const city = getCityMeta(station.cityId)!;
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: `ایستگاه مترو ${station.names.fa} ${city.name.fa}`,
    inLanguage: "fa",
    isPartOf: { "@id": "https://metto.ir/#website" },
    mainEntity: { "@id": `${url}#station` },
  };
}

/** The same city -> city station list -> individual station trail as the UI. */
export function cityStationBreadcrumbs(station: CityStation) {
  const city = getCityMeta(station.cityId)!;
  return [
    { name: `مترو ${city.name.fa}`, href: `/${city.slug}` },
    { name: `ایستگاه‌های مترو ${city.name.fa}`, href: cityStationListPath(city.slug) },
    { name: station.names.fa, href: cityStationSeoPath(city.slug, station.localId) },
  ] as const;
}

/** Compatibility wrappers for the original Tehran schema/tests. */
function tehranCityStation(station: MetroStation): CityStation {
  const match = getSeoCityStation("tehran", station.id);
  if (!match) throw new Error(`Non-indexable Tehran station: ${station.id}`);
  return match;
}
export function stationJsonLd(station: MetroStation) {
  return cityStationJsonLd(tehranCityStation(station));
}
export function stationPageJsonLd(station: MetroStation) {
  return cityStationPageJsonLd(tehranCityStation(station));
}
export function stationBreadcrumbs(station: MetroStation) {
  return cityStationBreadcrumbs(tehranCityStation(station));
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
/** Prevent dataset text from escaping a JSON-LD script. */
export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
