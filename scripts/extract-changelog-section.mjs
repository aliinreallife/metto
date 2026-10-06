#!/usr/bin/env node
// Extracts one `## [version]` section body from CHANGELOG.md (heading excluded).
//
//   node scripts/extract-changelog-section.mjs v0.8.0 [--changelog PATH]
//   node scripts/extract-changelog-section.mjs v0.8.0 --plain [--lang fa|en|both]
//
// Default output is the markdown body (used for the GitHub Release notes).
// --plain instead prints plain-text store descriptions for manual paste into
// Bazaar / Myket / Play panels (no markdown headings, `- ` dash bullets,
// `(#NN)` PR refs stripped). Exits 1 with an actionable error when the
// section is missing — the Android release workflow relies on this to fail
// early instead of publishing a release with generic/empty notes.
//
// Google Play caps What's new at 500 chars per locale: --plain warns on
// stderr when a side exceeds that (non-failing — trim by hand for Play).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractChangelogSection, formatStoreDescriptions } from "./release-notes.mjs";

const TAG_RE = /^v[0-9]+\.[0-9]+\.[0-9]+$/;
const PLAY_WHATS_NEW_LIMIT = 500;

function usage() {
  console.log(
    "Usage: extract-changelog-section.mjs [vMAJOR.MINOR.PATCH | --version vMAJOR.MINOR.PATCH] [--changelog PATH] [--plain [--lang fa|en|both]]",
  );
}

function flagValue(argv, name) {
  const i = argv.indexOf(name);
  if (i === -1) return undefined;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith("--")) throw new Error(`missing value for ${name}`);
  return v;
}

const argv = process.argv.slice(2);
// `--version vX.Y.Z` is accepted as an alias for the positional version
// (prepare-release.yml validates via `pnpm changelog:extract --version …`).
let version = argv.find((a) => !a.startsWith("--"));
const changelogIdx = argv.indexOf("--changelog");
const changelogPath =
  changelogIdx !== -1 ? argv[changelogIdx + 1] : resolve(process.cwd(), "CHANGELOG.md");
const plain = argv.includes("--plain");
let lang = "both";
try {
  const raw = flagValue(argv, "--lang");
  if (raw !== undefined) lang = raw.trim().toLowerCase();
} catch (err) {
  console.error(`extract-changelog-section: ${err.message}`);
  process.exit(1);
}

if (!version || version === "--help" || version === "-h") {
  usage();
  process.exit(!version ? 2 : 0);
}
if (!TAG_RE.test(version.trim())) {
  console.error(`extract-changelog-section: version must match ^vMAJOR.MINOR.PATCH (got ${JSON.stringify(version)})`);
  process.exit(1);
}
if (changelogIdx !== -1 && !argv[changelogIdx + 1]) {
  console.error("extract-changelog-section: missing value for --changelog");
  process.exit(1);
}
const versionFlagIdx = argv.indexOf("--version");
if (versionFlagIdx !== -1) {
  const v = argv[versionFlagIdx + 1];
  if (v === undefined || v.startsWith("--")) {
    console.error("extract-changelog-section: missing value for --version");
    process.exit(1);
  }
  version = v;
}
if (!["fa", "en", "both"].includes(lang)) {
  console.error(`extract-changelog-section: --lang must be fa, en, or both (got ${JSON.stringify(lang)})`);
  process.exit(1);
}
for (const a of argv) {
  if (a.startsWith("--") && !["--changelog", "--plain", "--lang", "--version"].includes(a)) {
    console.error(`extract-changelog-section: unknown argument ${JSON.stringify(a)} (see --help)`);
    process.exit(1);
  }
}

let text;
try {
  text = readFileSync(changelogPath, "utf8");
} catch (err) {
  console.error(`extract-changelog-section: cannot read ${changelogPath}: ${err.message}`);
  process.exit(1);
}

const body = extractChangelogSection(text, version.trim());
if (body === null || body.trim() === "") {
  console.error(
    `extract-changelog-section: no "## [${version.trim()}]" section with content in ${changelogPath}. ` +
      `Run "node scripts/prepare-changelog.mjs --version ${version.trim()}", review, and merge the changelog update before tagging.`,
  );
  process.exit(1);
}

if (!plain) {
  process.stdout.write(body.endsWith("\n") ? body : body + "\n");
  process.exit(0);
}

const { en, fa } = formatStoreDescriptions(body);
const picked =
  lang === "en" ? { en, fa: "" } : lang === "fa" ? { en: "", fa } : { en, fa };
const out = [picked.en, picked.fa].filter((s) => s && s.trim()).join("\n\n---\n\n");
if (!out.trim()) {
  console.error("extract-changelog-section: empty store descriptions (no EN/FA content to derive)");
  process.exit(1);
}
for (const [label, s] of [
  ["en", picked.en],
  ["fa", picked.fa],
]) {
  if (s && [...s].length > PLAY_WHATS_NEW_LIMIT) {
    console.error(
      `extract-changelog-section: warning: ${label} description is ${[...s].length} chars — Google Play "What's new" caps at ${PLAY_WHATS_NEW_LIMIT} per locale (trim by hand for Play; Myket/Bazaar take the full text).`,
    );
  }
}
process.stdout.write(out.endsWith("\n") ? out : out + "\n");
