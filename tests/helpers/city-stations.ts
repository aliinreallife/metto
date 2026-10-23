import type { Page } from "@playwright/test";

export async function pickCityStation(page: Page, label: string, query: string, city?: string) {
  await page.getByLabel(label, { exact: true }).click();
  await page.locator('input[role="combobox"]').fill(query);
  let options = page.getByRole("listbox").getByRole("option").filter({ hasText: query });
  if (city) options = options.filter({ hasText: city });
  await options.first().click();
}
