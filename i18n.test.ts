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
