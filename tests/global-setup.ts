import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "@playwright/test";

// One-time bypass-cookie bootstrap for Vercel Deployment Protection.
//
// Background: page-context `extraHTTPHeaders` (OIDC identity, bypass
// header) cover page-initiated requests, but browser-initiated requests —
// notably the service-worker script/update fetches — don't carry them, so
// the gate can reject exactly the worker while the app itself loads. A
// bypass COOKIE, once stamped, is attached by the browser to EVERY request
// class for the host, closing that gap.
//
// Behavior:
// - VERCEL_AUTOMATION_BYPASS_SECRET absent (normal local runs): writes an
//   empty storage state and does nothing else — suite behavior identical.
// - Present (CI): visits the cookie-setting endpoint once, then persists
//   the resulting storage for all tests in this run.
// - The secret is never printed and never written to disk; only the
//   resulting (opaque) cookies land in the run-scoped state file, which is
//   gitignored (see .gitignore: playwright/.auth/).
const AUTH_DIR = join(process.cwd(), "playwright", ".auth");
const STATE_PATH = join(AUTH_DIR, "state.json");

async function globalSetup(): Promise<void> {
  await mkdir(AUTH_DIR, { recursive: true });
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (!secret) {
    await writeFile(STATE_PATH, JSON.stringify({ cookies: [], origins: [] }));
    return;
  }
  const baseURL = (process.env.BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const url =
        `${baseURL}/?x-vercel-set-bypass-cookie=true` +
        `&x-vercel-protection-bypass=${encodeURIComponent(secret)}`;
      const response = await page
        .goto(url, { waitUntil: "domcontentloaded", timeout: 60000 })
        .catch(() => null);
      // Observability only (never the secret, never values, never the
      // body): always report the endpoint status plus whether a bypass
      // cookie is actually present afterwards. A 302 here sets NO cookie —
      // only names are logged, values never leave the browser profile.
      const status = response?.status() ?? -1;
      const names = (await context.cookies()).map((c) => c.name);
      const stamped = names.some((n) => /vercel|bypass/i.test(n));
      console.log(
        `[auth-setup] cookie endpoint HTTP ${status}; bypass cookie present: ${stamped} (cookies: ${names.join(",") || "none"})`,
      );
      await context.storageState({ path: STATE_PATH });
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

export default globalSetup;
