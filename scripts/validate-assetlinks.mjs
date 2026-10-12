#!/usr/bin/env node
// Validates a Digital Asset Links file for the metto TWA.
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
// Cafe Bazaar TWA verification (see
// https://developers.cafebazaar.ir/en/guidelines/learn-more/trusted-web-application):
// `{ "relation": ["check_validation"],
//    "target": { "namespace": "cafebazaar_twa", "package_name": "<PACKAGE>" } }`
// — package-only, deliberately WITHOUT certificate fingerprints.
export const BAZAAR_NAMESPACE = "cafebazaar_twa";
export const BAZAAR_RELATION = "check_validation";
const PLACEHOLDER_RE = /REPLACE|PLACEHOLDER|EXAMPLE|XX:/i;

function checkFingerprints(errors, where, fps) {
  if (!Array.isArray(fps) || fps.length === 0) {
    errors.push(`${where}.target.sha256_cert_fingerprints must be a non-empty array`);
    return false;
  }
  let ok = true;
  for (const fp of fps) {
    const s = String(fp).toUpperCase();
    if (!FINGERPRINT_RE.test(s)) {
      errors.push(`${where} has invalid SHA-256 fingerprint: ${fp}`);
      ok = false;
    } else if (/^(00:){31}00$/.test(s)) {
      errors.push(`${where} has placeholder fingerprint: ${fp}`);
      ok = false;
    }
    if (PLACEHOLDER_RE.test(String(fp))) {
      errors.push(`${where} looks like a placeholder: ${fp}`);
      ok = false;
    }
  }
  return ok;
}

export function validateAssetLinks(data) {
  const errors = [];
  if (!Array.isArray(data) || data.length === 0) {
    return ["top-level JSON must be a non-empty array"];
  }
  let androidOk = false;
  let bazaarOk = false;
  for (let i = 0; i < data.length; i++) {
    const entry = data[i];
    const where = `entry[${i}]`;
    if (!entry || typeof entry !== "object") {
      errors.push(`${where} must be an object`);
      continue;
    }
    const t = entry.target;
    if (!t || typeof t !== "object") {
      errors.push(`${where}.target must be an object`);
      continue;
    }
    // Statements about other packages are not ours to judge: ignore them
    // instead of rejecting legitimate statements we don't own. (Unrelated
    // namespaces such as "web" fall through to the ignore branch below.)
    if (
      t.package_name !== undefined &&
      t.package_name !== EXPECTED_PACKAGE &&
      (t.namespace === "android_app" || t.namespace === BAZAAR_NAMESPACE)
    ) {
      continue;
    }
    if (t.namespace === "android_app") {
      if (!Array.isArray(entry.relation) || !entry.relation.includes(EXPECTED_RELATION)) {
        errors.push(`${where}.relation must include "${EXPECTED_RELATION}"`);
        continue;
      }
      if (t.package_name !== EXPECTED_PACKAGE) {
        errors.push(`${where}.target.package_name must be "${EXPECTED_PACKAGE}" (got ${JSON.stringify(t.package_name)})`);
        continue;
      }
      if (checkFingerprints(errors, where, t.sha256_cert_fingerprints)) androidOk = true;
    } else if (t.namespace === BAZAAR_NAMESPACE) {
      // Required semantics only: namespace + our package + a relation list
      // containing check_validation. Extra harmless fields (top-level or in
      // target) are deliberately ignored so future valid DAL extensions
      // don't fail our CI. The generator still emits the clean minimal
      // statement (no fingerprints, no extra fields).
      if (!Array.isArray(entry.relation) || !entry.relation.includes(BAZAAR_RELATION)) {
        errors.push(`${where}.relation must include "${BAZAAR_RELATION}"`);
        continue;
      }
      if (t.package_name !== EXPECTED_PACKAGE) {
        errors.push(`${where}.target.package_name must be "${EXPECTED_PACKAGE}" (got ${JSON.stringify(t.package_name)})`);
        continue;
      }
      bazaarOk = true;
    } else {
      // Unrelated namespace (e.g. "web" site-to-site delegation):
      // legitimate, not ours — ignore.
      continue;
    }
  }
  if (!androidOk) {
    errors.push(`missing a valid android_app statement with target.package_name "${EXPECTED_PACKAGE}"`);
  }
  if (!bazaarOk) {
    errors.push(`missing a valid ${BAZAAR_NAMESPACE} statement (relation "${BAZAAR_RELATION}", target.package_name "${EXPECTED_PACKAGE}")`);
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
