#!/usr/bin/env node
// Derives Android versionName/versionCode from a strict semver tag.
//
//   node scripts/android-version.mjs v0.1.0
//   -> versionName=0.1.0 versionCode=1000
//
// Rules (plan correction #2):
// - Tag must match ^v([0-9]+)\.([0-9]+)\.([0-9]+)$ — nothing else.
// - versionCode = major * 1_000_000 + minor * 1_000 + patch
// - minor <= 999, patch <= 999 (major unbounded in practice).
// - Emits KEY=VALUE lines for easy `eval`/GITHUB_OUTPUT consumption.
const TAG_RE = /^v([0-9]+)\.([0-9]+)\.([0-9]+)$/;

export function androidVersionFromTag(tag) {
  const m = TAG_RE.exec(String(tag).trim());
  if (!m) throw new Error(`tag must match ^vMAJOR.MINOR.PATCH (got ${JSON.stringify(tag)})`);
  const major = Number(m[1]);
  const minor = Number(m[2]);
  const patch = Number(m[3]);
  if (!Number.isSafeInteger(major) || !Number.isSafeInteger(minor) || !Number.isSafeInteger(patch)) {
    throw new Error(`non-integer version components in ${tag}`);
  }
  if (minor > 999) throw new Error(`minor must be <= 999 (got ${minor})`);
  if (patch > 999) throw new Error(`patch must be <= 999 (got ${patch})`);
  const versionName = `${major}.${minor}.${patch}`;
  const versionCode = major * 1_000_000 + minor * 1_000 + patch;
  if (!Number.isSafeInteger(versionCode) || versionCode <= 0 || versionCode > 2100000000) {
    throw new Error(`derived versionCode out of range: ${versionCode}`);
  }
  return { versionName, versionCode };
}

const isMain = process.argv[1] === new URL(import.meta.url).pathname;
if (isMain) {
  const [tag] = process.argv.slice(2);
  if (!tag || tag === "--help" || tag === "-h") {
    console.log("Usage: android-version.mjs vMAJOR.MINOR.PATCH");
    process.exit(tag ? 0 : 2);
  }
  try {
    const { versionName, versionCode } = androidVersionFromTag(tag);
    console.log(`versionName=${versionName}`);
    console.log(`versionCode=${versionCode}`);
  } catch (err) {
    console.error(`android-version: ${err.message}`);
    process.exit(1);
  }
}
