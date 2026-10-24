// Server-side city availability. Mashhad publishes only its authorized
// Lines 1/2 station/path projection; its timetable remains unavailable.
import { mashhadEnabled } from "./mashhad-access";
import { CITIES, type CityId } from "./cities";
export function availableCityIds(): CityId[] {
  return mashhadEnabled() ? ["tehran", "mashhad"] : ["tehran"];
}
export function availableCities() {
  return CITIES.filter(c => availableCityIds().includes(c.slug));
}
