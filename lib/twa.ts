"use client";

// Android TWA context detection + native deep links.
//
// Background: the web Geolocation API cannot prove the device Location
// master switch is OFF (POSITION_UNAVAILABLE also means "no fix", e.g.
// underground). Certainty lives only in native code
// (LocationSettingsActivity checks LocationManager.isLocationEnabled()
// before opening system settings). This module answers two deliberately
// separate questions:
//
//  1. "Is this page currently running inside the Metto Android TWA?"
//     Used to gate native-only UI and automatic rating prompts.
//  2. "Is the Metto Android wrapper installed on this device?"
//     Exposed separately by isTwaPackageInstalled(). Installation alone is
//     NOT proof that the current page is a TWA; ordinary Chrome/PWA users may
//     also have the Android app installed.
//
// TWA-context signals (either is enough; both are cheap and offline-safe):
//  1. document.referrer is android-app://ir.metto.app/... inside the TWA.
//  2. The launcher appends ?twa=android to the TWA start URL; it is
//     remembered in sessionStorage and stripped from the address bar.

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

// Canonical deep link handled by RateAppActivity (exported, no UI):
// detects the installing store (Bazaar/Myket/Play) and opens our listing
// in that exact store; unknown installs fall back to market:// then /rate.
export const RATE_APP_URI = "metto://rate-app";

// Web fallback for the rating flow (also the browser_fallback_url below).
export const RATE_FALLBACK_URL = "https://metto.ir/rate";

// Package-targeted intent form of the rating deep link. Same CCT reason as
// above: a plain metto:// navigation is swallowed inside the TWA, while the
// explicit intent:// form resolves to the installed wrapper.
//
// S.browser_fallback_url is the PRIMARY old-wrapper protection: Chrome
// itself opens https://metto.ir/rate when no activity handles
// metto://rate-app (i.e. wrappers predating RateAppActivity). The
// visibility-timer backup in openAndroidRateAppWithFallback covers only
// browsers/TWA providers that ignore browser_fallback_url.
export const RATE_APP_INTENT_URI =
  `intent://rate-app#Intent;scheme=metto;package=${TWA_PACKAGE};` +
  `S.browser_fallback_url=${encodeURIComponent(RATE_FALLBACK_URL)};end`;

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
 *
 * Important: installation is deliberately NOT used as TWA-context proof.
 * A user can browse metto.ir in ordinary Chrome while the wrapper is also
 * installed, and native-only UI must not appear in that browser tab.
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
    // Malformed URL — fall through to the other context signals.
  }

  // Deliberately do not consult getInstalledRelatedApps() here. That API
  // answers "is our wrapper installed?", not "is this tab the wrapper?".
  return isAndroidTwaSync();
}

// Fire-and-forget: navigates to the native Location settings helper via the
// package-targeted intent URI above.
// Only call when isAndroidTwa() is true.
export function openAndroidLocationSettings(): void {
  window.location.href = LOCATION_SETTINGS_URI;
}

// Fire-and-forget: navigates to the native Rate helper via the
// package-targeted intent URI above (RateAppActivity opens the installing
// store's listing, or /rate for unknown installs).
// Only call when isAndroidTwa() is true. No JavaScript bridge.
export function openAndroidRateApp(): void {
  window.location.href = RATE_APP_INTENT_URI;
}

/**
 * Rate flow with old-wrapper protection.
 *
 * Primary mechanism: S.browser_fallback_url inside RATE_APP_INTENT_URI —
 * Chrome opens https://metto.ir/rate itself when the wrapper has no
 * RateAppActivity. This function adds a SECONDARY safety net for
 * browsers/TWA providers that ignore browser_fallback_url: if the page is
 * still visible after `delayMs` (i.e. no native activity took over),
 * `navigateToRate()` runs (callers pass `() => router.push("/rate")`).
 *
 * The backup never fires after a successful native launch (page hidden),
 * never fires on /rate itself, cancels on visibilitychange/pagehide, and
 * stays silent (no error UI). Returns a cancel function for unmount.
 */
export function openAndroidRateAppWithFallback(
  navigateToRate: () => void,
  delayMs = 2500,
): () => void {
  const noop = () => {};
  try {
    if (
      typeof window === "undefined" ||
      typeof document === "undefined" ||
      typeof navigateToRate !== "function"
    ) {
      return noop;
    }
    // Already on the fallback page — nothing to do.
    if (window.location.pathname === "/rate") return noop;
    try {
      window.location.href = RATE_APP_INTENT_URI;
    } catch {
      // Assigning the URI itself failed: go straight to the fallback.
      try {
        navigateToRate();
      } catch {
        // Silent — never an error dialog for the rating action.
      }
      return noop;
    }
    let settled = false;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      try {
        window.clearTimeout(timer);
      } catch {
        // Ignore.
      }
      try {
        document.removeEventListener("visibilitychange", onVisibility);
      } catch {
        // Ignore.
      }
      try {
        window.removeEventListener("pagehide", onHide);
      } catch {
        // Ignore.
      }
    };
    const onVisibility = () => {
      try {
        if (document.visibilityState === "hidden") cleanup();
      } catch {
        // Ignore.
      }
    };
    const onHide = () => cleanup();
    const timer = window.setTimeout(() => {
      if (settled) return;
      try {
        // Page still visible: no native handler took over (old wrapper +
        // a browser ignoring browser_fallback_url). Fall back invisibly.
        if (
          document.visibilityState !== "hidden" &&
          window.location.pathname !== "/rate"
        ) {
          navigateToRate();
        }
      } catch {
        // Silent.
      }
      cleanup();
    }, delayMs);
    try {
      document.addEventListener("visibilitychange", onVisibility);
    } catch {
      // Ignore.
    }
    try {
      window.addEventListener("pagehide", onHide);
    } catch {
      // Ignore.
    }
    return cleanup;
  } catch {
    return noop;
  }
}
