"use client";

// Android TWA detection + the "Turn on location" deep link.
//
// Background: the web Geolocation API cannot prove the device Location
// master switch is OFF (POSITION_UNAVAILABLE also means "no fix", e.g.
// underground). Certainty lives only in native code
// (LocationSettingsActivity checks LocationManager.isLocationEnabled()
// before opening system settings). This module only answers "are we inside
// the metto Android wrapper?" so the web UI can offer that native action
// there — and hide it in plain browsers/PWAs where it could not work.
//
// Detection signals (any one is enough; all are cheap and offline-safe):
//  1. document.referrer is android-app://ir.metto.app/... inside the TWA.
//  2. The launcher appends ?twa=android to the TWA start URL; it is
//     remembered in sessionStorage and stripped from the address bar.
//  3. navigator.getInstalledRelatedApps() lists ir.metto.app (needs the
//     related_applications entry in app/manifest.ts).

export const TWA_PACKAGE = "ir.metto.app";
export const TWA_LAUNCH_PARAM = "twa";
export const TWA_LAUNCH_VALUE = "android";

// Package-targeted Android intent URI handled by LocationSettingsActivity
// (exported, no UI): verifies Location is really off, then opens Android
// Location settings. A plain metto:// navigation is swallowed by Chrome
// Custom Tabs inside the TWA (verified on-device: the tap did nothing),
// while the explicit intent:// form with package= resolves to the installed
// wrapper — still no JavaScript bridge and no GMS.
export const LOCATION_SETTINGS_URI = `intent://open-location-settings#Intent;scheme=metto;package=${TWA_PACKAGE};end`;

const SESSION_KEY = "metto.twa";

function readSessionFlag(): boolean {
  try {
    return (
      typeof sessionStorage !== "undefined" &&
      sessionStorage.getItem(SESSION_KEY) === "1"
    );
  } catch {
    return false;
  }
}

function rememberTwa(): void {
  try {
    sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    // Private mode etc. — detection simply stays per-load.
  }
}

export function isAndroidTwaSync(): boolean {
  try {
    if (
      typeof document !== "undefined" &&
      document.referrer.startsWith(`android-app://${TWA_PACKAGE}`)
    ) {
      return true;
    }
  } catch {
    // Ignore and fall through.
  }
  try {
    // Read-only peek at the launcher param (consumed + stripped by
    // isAndroidTwa(), which runs on mount everywhere this matters).
    if (typeof window !== "undefined") {
      const params = new URL(window.location.href).searchParams;
      if (params.get(TWA_LAUNCH_PARAM) === TWA_LAUNCH_VALUE) return true;
    }
  } catch {
    // Ignore and fall through to the session flag.
  }
  return readSessionFlag();
}

type RelatedApp = { platform?: string; id?: string | null };

/**
 * Permission-free related-app check: reports whether the Android wrapper
 * (`ir.metto.app`, declared in app/manifest.ts `related_applications`) is
 * installed. Shows no prompt and reveals nothing else about the device —
 * the API only answers for apps our own manifest declares. Never throws:
 * missing API, rejection, or non-array results all mean "not installed".
 * No URL side effects (unlike isAndroidTwa, it never consumes ?twa=android).
 */
export async function isTwaPackageInstalled(): Promise<boolean> {
  try {
    if (typeof navigator === "undefined") return false;
    const nav = navigator as Navigator & {
      getInstalledRelatedApps?: () => Promise<RelatedApp[]>;
    };
    if (typeof nav.getInstalledRelatedApps !== "function") return false;
    const apps = await nav.getInstalledRelatedApps();
    return Array.isArray(apps) && apps.some((a) => a?.id === TWA_PACKAGE);
  } catch {
    return false;
  }
}

export async function isAndroidTwa(): Promise<boolean> {
  // Consume the launcher param (?twa=android) first: remember it for this
  // tab, then strip it so shared links and history stay clean.
  try {
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.get(TWA_LAUNCH_PARAM) === TWA_LAUNCH_VALUE) {
        rememberTwa();
        url.searchParams.delete(TWA_LAUNCH_PARAM);
        const rest = url.searchParams.toString();
        window.history.replaceState(
          null,
          "",
          `${url.pathname}${rest ? `?${rest}` : ""}${url.hash}`,
        );
        return true;
      }
    }
  } catch {
    // Malformed URL — fall through to the other signals.
  }
  if (isAndroidTwaSync()) return true;
  const relatedHit = await isTwaPackageInstalled();
  if (relatedHit) rememberTwa();
  return relatedHit;
}

// Fire-and-forget: navigates to the native Location settings helper via the
// package-targeted intent URI above.
// Only call when isAndroidTwa() is true.
export function openAndroidLocationSettings(): void {
  window.location.href = LOCATION_SETTINGS_URI;
}
