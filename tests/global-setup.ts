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
      // Status only (never the secret, never the body): a non-2xx/3xx here
      // means the cookie likely wasn't stamped — continue anyway so the
      // suite result itself remains the signal.
      const status = response?.status() ?? -1;
      if (!response || status < 200 || status >= 400) {
        console.log(`[auth-setup] cookie endpoint answered HTTP ${status}; continuing without bypass cookie`);
      }
      await context.storageState({ path: STATE_PATH });
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

export default globalSetup;
