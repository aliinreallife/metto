import type { Page } from "@playwright/test";
import { availableCityIds } from "../../lib/city-availability";
import { cityCounts } from "../../lib/city-catalog";

export function deploymentCityCounts() {
  const vercelPreview = new URL(process.env.BASE_URL ?? "http://127.0.0.1:3000").hostname.endsWith(".vercel.app");
  return cityCounts(availableCityIds({ ...process.env, VERCEL_ENV: process.env.VERCEL_ENV ?? (vercelPreview ? "preview" : undefined) }));
}

export async function pickCityStation(page: Page, label: string, query: string, city?: string) {
  await page.getByLabel(label, { exact: true }).click();
  await page.locator('input[role="combobox"]').fill(query);
  let options = page.getByRole("listbox").getByRole("option").filter({ hasText: query });
  if (city) options = options.filter({ hasText: city });
  await options.first().click();
}
