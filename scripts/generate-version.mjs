// Writes public/version.json so the running client can identify which
// build it was served from (see components/version-reporter.tsx setting
// window.__mettoVersion). Runs between `next build` and `serwist build`
// so .next/BUILD_ID exists; the file itself is excluded from the Serwist
// precache (globIgnores) and must always revalidate over the network.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

function readBuildId() {
  try {
    return readFileSync(new URL("../.next/BUILD_ID", import.meta.url), "utf8").trim();
  } catch {
    return "dev";
  }
}

function readCommit() {
  const env =
    process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? "";
  if (env) return env.slice(0, 12);
  try {
    return execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

const version = {
  buildId: readBuildId(),
  commit: readCommit(),
  builtAt: new Date().toISOString(),
};

writeFileSync(
  new URL("../public/version.json", import.meta.url),
  `${JSON.stringify(version)}\n`,
);
console.log(`[version] ${JSON.stringify(version)}`);
