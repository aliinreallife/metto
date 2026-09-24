// City registry stub for multi-city expansion.
//
// Currently only Tehran has data; all routes still serve Tehran. When a new
// city dataset lands, add an entry here and wire per-city routes
// (`app/[city]/...`) that call getCityMetadata() for title, description,
// keywords, canonical URL, Open Graph tags, and JSON-LD — so each city page
// ranks for its own `X metro map / مترو X` queries while the root layout
// stays generic (`Iran metro map / نقشه مترو`).

export interface CityMeta {
  /** URL slug, e.g. "tehran". */
  slug: string;
  name: { en: string; fa: string };
  /** City-specific SEO keywords (EN + FA). */
  keywords: string[];
}

export const CITIES: CityMeta[] = [
  {
    slug: "tehran",
    name: { en: "Tehran", fa: "تهران" },
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
  // TODO(multi-city): add tabriz, mashhad, shiraz, isfahan, karaj, ... here
  // as datasets land.
];

export function getCityMeta(slug: string): CityMeta | null {
  return CITIES.find((c) => c.slug === slug) ?? null;
}
