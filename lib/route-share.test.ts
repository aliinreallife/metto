// Share-preview builder contract (locked architecture, v1: FA-only Level 1).
//
// Covers: city default/emission, UTC->Tehran display, now/depart/arrive
// titles, pin-label priority (never coords), invalid->generic fallback,
// serializer round-trips, and Copy-Link normalization.
import { describe, expect, it } from "vitest";
import {
  buildCopyShareUrl,
  buildSharePresentation,
  isPreviewableState,
  parseShareParams,
  searchRecordToParams,
  serializeShareParams,
  SHARE_STATIC_IMAGE,
} from "./route-share";
import { tehranMinuteToInstant } from "./tehran-time";

const FROM = "tajrish";
const TO = "teatr-e-shahr";
// 2026-10-09T10:05:00Z == 13:35 Tehran (fixed +3:30).
const AT = "2026-10-09T10:05:00Z";
const AT_MS = Date.parse(AT);
// Tehran noon on the same calendar date (deterministic "today").
const NOON_SAME_DAY = tehranMinuteToInstant("2026-10-09", 12 * 60);

function sp(qs: string): URLSearchParams {
  return new URLSearchParams(qs);
}

describe("parseShareParams", () => {
  it("defaults omitted city to tehran", () => {
    const s = parseShareParams(sp(`from=${FROM}&to=${TO}`));
    expect(s.city).toBe("tehran");
    expect(s.cityKnown).toBe(true);
  });

  it("resolves legacy English-name aliases to canonical slugs", () => {
    const s = parseShareParams(
      sp("from=Tajrish&to=Teatr-e%20Shahr&city=tehran"),
    );
    expect(s.from).toBe("tajrish");
    expect(s.to).toBe("teatr-e-shahr");
  });

  it("marks unknown cities and stations", () => {
    expect(
      parseShareParams(sp("city=atlantis&from=a&to=b")).cityKnown,
    ).toBe(false);
    const s = parseShareParams(sp("from=nope&to=nada"));
    expect(s.from).toBeNull();
    expect(s.to).toBeNull();
    expect(isPreviewableState(s)).toBe(false);
  });

  it("rejects naive (timezone-less) at into now-mode", () => {
    const s = parseShareParams(
      sp(`from=${FROM}&to=${TO}&timeMode=arrive&at=2026-10-09T13:35:00`),
    );
    expect(s.timeMode).toBe("now");
    expect(s.atMs).toBeNull();
  });

  it("reads compact op/dp pins and legacy oPlat pins", () => {
    const pin = parseShareParams(
      sp(`from=${FROM}&to=${TO}&dp=35.7538,51.1926,بازار بزرگ ایران`),
    ).destPin;
    expect(pin?.label).toBe("بازار بزرگ ایران");
    const legacy = parseShareParams(
      sp(`from=${FROM}&to=${TO}&dPlat=35.7&dPlng=51.1&dPlabel=Foo`),
    ).destPin;
    expect(legacy?.label).toBe("Foo");
  });
});

