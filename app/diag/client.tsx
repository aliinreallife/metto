"use client";

import { useEffect, useState } from "react";

type FetchProbe = { ok: boolean; status?: number; error?: string };

type ClientReport = {
  href: string;
  title: string;
  contentType: string | null;
  navigatorOnline: boolean;
  serviceWorkerSupported: boolean;
  swController: string | null;
  swRegistrations: Array<{ scope: string; installing: boolean; waiting: boolean; active: boolean }>;
  cacheNames: string[] | null;
  connectivityProbe: FetchProbe | null;
  versionProbe: { ok: boolean; body?: unknown; error?: string } | null;
  mettoVersion: unknown;
  mettoOffline: unknown;
};

async function probeFetch(input: string): Promise<FetchProbe> {
  try {
    const res = await fetch(input, { cache: "no-store" });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * No-dependency client reporter: only React + web platform APIs, so this
 * works on any branch state. Collects what the page observes about the
 * deployment serving it. If this component renders at all, app JavaScript
 * hydrated successfully on this deployment.
 */
export function DiagClient() {
  const [report, setReport] = useState<ClientReport | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const registrations: ClientReport["swRegistrations"] = [];
      let controller: string | null = null;
      let supported = false;
      try {
        supported = "serviceWorker" in navigator;
        if (supported) {
          controller = navigator.serviceWorker.controller?.scriptURL ?? null;
          const regs = await navigator.serviceWorker.getRegistrations();
          for (const r of regs) {
            registrations.push({
              scope: r.scope,
              installing: !!r.installing,
              waiting: !!r.waiting,
              active: !!r.active,
            });
          }
        }
      } catch {
        // Diagnostics must never break the page.
      }
      let cacheNames: string[] | null = null;
      try {
        if (typeof caches !== "undefined") cacheNames = await caches.keys();
      } catch {
        cacheNames = null;
      }
      const [connectivityProbe, versionProbe] = await Promise.all([
        probeFetch("/api/connectivity"),
        (async () => {
          try {
            const res = await fetch("/version.json", { cache: "no-store" });
            if (!res.ok) return { ok: false as const, error: `HTTP ${res.status}` };
            return { ok: true as const, body: (await res.json()) as unknown };
          } catch (err) {
            return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
          }
        })(),
      ]);
      if (cancelled) return;
      setReport({
        href: window.location.href,
        title: document.title,
        contentType: document.contentType ?? null,
        navigatorOnline: navigator.onLine,
        serviceWorkerSupported: supported,
        swController: controller,
        swRegistrations: registrations,
        cacheNames,
        connectivityProbe,
        versionProbe,
        mettoVersion: (window as unknown as { __mettoVersion?: unknown }).__mettoVersion ?? null,
        mettoOffline: (window as unknown as { __mettoOffline?: unknown }).__mettoOffline ?? null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!report) {
    return <p data-testid="diag-client" className="mt-1 text-xs text-muted-foreground">Collecting client state…</p>;
  }
  return (
    <pre
      data-testid="diag-client"
      className="mt-1 overflow-x-auto rounded-lg border border-border bg-card p-3 text-xs"
    >
      {JSON.stringify(report, null, 2)}
    </pre>
  );
}
