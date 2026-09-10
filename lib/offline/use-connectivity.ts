"use client";

import { useSyncExternalStore } from "react";
import {
  getConnectivitySnapshot,
  getServerConnectivitySnapshot,
  subscribeConnectivity,
  type ConnectivitySnapshot,
  type ConnectivityState,
} from "./connectivity-store";

export type { ConnectivityState };

export interface ConnectivityValue {
  state: ConnectivityState;
  /** True only when reachability was verified (state === "online"). */
  online: boolean;
  /** False while the first/renewed verification is still running. */
  verified: boolean;
  /** Raw link flag last observed (diagnostics only — never UI truth). */
  navigatorOnline: boolean;
  /** True once a probe resolved for the current episode. */
  reachabilityVerified: boolean;
}

function toValue(snapshot: ConnectivitySnapshot): ConnectivityValue {
  return {
    state: snapshot.state,
    online: snapshot.state === "online",
    verified: snapshot.state !== "checking",
    navigatorOnline: snapshot.navigatorOnline,
    reachabilityVerified: snapshot.reachabilityVerified,
  };
}

/**
 * The single shared effective-connectivity state. Safe to call from any
 * number of components — all observe the same value, driven by one probe
 * at a time. Deliberately NOT derived from tile/API failures.
 */
export function useConnectivity(): ConnectivityValue {
  const snapshot = useSyncExternalStore(
    subscribeConnectivity,
    getConnectivitySnapshot,
    getServerConnectivitySnapshot,
  );
  return toValue(snapshot);
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
