#!/usr/bin/env node
// Generates a Digital Asset Links file for the Metto TWA.
// Public fingerprints are safe to commit; private keys/passwords never are.
//
// Usage:
//   node scripts/generate-assetlinks.mjs --fingerprint AA:BB:... [--fingerprint ...]
//     [--package ir.metto.app] [--output public/.well-known/assetlinks.json | --stdout]
//
// Exits non-zero on invalid package / fingerprint format.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const EXPECTED_PACKAGE = "ir.metto.app";
export const EXPECTED_RELATION = "delegate_permission/common.handle_all_urls";
export const FINGERPRINT_RE = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;
const PACKAGE_RE = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;

export function normalizeFingerprint(fp) {
  return String(fp).trim().toUpperCase();
}

export function buildAssetLinks({ packageName, fingerprints }) {
  if (!PACKAGE_RE.test(packageName)) {
    throw new Error(`invalid package name: ${packageName}`);
  }
  const fps = [...new Set(fingerprints.map(normalizeFingerprint))];
  if (fps.length === 0) throw new Error("at least one --fingerprint is required");
  for (const fp of fps) {
    if (!FINGERPRINT_RE.test(fp)) throw new Error(`invalid SHA-256 fingerprint: ${fp}`);
    if (/^(00:){31}00$/.test(fp)) throw new Error(`placeholder fingerprint rejected: ${fp}`);
  }
  return [
    {
      relation: [EXPECTED_RELATION],
      target: {
        namespace: "android_app",
        package_name: packageName,
        sha256_cert_fingerprints: fps,
      },
    },
  ];
}

function parseArgs(argv) {
  const out = { package: EXPECTED_PACKAGE, fingerprints: [], output: null, stdout: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--package") out.package = argv[++i];
    else if (a === "--fingerprint") out.fingerprints.push(argv[++i]);
    else if (a === "--output") out.output = argv[++i];
    else if (a === "--stdout") out.stdout = true;
    else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: generate-assetlinks.mjs --fingerprint SHA256... [--fingerprint ...] [--package ir.metto.app] [--output <file> | --stdout]",
      );
      process.exit(0);
    } else {
      console.error(`unknown arg: ${a}`);
      process.exit(2);
    }
  }
  return out;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const json = buildAssetLinks({ packageName: args.package, fingerprints: args.fingerprints });
    const text = JSON.stringify(json, null, 2) + "\n";
    if (args.stdout) {
      process.stdout.write(text);
    } else {
      const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
      const dest = resolve(repoRoot, args.output ?? "public/.well-known/assetlinks.json");
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, text);
      console.log(`wrote ${dest} (${json[0].target.sha256_cert_fingerprints.length} fingerprint(s))`);
    }
  } catch (err) {
    console.error(`generate-assetlinks: ${err.message}`);
    process.exit(1);
  }
}
