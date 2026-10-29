// Server-side city availability. Mashhad publishes only its authorized
// Lines 1/2 station/path projection; its timetable remains unavailable.
import { mashhadEnabled } from "./mashhad-access";
import { CITIES, type CityId } from "./cities";
import { cityPreviewsEnabled } from "./city-preview-access";
export function availableCityIds(env: Record<string, string | undefined> = process.env): CityId[] {
  return CITIES.filter(city =>
    (city.slug !== "mashhad" || mashhadEnabled(env)) &&
    (city.release === "public" || cityPreviewsEnabled(env)),
  ).map(city => city.slug);
}
export function availableCities() {
  return CITIES.filter(c => availableCityIds().includes(c.slug));
}
