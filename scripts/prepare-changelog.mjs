#!/usr/bin/env node
// Release preparation: aggregates merged-PR bilingual release notes into
// CHANGELOG.md — once per release, never per PR.
//
//   node scripts/prepare-changelog.mjs --version v0.8.0 [--date YYYY-MM-DD]
//     [--changelog PATH] [--base main] [--prs-file FIXTURES.json] [--dry-run] [--since YYYY-MM-DD]
//
// Boundary (primary): the previous version tag. PRs merged into <base> after
// that tag's commit are collected via `gh`; their "## Release notes" sections
// are the source of truth (works with merge commits, squash, or rebase).
// Date-based GitHub search is only a fallback when no previous tag exists
// (then --since is required).
//
// Grouping is deterministic: only the PR snippet's explicit
// `Category: New|Improvement|Fix` decides the group. Snippets without a
// category go to "Uncategorized / بدون دسته‌بندی" for a human to sort.
// The prose is never reinterpreted. The result MUST be reviewed and merged
// before tagging. Re-running is safe (no duplicate entries).
import { execFileSync, execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { mergeIntoChangelog, parseReleaseNotes } from "./release-notes.mjs";

const TAG_RE = /^v([0-9]+)\.([0-9]+)\.([0-9]+)$/;
const DATE_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

function usage() {
  console.log(
    "Usage: prepare-changelog.mjs --version vMAJOR.MINOR.PATCH [--date YYYY-MM-DD] [--changelog PATH] [--base BRANCH] [--prs-file JSON] [--dry-run] [--since YYYY-MM-DD]",
  );
}

function flag(argv, name) {
  const i = argv.indexOf(name);
  if (i === -1) return undefined;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith("--")) throw new Error(`missing value for ${name}`);
  return v;
}

