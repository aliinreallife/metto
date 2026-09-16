import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LOCATION_SETTINGS_URI,
  TWA_PACKAGE,
  isAndroidTwa,
  isAndroidTwaSync,
} from "./twa";

function memStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  };
}

function stubBrowser(opts: {
  referrer?: string;
  href?: string;
  relatedApps?: Array<{ id?: string | null }> | null;
}) {
  const replaceState = vi.fn();
  vi.stubGlobal("document", { referrer: opts.referrer ?? "" });
  vi.stubGlobal("sessionStorage", memStorage());
  vi.stubGlobal("window", {
    location: { href: opts.href ?? "https://metto.ir/" },
    history: { replaceState },
  });
  const nav: Record<string, unknown> = {};
  if (opts.relatedApps !== undefined && opts.relatedApps !== null) {
    nav.getInstalledRelatedApps = async () => opts.relatedApps;
  }
  vi.stubGlobal("navigator", nav);
  return { replaceState };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TWA wrapper detection", () => {
  it("detects the TWA from the android-app referrer", () => {
    stubBrowser({ referrer: `android-app://${TWA_PACKAGE}/` });
    expect(isAndroidTwaSync()).toBe(true);
  });

  it("does not mistake a plain browser for the TWA", async () => {
    stubBrowser({ referrer: "https://www.google.com/" });
    expect(isAndroidTwaSync()).toBe(false);
    await expect(isAndroidTwa()).resolves.toBe(false);
  });

  it("detects the ?twa=android launcher param synchronously", () => {
    stubBrowser({ href: "https://metto.ir/?twa=android" });
    expect(isAndroidTwaSync()).toBe(true);
  });

  it("consumes the launcher param: remembers it and strips it, keeping route params", async () => {
    const { replaceState } = stubBrowser({
      href: "https://metto.ir/?from=tajrish&twa=android",
    });
    await expect(isAndroidTwa()).resolves.toBe(true);
    expect(replaceState).toHaveBeenCalledWith(null, "", "/?from=tajrish");
    // Remembered for this tab even after the URL is clean.
    expect(isAndroidTwaSync()).toBe(true);
  });

  it("detects the wrapper via installed related apps", async () => {
    stubBrowser({ relatedApps: [{ id: TWA_PACKAGE }] });
    await expect(isAndroidTwa()).resolves.toBe(true);
    expect(isAndroidTwaSync()).toBe(true);
  });

  it("stays negative when related apps list something else", async () => {
    stubBrowser({ relatedApps: [{ id: "com.example.other" }] });
    await expect(isAndroidTwa()).resolves.toBe(false);
  });
});

describe("LOCATION_SETTINGS_URI", () => {
  it("targets LocationSettingsActivity via a package-targeted intent URI", () => {
    expect(LOCATION_SETTINGS_URI).toBe(
      `intent://open-location-settings#Intent;scheme=metto;package=${TWA_PACKAGE};end`,
    );
  });

  it("carries the wrapper package and the metto scheme", () => {
    expect(LOCATION_SETTINGS_URI).toContain(`package=${TWA_PACKAGE}`);
    expect(LOCATION_SETTINGS_URI).toContain("scheme=metto");
    expect(
      LOCATION_SETTINGS_URI.startsWith(
        "intent://open-location-settings#Intent;",
      ),
    ).toBe(true);
  });
});
