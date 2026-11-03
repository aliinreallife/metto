/** Visible collection credit. Detailed source provenance remains in metto-data. */
export const METTO_DATA_CREDIT = { name: "metto-data", url: "https://github.com/aliinreallife/metto-data" };
export function cityDataCredit(city?: string) {
  if (city === "tehran") return { name: "mostafa-kheibary", url: "https://github.com/mostafa-kheibary/tehran-metro-data" };
  if (city === "mashhad") return { name: "shahriaarrr", url: "https://github.com/shahriaarrr/mashhad-metro-data" };
  if (city === "tabriz") return { name: "TimeMetro · MIT", url: "https://github.com/pourjanali/TimeMetro" };
  return METTO_DATA_CREDIT;
}
