import { describe, expect, it } from "vitest";
import nextConfig from "./next.config.mjs";
import sitemap from "./app/sitemap";

// Locks the landing/app URL scheme in CI: landing at /, planner at /route,
// old URLs redirecting, sitemap matching. Mirrors the e2e coverage in
// tests/landing.spec.ts without needing a browser.
describe("landing/app URL scheme", () => {
  it("redirects old landing and share-link URLs, keeps plain / rendering", async () => {
    const rules = (await nextConfig.redirects?.()) ?? [];
    // Old landing URL consolidates onto the new root landing.
    expect(rules).toContainEqual(
      expect.objectContaining({
        source: "/welcome",
        destination: "/",
        permanent: true,
      }),
    );
    // Old share links (metto.ir/?from=…&to=…) land on the planner.
    for (const key of ["from", "to"]) {
      const rule = rules.find(
        (r) =>
          r.source === "/" &&
          (r.has ?? []).some(
            (h) => h.type === "query" && "key" in h && h.key === key,
          ),
      );
      expect(rule?.destination, `redirect for ?${key}`).toBe("/route");
      expect(rule?.permanent, `permanent redirect for ?${key}`).toBe(true);
    }
    // No unconditional rule may shadow the landing itself.
    for (const r of rules.filter((r) => r.source === "/")) {
      expect(
        (r.has ?? []).length,
        "every / rule must be query-guarded",
      ).toBeGreaterThan(0);
    }
  });

  it("sitemap lists the new scheme and no /welcome", () => {
    const urls = sitemap().map((e) => e.url);
    for (const u of [
      "https://metto.ir",
      "https://metto.ir/route",
      "https://metto.ir/stations",
      "https://metto.ir/map",
      "https://metto.ir/nearby",
    ]) {
      expect(urls, `sitemap contains ${u}`).toContain(u);
    }
    expect(
      urls.some((u) => u.includes("/welcome")),
      "sitemap has no /welcome",
    ).toBe(false);
  });
});
