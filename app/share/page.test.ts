// /share generateMetadata contract: dynamic Level-1 FA tags when valid,
// generic static-image fallback when not — always noindex, canonicalized to
// the planner root, never in the sitemap (absence, not code).
import { describe, expect, it } from "vitest";
import { generateMetadata } from "./page";

const AT = encodeURIComponent("2026-10-09T10:05:00Z");

describe("share generateMetadata", () => {
  it("emits dynamic route tags for valid share state", async () => {
    const meta = await generateMetadata({
      searchParams: Promise.resolve({
        city: "tehran",
        from: "tajrish",
        to: "teatr-e-shahr",
        timeMode: "arrive",
        at: "2026-10-09T10:05:00Z",
      }),
    });
    expect(meta.title).toContain("تجریش");
    expect(meta.robots).toMatchObject({ index: false, follow: true });
    expect(meta.alternates).toMatchObject({
      canonical: "https://metto.ir/route",
    });
    const og = meta.openGraph as Record<string, unknown>;
    expect(og["url"]).toContain("/share?city=tehran");
    expect(og["locale"]).toBe("fa_IR");
    const images = og["images"] as Array<Record<string, unknown>>;
    expect(images).toHaveLength(1);
    expect(String(images[0]["url"])).toContain("/share/og?");
    expect(images[0]).toMatchObject({ width: 1200, height: 630 });
    expect(meta.twitter).toMatchObject({ card: "summary_large_image" });
  });

  it("falls back to generic copy + static image for invalid state", async () => {
    const meta = await generateMetadata({
      searchParams: Promise.resolve({ from: "nope", to: "nada" }),
    });
    // Invalid states must NOT point at the dynamic image endpoint.
    const og = meta.openGraph as Record<string, unknown>;
    const images = og["images"] as Array<Record<string, unknown>>;
    expect(String(images[0]["url"])).toBe("/socialprev.png");
    expect(meta.robots).toMatchObject({ index: false, follow: true });
    expect(meta.alternates).toMatchObject({
      canonical: "https://metto.ir/route",
    });
  });

  it(`uses the exact UTC instant from the URL (arrive ${AT})`, async () => {
    const meta = await generateMetadata({
      searchParams: Promise.resolve({
        city: "tehran",
        from: "tajrish",
        to: "teatr-e-shahr",
        timeMode: "arrive",
        at: "2026-10-09T10:05:00Z",
      }),
    });
    // The anchor is always the URL instant rendered Tehran-local,
    // regardless of server "now" (Level 1 echoes the selection as-is).
    expect(meta.title).toContain("۱۳:۳۵");
  });
});