describe("buildSharePresentation titles (FA v1)", () => {
  it("arrive-by today: stations + رسیدن تا + Persian digits", () => {
    const p = buildSharePresentation(
      sp(`city=tehran&from=${FROM}&to=${TO}&timeMode=arrive&at=${encodeURIComponent(AT)}`),
      NOON_SAME_DAY,
    );
    expect(p.valid).toBe(true);
    expect(p.title).toBe("تجریش ← تئاتر شهر · رسیدن تا ۱۳:۳۵");
  });

  it("depart today uses حرکت در", () => {
    const p = buildSharePresentation(
      sp(`city=tehran&from=${FROM}&to=${TO}&timeMode=depart&at=${encodeURIComponent(AT)}`),
      NOON_SAME_DAY,
    );
    expect(p.title).toBe("تجریش ← تئاتر شهر · حرکت در ۱۳:۳۵");
  });

  it("now-mode carries no time phrase", () => {
    const p = buildSharePresentation(
      sp(`city=tehran&from=${FROM}&to=${TO}`),
      NOON_SAME_DAY,
    );
    expect(p.title).toBe("تجریش ← تئاتر شهر");
  });

  it("tomorrow prefixes فردا", () => {
    const tomorrowNine = tehranMinuteToInstant("2026-10-10", 9 * 60);
    const p = buildSharePresentation(
      sp(
        `city=tehran&from=${FROM}&to=${TO}&timeMode=depart&at=${encodeURIComponent(new Date(tomorrowNine).toISOString())}`,
      ),
      NOON_SAME_DAY,
    );
    expect(p.title).toBe("تجریش ← تئاتر شهر · حرکت در فردا، ۰۹:۰۰");
  });

  it("prefers dp label over station name, never coords", () => {
    const p = buildSharePresentation(
      sp(
        `city=tehran&from=abdol-abad&to=iran-khodro&dp=35.7538,51.1926,بازار بزرگ ایران&timeMode=arrive&at=${encodeURIComponent(AT)}`,
      ),
      NOON_SAME_DAY,
    );
    expect(p.valid).toBe(true);
    expect(p.destDisplay).toBe("بازار بزرگ ایران");
    expect(p.title).toContain("بازار بزرگ ایران");
    expect(p.title).not.toContain("ایران خودرو");
    expect(p.title).not.toMatch(/35\.7538|51\.1926/);
    expect(p.description).not.toMatch(/35\.7538|51\.1926/);
  });

  it("same origin/destination is not previewable", () => {
    const p = buildSharePresentation(
      sp(`city=tehran&from=${FROM}&to=${FROM}`),
      NOON_SAME_DAY,
    );
    expect(p.valid).toBe(false);
  });

  it("invalid state falls back to generic copy + static image", () => {
    const p = buildSharePresentation(sp("from=nope&to=nada"), NOON_SAME_DAY);
    expect(p.valid).toBe(false);
    expect(p.imagePath).toBe(SHARE_STATIC_IMAGE);
    expect(p.title.length).toBeGreaterThan(0);
    expect(p.description.length).toBeGreaterThan(0);
  });

  it("valid state points at the dynamic OG endpoint, locale fa_IR", () => {
    const p = buildSharePresentation(
      sp(`city=tehran&from=${FROM}&to=${TO}`),
      NOON_SAME_DAY,
    );
    expect(p.imagePath.startsWith("/share/og?")).toBe(true);
    expect(p.imagePath).toContain("city=tehran");
    expect(p.locale).toBe("fa_IR");
    expect(p.canonical).toBe("https://metto.ir/route");
  });

  it("truncates very long pin labels with ellipsis", () => {
    const long = "بازار".padEnd(100, "ب");
    const p = buildSharePresentation(
      sp(`city=tehran&from=${FROM}&to=${TO}&dp=35.7,51.1,${encodeURIComponent(long)}`),
      NOON_SAME_DAY,
    );
    expect(p.destDisplay.endsWith("…")).toBe(true);
    expect(p.destDisplay.length).toBeLessThanOrEqual(49);
  });

  it("description states the selection with a CTA, no computed claims", () => {
    const p = buildSharePresentation(
      sp(`city=tehran&from=${FROM}&to=${TO}&timeMode=arrive&at=${encodeURIComponent(AT)}`),
      NOON_SAME_DAY,
    );
    expect(p.description).toContain("تجریش");
    expect(p.description).toContain("تئاتر شهر");
    expect(p.description).not.toMatch(/بهترین|دقیقه|قطار بعدی/);
  });
});

describe("serializeShareParams", () => {
  it("always emits city (multi-city-safe from day one)", () => {
    const s = parseShareParams(sp(`from=${FROM}&to=${TO}`));
    expect(serializeShareParams(s)).toContain("city=tehran");
  });

  it("round-trips full state incl. pins and UTC instant", () => {
    const qs = `city=tehran&from=abdol-abad&to=iran-khodro&dp=35.7538,51.1926,${encodeURIComponent("بازار بزرگ ایران")}&timeMode=arrive&at=${encodeURIComponent(AT)}`;
    const once = parseShareParams(sp(qs));
    const twice = parseShareParams(new URLSearchParams(serializeShareParams(once).split("?")[1]));
    expect(twice).toEqual(once);
    expect(twice.atMs).toBe(AT_MS);
  });

  it("omits time params in now-mode", () => {
    const out = serializeShareParams(parseShareParams(sp(`from=${FROM}&to=${TO}`)));
    expect(out).not.toContain("timeMode");
    expect(out).not.toContain("at=");
  });
});

describe("buildCopyShareUrl", () => {
  it("normalizes route-bearing planner URLs to absolute /share URLs", () => {
    const out = buildCopyShareUrl(`https://metto.ir/route?from=${FROM}&to=${TO}&timeMode=arrive&at=${encodeURIComponent(AT)}`);
    expect(out.startsWith("https://metto.ir/share?")).toBe(true);
    expect(out).toContain("city=tehran");
    expect(out).toContain(`from=${FROM}`);
  });

  it("leaves routeless URLs untouched", () => {
    const href = "https://metto.ir/route";
    expect(buildCopyShareUrl(href)).toBe(href);
  });
});

describe("searchRecordToParams", () => {
  it("converts Next searchParams records (incl. arrays)", () => {
    const spOut = searchRecordToParams({
      from: "tajrish",
      to: ["teatr-e-shahr", "x"],
      empty: undefined,
    });
    expect(spOut.get("from")).toBe("tajrish");
    expect(spOut.get("to")).toBe("teatr-e-shahr");
    expect(spOut.get("empty")).toBeNull();
  });
});
