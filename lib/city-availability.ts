// Server-side deployment policy. Candidate data is visible on previews, while
// production keeps the independently approved Tehran network.
import { mashhadPreviewEnabled } from "./mashhad-preview-access";
import { CITIES, type CityId } from "./cities";
export function availableCityIds(): CityId[] {
  return mashhadPreviewEnabled() ? ["tehran", "mashhad"] : ["tehran"];
}
export function availableCities() {
  return CITIES.filter(c => availableCityIds().includes(c.slug));
}
