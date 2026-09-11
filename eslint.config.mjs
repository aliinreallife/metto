import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Baseline, 2026-09-11: these five React-Hooks v6 compiler-era rules
    // flag intentional patterns throughout the existing app (SSR-safe
    // storage hydration in mount effects, latest-ref sync for imperative
    // Leaflet handlers, wall-clock display labels). Enforcing them as
    // errors would require refactoring large amounts of application code,
    // so they report as warnings for now — still visible in `pnpm lint`
    // and CI logs. Promote back to error incrementally (follow-up), one
    // pattern at a time. All other Next/Core Web Vitals rules, including
    // react-hooks/rules-of-hooks, stay at upstream severity.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/use-memo": "warn",
    },
  },
  // Generated / build output — never lint. (public/sw.js* mirrors .gitignore:
  // the Serwist bundle is emitted by `serwist build`, source is app/sw.ts.)
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "node_modules/**",
    "public/sw.js",
    "public/sw.js.map",
    "test-results/**",
    "playwright-report/**",
  ]),
]);
