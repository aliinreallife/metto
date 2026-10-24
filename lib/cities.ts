export type CityId = "tehran" | "mashhad";
export type CityView = "route" | "map" | "stations" | "nearby";

export interface CityMeta {
  /** URL slug, e.g. "tehran". */
  slug: CityId;
  name: { en: string; fa: string };
  /** City-specific SEO keywords (EN + FA). */
  keywords: string[];
  timing: boolean;
}

export const CITIES: CityMeta[] = [
  {
    slug: "tehran",
    name: { en: "Tehran", fa: "تهران" },
    timing: true,
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
    keywords: ["Mashhad metro map", "Mashhad metro stations", "مترو مشهد", "نقشه مترو مشهد", "ایستگاه‌های مترو مشهد"],
  },
];

export function getCityMeta(slug: string): CityMeta | null {
  return CITIES.find((c) => c.slug === slug) ?? null;
}

export function cityFromPath(path: string): CityId | "all" {
  const first = path.split("/")[1];
  return first === "mashhad" ? "mashhad" : first === "cities" ? "all" : "tehran";
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
