import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Playwright E2E lives in tests/ and needs a real browser + prod server.
    exclude: ["tests/**", "node_modules/**"],
  },
});
