"use client";

import { useEffect, useState } from "react";

/**
 * Single reliable client-side connectivity source for the whole app.
 *
 * Based primarily on `navigator.onLine`, resynchronized on:
 * - initial client mount,
 * - `window` online / offline events,
 * - `pageshow` (back/forward cache restores, PWA resume),
 * - `visibilitychange` when the document becomes visible again
 *   (an installed PWA may have slept through a connectivity change).
 *
 * Deliberately NOT derived from tile/API failures: a CARTO CDN failure
 * while `navigator.onLine === true` must never mark the device offline.
 */
export function useConnectivity(): boolean {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === "undefined" ? true : navigator.onLine !== false,
  );

  useEffect(() => {
    const sync = () => {
      try {
        setOnline(navigator.onLine !== false);
      } catch {
        // Keep the last known value if unreadable.
      }
    };
    // Align immediately on mount in case connectivity changed while
    // suspended/backgrounded before this component mounted.
    sync();
    const onVisibility = () => {
      if (!document.hidden) sync();
    };
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    window.addEventListener("pageshow", sync);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      window.removeEventListener("pageshow", sync);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return online;
}

/** Top-level static tabs known to be in the Serwist precache. */
const PRECACHED_TABS: ReadonlySet<string> = new Set([
  "/",
  "/stations",
  "/nearby",
  "/map",
]);

/**
 * True for the top-level static tab URLs that are guaranteed precached,
 * so an offline full-document navigation to them is safe. Query strings
 * are ignored (`/?from=…` maps to `/`); dynamic/API/external URLs are
 * never matched.
 */
export function isPrecachedTabUrl(href: string): boolean {
  if (!href.startsWith("/")) return false;
  const pathname = href.split("?", 1)[0].split("#", 1)[0] || "/";
  return PRECACHED_TABS.has(pathname);
}

export interface PrimaryClickShape {
  button: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  target?: string | null;
}

/**
 * True only for an ordinary same-tab primary-button navigation — the one
 * case where offline tab links fall back to `window.location.assign`.
 * Modifier/middle clicks, new-tab targets and anything else keep normal
 * browser link semantics and are never intercepted.
 */
export function shouldInterceptOfflineNav(e: PrimaryClickShape): boolean {
  if (e.button !== 0) return false;
  if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return false;
  if (e.target && e.target !== "_self") return false;
  return true;
}
