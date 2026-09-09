import { describe, expect, it } from "vitest";
import { persianDigits } from "./lib/i18n";

describe("persianDigits locale behavior", () => {
  it('converts Latin digits to Persian in fa UI ("15:11" -> "۱۵:۱۱")', () => {
    expect(persianDigits("15:11", "fa")).toBe("۱۵:۱۱");
  });

  it('keeps Latin digits in en UI ("15:11" stays "15:11")', () => {
    expect(persianDigits("15:11", "en")).toBe("15:11");
  });
});
