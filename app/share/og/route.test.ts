// /share/og handler contract: 200 PNG 1200x630 for valid share states,
// graceful redirect to the static image otherwise — never a 500.
import { describe, expect, it } from "vitest";
import { GET } from "./route";

function pngDimensions(buf: Buffer): { width: number; height: number } {
  expect(buf.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  expect(buf.toString("ascii", 12, 16)).toBe("IHDR");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe("share og image", () => {
  // Satori/resvg cold render takes seconds on first call: generous timeouts.
  it(
    "renders a 1200x630 PNG for valid share state",
    async () => {
      const res = await GET(
        new Request(
          "https://metto.ir/share/og?city=tehran&from=tajrish&to=teatr-e-shahr&timeMode=arrive&at=2026-10-09T10:05:00Z",
        ),
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("image/png");
      const buf = Buffer.from(await res.arrayBuffer());
      expect(buf.length).toBeGreaterThan(10_000);
      expect(pngDimensions(buf)).toEqual({ width: 1200, height: 630 });
    },
    30_000,
  );

  it(
    "renders without a time line in now-mode",
    async () => {
      const res = await GET(
        new Request(
          "https://metto.ir/share/og?city=tehran&from=abdol-abad&to=iran-khodro",
        ),
      );
      expect(res.status).toBe(200);
      const buf = Buffer.from(await res.arrayBuffer());
      expect(pngDimensions(buf)).toEqual({ width: 1200, height: 630 });
    },
    30_000,
  );

  it(
    "renders landmark pins with edge-cache headers",
    async () => {
      const res = await GET(
        new Request(
          "https://metto.ir/share/og?city=tehran&from=abdol-abad&to=iran-khodro&dp=35.7538,51.1926,بازار بزرگ ایران",
        ),
      );
      expect(res.status).toBe(200);
      const buf = Buffer.from(await res.arrayBuffer());
      expect(pngDimensions(buf)).toEqual({ width: 1200, height: 630 });
      // Cost control: CDN-cached per URL so scrape bursts never re-render.
      const cc = res.headers.get("cache-control") ?? "";
      expect(cc).toContain("public");
      expect(cc).toContain("s-maxage=86400");
      expect(cc).toContain("stale-while-revalidate");
    },
    30_000,
  );

  it("redirects invalid states to the static image (no 500)", async () => {
    const res = await GET(
      new Request("https://metto.ir/share/og?from=nope&to=nada"),
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/socialprev.png");
  });
});

describe("share og smoke renders", () => {
  // Representative cases (spec §13): each must produce a 1200x630 PNG.
  // Pixels are reviewed manually (ogN sets); here we pin the contract.
  const CASES: Array<[string, string]> = [
    // Short single-line route.
    ["short", "https://metto.ir/share/og?city=tehran&from=tajrish&to=shahid-hemmat"],
    // Long single-line route, explicit depart time.
    [
      "long-single",
      "https://metto.ir/share/og?city=tehran&from=tehran-sadeghiyeh&to=farhangsara&timeMode=depart&at=2026-10-09T07:30:00Z",
    ],
    // Adversarial long Persian station names (adjacent pair).
    [
      "long-names",
      "https://metto.ir/share/og?city=tehran&from=mehrabad-airport-terminal-1-2&to=mehrabad-airport-terminal-4-6",
    ],
  ];
  for (const [name, url] of CASES) {
    it(
      `renders ${name}`,
      async () => {
        const res = await GET(new Request(url));
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toContain("image/png");
        const buf = Buffer.from(await res.arrayBuffer());
        expect(buf.length).toBeGreaterThan(10_000);
        expect(pngDimensions(buf)).toEqual({ width: 1200, height: 630 });
      },
      30_000,
    );
  }
});
