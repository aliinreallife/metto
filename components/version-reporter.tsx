"use client";

import { useEffect } from "react";

export type MettoVersion = {
  buildId: string;
  commit: string;
  builtAt: string | null;
  swControlled: boolean;
};

declare global {
  interface Window {
    __mettoVersion?: MettoVersion;
  }
}

/**
 * No-UI reporter: fetches the deployment's version.json (never precached,
 * always live) and exposes it as window.__mettoVersion + console.info, so
 * stale-client reports can be told apart from the current deployment.
 * Silent on failure (offline / dev without version.json).
 */
export function VersionReporter() {
  useEffect(() => {
    let cancelled = false;
    const swControlled = (() => {
      try {
        return !!navigator.serviceWorker?.controller;
      } catch {
        return false;
      }
    })();
    const publish = (info: Omit<MettoVersion, "swControlled">) => {
      if (cancelled) return;
      const full: MettoVersion = { ...info, swControlled };
      try {
        window.__mettoVersion = full;
      } catch {
        // Ignore.
      }
      console.info("[Metto version]", full);
    };
    fetch("/version.json", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<Partial<MettoVersion>>;
      })
      .then((v) =>
        publish({
          buildId: typeof v.buildId === "string" ? v.buildId : "unknown",
          commit: typeof v.commit === "string" ? v.commit : "unknown",
          builtAt: typeof v.builtAt === "string" ? v.builtAt : null,
        }),
      )
      .catch(() => {
        publish({ buildId: "dev", commit: "unknown", builtAt: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