function compareSemver(a, b) {
  const pa = a.map(Number);
  const pb = b.map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

function git(args) {
  return execSync(`git ${args}`, { encoding: "utf8" }).trim();
}

function previousTag() {
  const out = git("tag --list 'v*.*.*' --sort=-v:refname");
  return out
    .split("\n")
    .map((t) => t.trim())
    .filter((t) => TAG_RE.test(t));
}

function tagExists(tag) {
  try {
    git(`rev-parse --verify --quiet 'refs/tags/${tag}'`);
    return true;
  } catch {
    return false;
  }
}

function tagCommitInstant(tag) {
  // Seconds since epoch — timezone-safe comparison point for mergedAt.
  return Number(git(`log -1 --format=%ct '${tag}'`));
}

function listMergedPrs({ base, limit = 200 }) {
  const out = execFileSync(
    "gh",
    ["pr", "list", "--state", "merged", "--base", base, "--limit", String(limit), "--json", "number,title,body,mergedAt,url"],
    { encoding: "utf8" },
  );
  return JSON.parse(out);
}

function searchMergedPrsSince({ since, base, limit = 200 }) {
  const out = execFileSync(
    "gh",
    ["pr", "list", "--search", `merged:>${since}`, "--state", "merged", "--base", base, "--limit", String(limit), "--json", "number,title,body,mergedAt,url"],
    { encoding: "utf8" },
  );
  return JSON.parse(out);
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    usage();
    process.exit(0);
  }
  let version;
  try {
    version = flag(argv, "--version");
  } catch (err) {
    console.error(`prepare-changelog: ${err.message}`);
    process.exit(1);
  }
  if (!version) {
    usage();
    process.exit(2);
  }
  version = version.trim();
  const m = TAG_RE.exec(version);
  if (!m) {
    console.error(`prepare-changelog: --version must match ^vMAJOR.MINOR.PATCH (got ${JSON.stringify(version)})`);
    process.exit(1);
  }

  const dryRun = argv.includes("--dry-run");
  const base = flag(argv, "--base") ?? "main";
  const prsFile = flag(argv, "--prs-file");
  const changelogPath = resolve(process.cwd(), flag(argv, "--changelog") ?? "CHANGELOG.md");
  let date = flag(argv, "--date") ?? new Date().toISOString().slice(0, 10);
  if (!DATE_RE.test(date)) {
    console.error(`prepare-changelog: --date must be YYYY-MM-DD (got ${JSON.stringify(date)})`);
    process.exit(1);
  }

  if (tagExists(version)) {
    console.error(`prepare-changelog: tag ${version} already exists — refusing to re-prepare a released version.`);
    process.exit(1);
  }

  let prs;
  let boundaryDesc;
  if (prsFile) {
    prs = JSON.parse(readFileSync(resolve(process.cwd(), prsFile), "utf8"));
    boundaryDesc = `--prs-file ${prsFile} (${prs.length} PRs)`;
  } else {
    let tags = [];
    try {
      tags = previousTag();
    } catch {
      tags = [];
    }
    if (tags.length > 0) {
      const prev = tags[0];
      if (compareSemver([m[1], m[2], m[3]], TAG_RE.exec(prev).slice(1)) <= 0) {
        console.error(`prepare-changelog: ${version} must be newer than previous tag ${prev}.`);
        process.exit(1);
      }
      const prevInstant = tagCommitInstant(prev);
      let all;
      try {
        all = listMergedPrs({ base });
      } catch (err) {
        console.error(`prepare-changelog: failed to list merged PRs via gh: ${err.message}`);
        process.exit(1);
      }
      prs = all
        .filter((pr) => Number.isFinite(Date.parse(pr.mergedAt)) && Date.parse(pr.mergedAt) / 1000 > prevInstant)
        .sort((a, b) => a.number - b.number);
      boundaryDesc = `merged into ${base} after ${prev}`;
    } else {
      // Fallback: no previous tag — date-based search only.
      const since = flag(argv, "--since");
      if (!since || !DATE_RE.test(since)) {
        console.error(
          "prepare-changelog: no previous version tag found. Re-run with --since YYYY-MM-DD to use date-based search as a fallback.",
        );
        process.exit(1);
      }
      try {
        prs = searchMergedPrsSince({ since, base }).sort((a, b) => a.number - b.number);
      } catch (err) {
        console.error(`prepare-changelog: date-based PR search failed: ${err.message}`);
        process.exit(1);
      }
      boundaryDesc = `date-based fallback search merged:>${since} into ${base}`;
    }
  }

  const items = [];
  const skippedNone = [];
  const missing = [];
  for (const pr of prs) {
    const parsed = parseReleaseNotes(pr.body ?? "");
    if (parsed.hasNoneMarker && (!parsed.section || parsed.section.english.length + parsed.section.persian.length === 0)) {
      skippedNone.push(pr.number);
      continue;
    }
    if (!parsed.section || parsed.section.english.length === 0 || parsed.section.persian.length === 0) {
      missing.push(pr.number);
      continue;
    }
    if (parsed.section.categoryRaw !== null && parsed.section.category === null) {
      missing.push(pr.number);
      continue;
    }
    items.push({
      group: parsed.section.category ?? "Uncategorized",
      en: parsed.section.english,
      fa: parsed.section.persian,
      pr: pr.number,
    });
  }

  let changelogText;
  try {
    changelogText = readFileSync(changelogPath, "utf8");
  } catch (err) {
    console.error(`prepare-changelog: cannot read ${changelogPath}: ${err.message}`);
    process.exit(1);
  }

  const { text, added } = mergeIntoChangelog(changelogText, { version, date, items });

  if (dryRun) {
    console.log(`prepare-changelog: DRY RUN for ${version} (${boundaryDesc})`);
    console.log(`included PRs: ${items.map((i) => `#${i.pr}`).join(", ") || "(none)"}`);
    console.log(`skipped (Release notes: none): ${skippedNone.join(", ") || "(none)"}`);
    console.log(`needs notes: ${missing.map((n) => `#${n}`).join(", ") || "(none)"}`);
    console.log(`bullets that would be added: ${added}`);
    process.exit(0);
  }

  writeFileSync(changelogPath, text);
  console.log(`prepare-changelog: ${version} <- ${boundaryDesc}`);
  console.log(`  PRs included (${items.length}): ${items.map((i) => `#${i.pr} [${i.group}]`).join(", ") || "(none)"}`);
  console.log(`  skipped internal-only (${skippedNone.length}): ${skippedNone.map((n) => `#${n}`).join(", ") || "(none)"}`);
  if (missing.length > 0) {
    console.log(`  WARNING — merged PRs without usable notes (add notes or mark none, then re-run): ${missing.map((n) => `#${n}`).join(", ")}`);
  }
  console.log(`  bullets added: ${added} (re-runs add nothing new)`);
  console.log("  REVIEW the CHANGELOG.md diff, merge it to main, THEN tag.");
}

main();
