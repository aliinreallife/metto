import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyGeoError,
  getCurrentPositionTolerant,
  isPermissionDenied,
} from "./geolocation";

function stubGeolocation(
  impl: (
    ok: (pos: { coords: { latitude: number; longitude: number } }) => void,
    fail: (err: { code: number }) => void,
    opts?: PositionOptions,
  ) => void,
) {
  vi.stubGlobal("navigator", { geolocation: { getCurrentPosition: impl } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("classifyGeoError", () => {
  it("maps code 1 to denied", () => {
    expect(classifyGeoError({ code: 1 })).toBe("denied");
    expect(isPermissionDenied({ code: 1 })).toBe(true);
  });

  it("maps code 2 to unavailable (never denied)", () => {
    // Permission granted + device Location master switch OFF surfaces as
    // POSITION_UNAVAILABLE — it must not be misreported as permission denied.
    expect(classifyGeoError({ code: 2 })).toBe("unavailable");
    expect(isPermissionDenied({ code: 2 })).toBe(false);
  });

  it("maps code 3 to timeout", () => {
    expect(classifyGeoError({ code: 3 })).toBe("timeout");
    expect(isPermissionDenied({ code: 3 })).toBe(false);
  });

  it("maps the unsupported sentinel to unsupported", () => {
    expect(classifyGeoError(new Error("geolocation-unsupported"))).toBe(
      "unsupported",
    );
  });

  it("maps unknown shapes to unavailable (safe generic guidance)", () => {
    expect(classifyGeoError(null)).toBe("unavailable");
    expect(classifyGeoError(new Error("boom"))).toBe("unavailable");
  });
});

describe("getCurrentPositionTolerant", () => {
  it("resolves a high-accuracy fix directly", async () => {
    const seen: (PositionOptions | undefined)[] = [];
    stubGeolocation((ok, _fail, opts) => {
      seen.push(opts);
      ok({ coords: { latitude: 35.7, longitude: 51.38 } });
    });
    await expect(getCurrentPositionTolerant()).resolves.toEqual({
      lat: 35.7,
      lng: 51.38,
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.enableHighAccuracy).toBe(true);
  });

  it("retries once with low accuracy after a high-accuracy timeout", async () => {
    const seen: (PositionOptions | undefined)[] = [];
    let calls = 0;
    stubGeolocation((ok, fail, opts) => {
      calls += 1;
      seen.push(opts);
      if (calls === 1) fail({ code: 3 });
      else ok({ coords: { latitude: 35.7, longitude: 51.38 } });
    });
    await expect(getCurrentPositionTolerant()).resolves.toEqual({
      lat: 35.7,
      lng: 51.38,
    });
    expect(calls).toBe(2);
    expect(seen[1]?.enableHighAccuracy).toBe(false);
  });

  it("does not retry denied/unavailable (re-prompting would be wrong)", async () => {
    for (const code of [1, 2]) {
      let calls = 0;
      stubGeolocation((_ok, fail) => {
        calls += 1;
        fail({ code });
      });
      await expect(getCurrentPositionTolerant()).rejects.toMatchObject({
        code,
      });
      expect(calls).toBe(1);
    }
  });

  it("rejects with geolocation-unsupported when the API is missing", async () => {
    vi.stubGlobal("navigator", {});
    await expect(getCurrentPositionTolerant()).rejects.toThrow(
      "geolocation-unsupported",
    );
  });
});
