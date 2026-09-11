import type { Metadata } from "next";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DiagClient } from "./client";

// Internal diagnostics page (no nav links point here): proves, from inside
// the app itself, which deployment serves this request and what the client
// observes (document, connectivity, service worker, caches, API reach).
// Always dynamic so it is never precached and always read live.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Diagnostics",
  robots: { index: false, follow: false },
};

type VersionInfo = {
  buildId?: string;
  commit?: string;
  builtAt?: string | null;
};

async function readBuildVersion(): Promise<VersionInfo | null> {
  try {
    const raw = await readFile(join(process.cwd(), "public", "version.json"), "utf8");
    const v = JSON.parse(raw) as VersionInfo;
    return { buildId: v.buildId, commit: v.commit, builtAt: v.builtAt ?? null };
  } catch {
    return null;
  }
}

// Vercel-provided, non-secret deployment metadata. Allowlist only — never
// echo tokens, cookies, or request headers.
function vercelEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of [
    "VERCEL_ENV",
    "VERCEL_URL",
    "VERCEL_REGION",
    "VERCEL_GIT_COMMIT_SHA",
    "VERCEL_GIT_REPO_SLUG",
  ]) {
    const value = process.env[key];
    if (value) out[key] = value;
  }
  return out;
}

export default async function DiagPage() {
  const server = {
    at: new Date().toISOString(),
    versionFile: await readBuildVersion(),
    vercel: vercelEnv(),
    node: process.version,
  };
  return (
    <div className="flex size-full flex-col overflow-y-auto p-4" dir="ltr">
      <div className="mx-auto w-full max-w-2xl">
        <h1 className="text-lg font-bold">Metto diagnostics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Served live by this deployment (never precached, never indexed). If
          you can read this, the deployment serves app HTML correctly.
        </p>
        <h2 className="mt-4 text-sm font-semibold">Server (this request)</h2>
        <pre
          data-testid="diag-server"
          className="mt-1 overflow-x-auto rounded-lg border border-border bg-card p-3 text-xs"
        >
          {JSON.stringify(server, null, 2)}
        </pre>
        <h2 className="mt-4 text-sm font-semibold">Client (this browser)</h2>
        <DiagClient />
      </div>
    </div>
  );
}
