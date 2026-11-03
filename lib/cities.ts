import { STRINGS } from "./i18n";
export type CityId = "tehran" | "mashhad" | "isfahan" | "tabriz";
export type CityView = "route" | "map" | "stations" | "nearby";

export interface CityMeta {
  /** URL slug, e.g. "tehran". */
  slug: CityId;
  name: { en: string; fa: string };
  /** City-specific SEO keywords (EN + FA). */
  keywords: string[];
  timing: boolean;
  release: "public" | "preview";
  /** West, south, east, north: never use another city's search bounds. */
  bounds: [number, number, number, number];
  placeExample?: { en: string; fa: string };
  placeExampleQuery?: string;
}

export const CITIES: CityMeta[] = [
  {
    slug: "tehran",
    name: { en: "Tehran", fa: "تهران" },
    timing: true,
    release: "public",
    bounds: [51.15, 35.55, 51.65, 35.85],
    placeExample: { en: STRINGS.en.searchHintExample, fa: STRINGS.fa.searchHintExample },
    keywords: [
      "tehran metro map",
      "tehran subway",
      "metro tehran",
      "مترو تهران",
      "نقشه مترو تهران",
      "زمان‌بندی مترو تهران",
      "ایستگاه مترو تهران",
      "خط مترو تهران",
      "ساعت مترو تهران",
    ],
  },
  {
    slug: "mashhad", name: { en: "Mashhad", fa: "مشهد" }, timing: false,
    release: "public", bounds: [59.35, 36.10, 59.85, 36.50],
    placeExample: { en: STRINGS.en.searchHintMashhadExample, fa: STRINGS.fa.searchHintMashhadExample },
    placeExampleQuery: STRINGS.fa.searchHintMashhadExample,
    keywords: ["Mashhad metro map", "Mashhad metro stations", "مترو مشهد", "نقشه مترو مشهد", "ایستگاه‌های مترو مشهد"],
  },
  {
    slug: "isfahan", name: { en: "Isfahan", fa: "اصفهان" }, timing: true,
    release: "public", bounds: [51.50, 32.50, 51.85, 32.85],
    placeExample: { en: STRINGS.en.searchHintIsfahanExample, fa: STRINGS.fa.searchHintIsfahanExample },
    placeExampleQuery: STRINGS.fa.searchHintIsfahanExample,
    keywords: ["Isfahan metro map", "مترو اصفهان", "نقشه مترو اصفهان"],
  },
  {
    slug: "tabriz", name: { en: "Tabriz", fa: "تبریز" }, timing: true,
    release: "public", bounds: [46.17, 37.97, 46.44, 38.13],
    placeExample: { en: "El Goli Park", fa: "پارک ائل‌گلی" },
    placeExampleQuery: "ائل گلی تبریز",
    keywords: ["Tabriz metro map", "Tabriz subway times", "مترو تبریز", "نقشه مترو تبریز", "ساعت حرکت مترو تبریز", "خط یک قطار شهری تبریز"],
  },

];

export function getCityMeta(slug: string): CityMeta | null {
  return CITIES.find((c) => c.slug === slug) ?? null;
}

export function cityFromPath(path: string): CityId | "all" {
  const first = path.split("/")[1];
  return first === "cities" ? "all" : getCityMeta(first)?.slug ?? "tehran";
}

export function viewFromPath(path: string): CityView {
  if (path === "/cities") return "stations";
  const last = path.split("/").filter(Boolean).at(-1);
  return last === "map" || last === "stations" || last === "nearby" ? last : "route";
}

export function cityHref(city: CityId | "all", view: CityView, legacyTehran = false): string {
  if (city === "all") return view === "stations" ? "/cities" : `/cities/${view}`;
  return city === "tehran" && legacyTehran ? `/${view}` : `/${city}/${view}`;
}
