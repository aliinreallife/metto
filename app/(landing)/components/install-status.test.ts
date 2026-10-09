import { describe, expect, it } from "vitest";
import {
  PWA_INSTALLED_KEY,
  readRememberedInstall,
  selectInstallStatus,
  shouldShowInstallBadge,
  shouldShowPwaButton,
  writeRememberedInstall,
  type InstallStatus,
} from "./install-status";

const none = {
  inTwa: false,
  pwaStandalone: false,
  installedEvent: false,
  twaOnDevice: false,
  hasPrompt: false,
  remembered: false,
};

describe("selectInstallStatus", () => {
  it("returns unknown when nothing is known (ambiguous by browser design)", () => {
    expect(selectInstallStatus(none)).toBe("unknown");
  });

  it("prefers running-inside states over everything else", () => {
    expect(
      selectInstallStatus({
        ...none,
        inTwa: true,
        pwaStandalone: true,
        twaOnDevice: true,
        hasPrompt: true,
        remembered: true,
      }),
    ).toBe("in-twa");
    expect(
      selectInstallStatus({ ...none, pwaStandalone: true, hasPrompt: true }),
    ).toBe("in-pwa");
    expect(selectInstallStatus({ ...none, installedEvent: true })).toBe(
      "in-pwa",
    );
  });

  it("reports twa-on-device even with a PWA prompt (badge + button combo)", () => {
    expect(
      selectInstallStatus({ ...none, twaOnDevice: true, hasPrompt: true }),
    ).toBe("twa-on-device");
  });

  it("reports prompt when installable and nothing installed", () => {
    expect(selectInstallStatus({ ...none, hasPrompt: true })).toBe("prompt");
  });

  it("reports remembered when this browser installed before but no prompt now", () => {
    expect(selectInstallStatus({ ...none, remembered: true })).toBe(
      "remembered",
    );
  });
});

describe("install section render gates", () => {
  const badge: InstallStatus[] = [
    "in-twa",
    "in-pwa",
    "twa-on-device",
    "remembered",
  ];
  const button: InstallStatus[] = ["prompt", "unknown", "twa-on-device"];
  const all: InstallStatus[] = [
    "in-twa",
    "in-pwa",
    "twa-on-device",
    "remembered",
    "prompt",
    "unknown",
  ];

  it("shows the explicit badge instead of a dead button for installed states", () => {
    for (const s of all) expect(shouldShowInstallBadge(s)).toBe(badge.includes(s));
  });

  it("keeps the PWA button for prompt/unknown/twa-on-device", () => {
    for (const s of all) expect(shouldShowPwaButton(s)).toBe(button.includes(s));
  });

  it("never shows neither badge nor button", () => {
    for (const s of all)
      expect(shouldShowInstallBadge(s) || shouldShowPwaButton(s)).toBe(true);
  });
});

function mockStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

describe("remembered-install storage", () => {
  it("reads the flag strictly: only exact '1' counts", () => {
    expect(readRememberedInstall(mockStorage())).toBe(false);
    expect(readRememberedInstall(mockStorage({ [PWA_INSTALLED_KEY]: "1" }))).toBe(
      true,
    );
    expect(
      readRememberedInstall(mockStorage({ [PWA_INSTALLED_KEY]: "yes" })),
    ).toBe(false);
  });

  it("returns false for missing/throwing storage", () => {
    expect(readRememberedInstall(null)).toBe(false);
    expect(readRememberedInstall(undefined)).toBe(false);
    expect(
      readRememberedInstall({
        getItem: () => {
          throw new Error("denied");
        },
        setItem: () => {},
        removeItem: () => {},
      }),
    ).toBe(false);
  });

  it("writes and clears the flag, never throwing", () => {
    const store = mockStorage();
    writeRememberedInstall(true, store);
    expect(store.getItem(PWA_INSTALLED_KEY)).toBe("1");
    writeRememberedInstall(false, store);
    expect(store.getItem(PWA_INSTALLED_KEY)).toBeNull();
    expect(() =>
      writeRememberedInstall(true, null),
    ).not.toThrow();
  });
});
