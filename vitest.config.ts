import { defineConfig } from "vitest/config";

// Mirrors tsconfig.json "@/*" paths (tests run from the repo root).
const root = process.cwd().replace(/\\/g, "/");

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: `${root}/` }],
  },
  test: {
    // Playwright E2E lives in tests/ and needs a real browser + prod server.
    exclude: ["tests/**", "node_modules/**"],
  },
});
