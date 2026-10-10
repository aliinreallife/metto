/**
 * Install-state resolution for the landing install section.
 *
 * Background: when the PWA is installed but the user is browsing in a
 * normal tab (not inside the installed app), Chromium suppresses
 * `beforeinstallprompt` — and unlike the APK (queryable via
 * `getInstalledRelatedApps`), there is NO API that tells a regular tab
 * "my own PWA is installed elsewhere". So "no prompt + not standalone"
 * is ambiguous: it means "already installed" OR "cannot install here".
 *
 * To narrow it, the section remembers installs itself: `appinstalled`
 * persists a `localStorage` flag, and a later `beforeinstallprompt`
 * (proof it is NOT installed) clears it. That covers same-browser
 * installs; anything else stays honestly "unknown". A stale flag (user
 * uninstalled the PWA elsewhere, which fires no event we can hear)
 * self-heals the moment a prompt fires again.
 */

export type InstallStatus =
  | "in-twa" // Running inside the installed Android app (APK).
  | "in-pwa" // Running inside the installed web app (standalone / just accepted).
  | "twa-on-device" // APK installed on device while browsing (best-effort related-apps hit).
  | "remembered" // This browser installed the PWA before, but no prompt now.
  | "prompt" // A deferred install prompt is available right now.
  | "unknown"; // No prompt and nothing known — ambiguous by browser design.

export function selectInstallStatus(opts: {
  inTwa: boolean;
  pwaStandalone: boolean;
  installedEvent: boolean;
  twaOnDevice: boolean;
  hasPrompt: boolean;
  remembered: boolean;
}): InstallStatus {
  if (opts.inTwa) return "in-twa";
  if (opts.pwaStandalone || opts.installedEvent) return "in-pwa";
  // Intentionally before "prompt": APK on device + browsing with a PWA
  // prompt available shows BOTH the device badge and the install button.
  if (opts.twaOnDevice) return "twa-on-device";
  if (opts.hasPrompt) return "prompt";
  if (opts.remembered) return "remembered";
  return "unknown";
}

/** Explicit status badge (instead of a dead button) for these states. */
export function shouldShowInstallBadge(status: InstallStatus): boolean {
  return (
    status === "in-twa" ||
    status === "in-pwa" ||
    status === "twa-on-device" ||
    status === "remembered"
  );
}

/** The PWA button stays (enabled with a prompt, disabled otherwise). */
export function shouldShowPwaButton(status: InstallStatus): boolean {
  return (
    status === "prompt" ||
    status === "unknown" ||
    status === "twa-on-device"
  );
}

export const PWA_INSTALLED_KEY = "metto.pwa-installed";

type RememberStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function safeLocalStorage(): RememberStorage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    // Private mode etc. — memory simply stays per-load.
    return null;
  }
}

export function readRememberedInstall(
  storage: RememberStorage | undefined | null = safeLocalStorage(),
): boolean {
  try {
    return storage?.getItem(PWA_INSTALLED_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeRememberedInstall(
  installed: boolean,
  storage: RememberStorage | undefined | null = safeLocalStorage(),
): void {
  try {
    if (!storage) return;
    if (installed) storage.setItem(PWA_INSTALLED_KEY, "1");
    else storage.removeItem(PWA_INSTALLED_KEY);
  } catch {
    // Unavailable storage — memory simply stays per-load.
  }
}
