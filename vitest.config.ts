import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirror tsconfig "@/*" so route-handler tests can import "@/lib/…".
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    // Playwright E2E lives in tests/ and needs a real browser + prod server.
    exclude: ["tests/**", "node_modules/**"],
  },
});
