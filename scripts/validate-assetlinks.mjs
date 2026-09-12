#!/usr/bin/env node
// Validates a Digital Asset Links file for the Metto TWA.
//
// Behavior (per plan correction #4):
// - If the production file is absent, this is NOT a failure: print a
//   "pending" notice (real upload key does not exist yet) and exit 0.
// - If the file exists (prod path, --file, or $ASSETLINKS_FILE), validate
//   strictly and exit 1 on any problem.
//
// Usage:
//   node scripts/validate-assetlinks.mjs [--file <path>]
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const EXPECTED_PACKAGE = "ir.metto.app";
export const EXPECTED_RELATION = "delegate_permission/common.handle_all_urls";
export const FINGERPRINT_RE = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;
const PLACEHOLDER_RE = /REPLACE|PLACEHOLDER|EXAMPLE|XX:/i;

export function validateAssetLinks(data) {
  const errors = [];
  if (!Array.isArray(data) || data.length === 0) {
    return ["top-level JSON must be a non-empty array"];
  }
  for (let i = 0; i < data.length; i++) {
    const entry = data[i];
    const where = `entry[${i}]`;
    if (!entry || typeof entry !== "object") {
      errors.push(`${where} must be an object`);
      continue;
    }
    if (!Array.isArray(entry.relation) || !entry.relation.includes(EXPECTED_RELATION)) {
      errors.push(`${where}.relation must include "${EXPECTED_RELATION}"`);
    }
    const t = entry.target;
    if (!t || typeof t !== "object") {
      errors.push(`${where}.target must be an object`);
      continue;
    }
    if (t.namespace !== "android_app") errors.push(`${where}.target.namespace must be "android_app"`);
    if (t.package_name !== EXPECTED_PACKAGE) {
      errors.push(`${where}.target.package_name must be "${EXPECTED_PACKAGE}" (got ${JSON.stringify(t.package_name)})`);
    }
    const fps = t.sha256_cert_fingerprints;
    if (!Array.isArray(fps) || fps.length === 0) {
      errors.push(`${where}.target.sha256_cert_fingerprints must be a non-empty array`);
      continue;
    }
    for (const fp of fps) {
      const s = String(fp).toUpperCase();
      if (!FINGERPRINT_RE.test(s)) errors.push(`${where} has invalid SHA-256 fingerprint: ${fp}`);
      else if (/^(00:){31}00$/.test(s)) errors.push(`${where} has placeholder fingerprint: ${fp}`);
      if (PLACEHOLDER_RE.test(String(fp))) errors.push(`${where} looks like a placeholder: ${fp}`);
    }
  }
  return errors;
}

function parseArgs(argv) {
  let file = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--file") file = argv[++i];
    else if (argv[i] === "--help" || argv[i] === "-h") {
      console.log("Usage: validate-assetlinks.mjs [--file <path>]");
      process.exit(0);
    } else {
      console.error(`unknown arg: ${argv[i]}`);
      process.exit(2);
    }
  }
  return { file };
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const { file } = parseArgs(process.argv.slice(2));
  const explicit = file ?? process.env.ASSETLINKS_FILE ?? null;
  if (explicit) {
    const p = resolve(repoRoot, explicit);
    if (!existsSync(p)) {
      console.error(`validate-assetlinks: file not found: ${p}`);
      process.exit(1);
    }
    const errors = validateAssetLinks(JSON.parse(readFileSync(p, "utf8")));
    if (errors.length) {
      for (const e of errors) console.error(`validate-assetlinks: ${e}`);
      process.exit(1);
    }
    console.log(`validate-assetlinks: OK (${p})`);
  } else {
    const prod = resolve(repoRoot, "public/.well-known/assetlinks.json");
    if (!existsSync(prod)) {
      console.log(
        "validate-assetlinks: PENDING — no production assetlinks.json yet. " +
          "Expected until the real upload signing key exists. " +
          "See docs/ANDROID_TWA.md (generate + commit the real file, then this check becomes strict).",
      );
      process.exit(0);
    }
    const errors = validateAssetLinks(JSON.parse(readFileSync(prod, "utf8")));
    if (errors.length) {
      for (const e of errors) console.error(`validate-assetlinks: ${e}`);
      process.exit(1);
    }
    console.log(`validate-assetlinks: OK (${prod})`);
  }
}
