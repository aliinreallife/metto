import { defineConfig, devices } from "@playwright/test";

// Production-only offline suite. Run after a real production build:
//   pnpm build && pnpm test:e2e:offline
// (CI) or against an already-running prod server via BASE_URL.
// Uses the system Chromium when Playwright's bundled browser cannot be
// downloaded (offline/sandboxed CI): set PLAYWRIGHT_CHROMIUM_PATH.
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
// Vercel Deployment Protection gate: Preview deployments behind Vercel
// Authentication answer 302 to vercel.com/sso-api for anonymous traffic.
// When set (CI mints a short-lived GitHub OIDC token per run — see the E2E
// workflow), every context request carries it as a Trusted Sources identity
// token. Absent locally: no header, unchanged behavior.
const trustedOidcToken = process.env.VERCEL_TRUSTED_OIDC_TOKEN;
// Automation bypass for the same gate: when set (CI secret, never
// hardcoded), every context request additionally carries it as
// x-vercel-protection-bypass. Absent locally: no header, unchanged
// behavior — normal tests never depend on it.
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

export default defineConfig({
  testDir: "./tests",
  testMatch: "*.spec.ts",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  // Serial: offline tests mutate shared server state (one spec rewrites
  // public/sw.js to simulate a release) and assert timing-sensitive SW
  // cache contents; parallelism makes both flaky.
  workers: 1,
  retries: 0,
  reporter: "list",
  // Bypass-cookie bootstrap (see tests/global-setup.ts): stamps Vercel's
  // protection-bypass cookie once per run when VERCEL_AUTOMATION_BYPASS_SECRET
  // is set, so browser-initiated requests (notably SW script fetches, which
  // carry no page-context headers) also pass Deployment Protection. Writes
  // an empty state when unset — local runs behave identically either way.
  globalSetup: "./tests/global-setup.ts",
  use: {
    baseURL: process.env.BASE_URL ?? "http://127.0.0.1:3000",
    storageState: "playwright/.auth/state.json",
    // Failure forensics: a screenshot shows WHAT html arrived (SSO login
    // vs error page vs app), a trace shows WHY (console + network). Kept
    // only for failures; green runs store nothing.
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    ...(chromiumPath
      ? { launchOptions: { executablePath: chromiumPath } }
      : {}),
    ...(trustedOidcToken || bypassSecret
      ? {
          extraHTTPHeaders: {
            ...(trustedOidcToken
              ? { "x-vercel-trusted-oidc-idp-token": trustedOidcToken }
              : {}),
            ...(bypassSecret
              ? { "x-vercel-protection-bypass": bypassSecret }
              : {}),
          },
        }
      : {}),
  },
  projects: [
    {
      // Chromium matches the TWA runtime (Chrome/Android WebView).
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
