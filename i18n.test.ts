import { describe, expect, it } from "vitest";
import { persianDigits, STRINGS } from "./lib/i18n";

describe("persianDigits locale behavior", () => {
  it('converts Latin digits to Persian in fa UI ("15:11" -> "۱۵:۱۱")', () => {
    expect(persianDigits("15:11", "fa")).toBe("۱۵:۱۱");
  });

  it('keeps Latin digits in en UI ("15:11" stays "15:11")', () => {
    expect(persianDigits("15:11", "en")).toBe("15:11");
  });
});

describe("location error copy (EN/FA)", () => {
  it("keeps denied / unavailable / timeout messages separate in both languages", () => {
    for (const lang of ["en", "fa"] as const) {
      const s = STRINGS[lang];
      expect(s.gpsDenied.length).toBeGreaterThan(0);
      expect(s.gpsUnavailable.length).toBeGreaterThan(0);
      expect(s.gpsTimeout.length).toBeGreaterThan(0);
      expect(
        new Set([s.gpsDenied, s.gpsUnavailable, s.gpsTimeout]).size,
      ).toBe(3);
      expect(s.turnOnLocation.length).toBeGreaterThan(0);
      expect(s.retry.length).toBeGreaterThan(0);
    }
  });

  it("guides toward the device Location switch without claiming certainty", () => {
    // Web APIs cannot prove GPS is off (POSITION_UNAVAILABLE also means
    // "no fix"), so the copy says "make sure ... turned on", never
    // "Location is off".
    expect(STRINGS.en.gpsUnavailable).toMatch(/Location is turned on/i);
    expect(STRINGS.en.gpsUnavailable).not.toMatch(/is off|is disabled/);
    expect(STRINGS.fa.gpsUnavailable).toContain("روشن");
    expect(STRINGS.en.turnOnLocation).toBe("Turn on location");
    expect(STRINGS.fa.turnOnLocation).toBe("روشن کردن موقعیت");
    expect(STRINGS.en.retry).toBe("Retry");
    expect(STRINGS.fa.retry).toBe("تلاش مجدد");
  });
});

describe("map offline/save notice copy", () => {
  it("exists in both languages with the exact approved wording", () => {
    expect(STRINGS.fa.mapOfflineTitle).toBe("بدون اینترنت");
    expect(STRINGS.en.mapOfflineTitle).toBe("You're offline");
    expect(STRINGS.fa.mapOfflineBody).toContain("قبلاً دیده‌اید");
    expect(STRINGS.en.mapOfflineBody).toContain("viewed before");
    expect(STRINGS.fa.mapSaveTitle).toBe("ذخیره برای استفاده آفلاین");
    expect(STRINGS.en.mapSaveTitle).toBe("Saved for offline use");
    expect(STRINGS.fa.mapSaveBody).not.toMatch(/کش|tile/i);
    expect(STRINGS.en.mapSaveBody).not.toMatch(/cache|tile|service worker/i);
  });
});
