import type { Page } from "@playwright/test";

/** Keep the real service worker enabled; its forwarded requests bypass
 * Playwright's page/context routing after it takes control. */
export async function mockWalkingApi(page: Page, response: (url: string) => {
  status?: number; body: unknown;
}) {
  await page.exposeFunction("mettoWalkingFixture", response);
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof Request ? input.url : input.href, location.href);
      if (url.origin === location.origin && url.pathname === "/api/walking") {
        const fixture = window as typeof window & {
          mettoWalkingFixture: (url: string) => Promise<{ status?: number; body: unknown }>;
        };
        const result = await fixture.mettoWalkingFixture(url.href);
        return Response.json(result.body, { status: result.status ?? 200 });
      }
      return nativeFetch(input, init);
    };
  });
}

export async function unavailableWalkingApi(page: Page) {
  await mockWalkingApi(page, () => ({ status: 503, body: { error: "Unavailable" } }));
}
