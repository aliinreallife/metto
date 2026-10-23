import { afterEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { GET } from "./route";
import { mashhadPreviewEnabled } from "@/lib/mashhad-preview-access";

afterEach(() => vi.unstubAllEnvs());
const request = (query = "from=mashhad:station:airport&to=mashhad:station:tabarsi") =>
  new Request(`http://localhost/api/cities/mashhad/route?${query}`);

describe("private Mashhad path review boundary", () => {
  it("verifies the pinned preview artifacts offline", () => {
    expect(() => execFileSync(process.execPath, ["scripts/check-city-preview.mjs"], { stdio: "pipe" })).not.toThrow();
  });
  it("is disabled by default and always disabled on production Vercel deployments", async () => {
    expect(mashhadPreviewEnabled({})).toBe(false);
    expect(mashhadPreviewEnabled({ METTO_MASHHAD_PREVIEW: "true" })).toBe(false);
    expect(mashhadPreviewEnabled({ METTO_MASHHAD_PREVIEW: "1", VERCEL_ENV: "production" })).toBe(false);
    vi.stubEnv("METTO_MASHHAD_PREVIEW", "0");
    expect((await GET(request())).status).toBe(404);
  });
  it("is visible automatically on Vercel previews, with an explicit opt-out", () => {
    expect(mashhadPreviewEnabled({ VERCEL_ENV: "preview" })).toBe(true);
    expect(mashhadPreviewEnabled({ NODE_ENV: "development" })).toBe(true);
    expect(mashhadPreviewEnabled({ VERCEL_ENV: "preview", METTO_MASHHAD_PREVIEW: "0" })).toBe(false);
    expect(mashhadPreviewEnabled({ VERCEL_ENV: "production", METTO_MASHHAD_PREVIEW: "1" })).toBe(false);
  });
  it("returns paths without times and prevents caching/indexing the private response", async () => {
    vi.stubEnv("METTO_MASHHAD_PREVIEW", "1"); vi.stubEnv("VERCEL_ENV", "preview");
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    const data = await response.json();
    expect(data.cityId).toBe("mashhad"); expect(data.reviewOnly).toBe(true);
    expect(data.timing).toBe("unavailable");
    expect(Object.keys(data.route).sort()).toEqual(["cityId", "legs", "stationIds", "stops", "transfers"]);
  });
  it.each([
    "from=tajrish&to=mashhad:station:airport",
    "from=mashhad:station:bab-al-javad&to=mashhad:station:airport",
    "from=mashhad:station:airport&to=mashhad:station:airport",
    "from=mashhad:station:airport&to=mashhad:station:tabarsi&timeMode=arrive",
  ])("rejects invalid scope or timing parameters: %s", async query => {
    vi.stubEnv("METTO_MASHHAD_PREVIEW", "1"); vi.stubEnv("VERCEL_ENV", "preview");
    expect((await GET(request(query))).status).toBe(400);
  });
});
