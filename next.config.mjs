import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  // Pin Turbopack + output tracing to this project. Without this, Next
  // infers the workspace root from the outermost lockfile (currently
  // /home/ali/pnpm-lock.yaml) instead of /home/ali/tehran-metro-app.
  outputFileTracingRoot: __dirname,
  turbopack: {
    root: __dirname,
  },
  // schedule-data.json is read from disk at runtime (node:fs) by the
  // route/MCP handlers. Static tracing cannot see the dynamic path, so
  // include it explicitly in those server function bundles — otherwise
  // Vercel serves the functions without the file and routing silently
  // falls back to geometric estimates.
  outputFileTracingIncludes: {
    "/api/route": ["./public/schedule-data.json"],
    "/api/mcp": ["./public/schedule-data.json"],
  },
  // Canonical MCP endpoint is /mcp; /api/mcp stays as a backwards-compatible
  // alias. Internal rewrite (not redirect) so POST/streaming/GET transport
  // behavior is identical on both URLs — one handler implementation only.
  async rewrites() {
    return [{ source: "/mcp", destination: "/api/mcp" }];
  },
}

export default nextConfig
