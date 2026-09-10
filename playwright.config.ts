import { defineConfig, devices } from "@playwright/test";

// Production-only offline suite. Run after a real production build:
//   pnpm build && pnpm test:e2e:offline
// (CI) or against an already-running prod server via BASE_URL.
// Uses the system Chromium when Playwright's bundled browser cannot be
// downloaded (offline/sandboxed CI): set PLAYWRIGHT_CHROMIUM_PATH.
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

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
  use: {
    baseURL: process.env.BASE_URL ?? "http://127.0.0.1:3000",
    ...(chromiumPath
      ? { launchOptions: { executablePath: chromiumPath } }
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
