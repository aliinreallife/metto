import { describe, expect, it } from "vitest";
import { buildSharePresentation } from "./route-share";
import { tehranMinuteToInstant } from "./tehran-time";

const FROM = "tajrish";
const TO = "teatr-e-shahr";
const NOW = tehranMinuteToInstant("2026-10-09", 12 * 60);
const AT1 = "2026-10-09T10:05:00Z";
const AT2 = "2026-10-10T05:30:00Z";
const PIN_QS = `dp=35.7538,51.1926,${encodeURIComponent("بازار بزرگ ایران")}`;

function presentation(qs: string) {
  return buildSharePresentation(new URLSearchParams(qs), NOW);
}

describe("share OG cache identity", () => {
  it("reuses one image URL across now/depart/arrive variants of the same route", () => {
    const now = presentation(`city=tehran&from=${FROM}&to=${TO}`);
    const depart = presentation(
      `city=tehran&from=${FROM}&to=${TO}&timeMode=depart&at=${encodeURIComponent(AT1)}`,
    );
    const arrive = presentation(
      `city=tehran&from=${FROM}&to=${TO}&timeMode=arrive&at=${encodeURIComponent(AT2)}`,
    );

    expect(now.valid).toBe(true);
    expect(depart.valid).toBe(true);
    expect(arrive.valid).toBe(true);

    expect(depart.imagePath).toBe(now.imagePath);
    expect(arrive.imagePath).toBe(now.imagePath);
    expect(now.imagePath).not.toContain("timeMode");
    expect(now.imagePath).not.toContain("at=");

    // Journey semantics stay intact in the link/metadata even though the
    // teaser image is time-independent.
    expect(depart.sharePath).toContain("timeMode=depart");
    expect(depart.sharePath).toContain("at=");
    expect(arrive.sharePath).toContain("timeMode=arrive");
    expect(depart.title).toContain("حرکت در");
    expect(arrive.title).toContain("رسیدن تا");
  });

  it("keeps timed sharePaths distinct while sharing one imagePath (same pins)", () => {
    const base = `city=tehran&from=${FROM}&to=${TO}&${PIN_QS}`;
    const now = presentation(base);
    const depart = presentation(
      `${base}&timeMode=depart&at=${encodeURIComponent(AT1)}`,
    );
    const arrive = presentation(
      `${base}&timeMode=arrive&at=${encodeURIComponent(AT2)}`,
    );

    expect(now.valid).toBe(true);
    expect(depart.valid).toBe(true);
    expect(arrive.valid).toBe(true);

    // Same pixels → same OG image.
    expect(depart.imagePath).toBe(now.imagePath);
    expect(arrive.imagePath).toBe(now.imagePath);

    // Same journey state is NOT collapsed: links stay distinct and keep time.
    expect(depart.sharePath).not.toBe(now.sharePath);
    expect(arrive.sharePath).not.toBe(now.sharePath);
    expect(depart.sharePath).not.toBe(arrive.sharePath);
    expect(now.sharePath).not.toContain("timeMode");
    expect(now.sharePath).not.toContain("at=");
    expect(depart.sharePath).toContain("timeMode=depart");
    expect(depart.sharePath).toContain("at=");
    expect(arrive.sharePath).toContain("timeMode=arrive");
    expect(arrive.sharePath).toContain("at=");
  });

  it("keeps pins in the image cache key because they change pixels", () => {
    const plain = presentation(`city=tehran&from=${FROM}&to=${TO}`);
    const pinned = presentation(`city=tehran&from=${FROM}&to=${TO}&${PIN_QS}`);
    const pinnedElsewhere = presentation(
      `city=tehran&from=${FROM}&to=${TO}&dp=35.7438,51.1826,${encodeURIComponent("بازار بزرگ ایران")}`,
    );

    expect(pinned.imagePath).not.toBe(plain.imagePath);
    expect(pinnedElsewhere.imagePath).not.toBe(pinned.imagePath);
    expect(pinned.imagePath).toContain("dp=");
  });

  it("treats different pin labels as different images (labels are rendered)", () => {
    const a = presentation(
      `city=tehran&from=${FROM}&to=${TO}&dp=35.7538,51.1926,${encodeURIComponent("بازار بزرگ ایران")}`,
    );
    const b = presentation(
      `city=tehran&from=${FROM}&to=${TO}&dp=35.7538,51.1926,${encodeURIComponent("پارک لاله")}`,
    );
    expect(a.valid).toBe(true);
    expect(b.valid).toBe(true);
    expect(a.imagePath).not.toBe(b.imagePath);
  });

  it("keeps a pinned route on one image URL across selected times", () => {
    const base = `city=tehran&from=${FROM}&to=${TO}&${PIN_QS}`;
    const a = presentation(`${base}&timeMode=depart&at=${encodeURIComponent(AT1)}`);
    const b = presentation(`${base}&timeMode=arrive&at=${encodeURIComponent(AT2)}`);
    expect(a.imagePath).toBe(b.imagePath);
  });

  it("keeps different routes on different image URLs", () => {
    const a = presentation(`city=tehran&from=${FROM}&to=${TO}`);
    const b = presentation(`city=tehran&from=${FROM}&to=shahid-hemmat`);
    const c = presentation(`city=tehran&from=abdol-abad&to=${TO}`);
    expect(a.valid).toBe(true);
    expect(b.valid).toBe(true);
    expect(c.valid).toBe(true);
    expect(a.imagePath).not.toBe(b.imagePath);
    expect(a.imagePath).not.toBe(c.imagePath);
    expect(b.imagePath).not.toBe(c.imagePath);
  });

  it("normalizes legacy station aliases to the same image URL", () => {
    const canonical = presentation(`city=tehran&from=${FROM}&to=${TO}`);
    const aliased = presentation(
      `city=tehran&from=Tajrish&to=${encodeURIComponent("Teatr-e Shahr")}`,
    );
    expect(canonical.valid).toBe(true);
    expect(aliased.valid).toBe(true);
    expect(aliased.imagePath).toBe(canonical.imagePath);
  });

  it("ignores irrelevant query params in the canonical image URL", () => {
    const plain = presentation(`city=tehran&from=${FROM}&to=${TO}`);
    const noisy = presentation(
      `city=tehran&from=${FROM}&to=${TO}&lang=en&utm_source=telegram&foo=bar&timeMode=depart&at=${encodeURIComponent(AT1)}`,
    );
    expect(plain.valid).toBe(true);
    expect(noisy.valid).toBe(true);
    // timeMode/at excluded (pixels don't render time); lang/utm/foo never
    // read by the parser — all collapse to the canonical image URL.
    expect(noisy.imagePath).toBe(plain.imagePath);
    expect(noisy.imagePath).not.toContain("lang=");
    expect(noisy.imagePath).not.toContain("utm_");
    expect(noisy.imagePath).not.toContain("foo=");
    // …while the share link itself still preserves the selected time.
    expect(noisy.sharePath).toContain("timeMode=depart");
  });
});
