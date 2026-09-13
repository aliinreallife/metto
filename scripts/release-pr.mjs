#!/usr/bin/env node
// Release-branch + release-PR orchestration for `prepare-release.yml`.
//
// Subcommands:
//   prepare    safely create/update release/vX.Y.Z + open/update its PR
//   wait-for-ci  wait for one explicitly dispatched CI run (synchronous)
//
// Only CHANGELOG.md is ever staged/committed here. The machine-readable
// summary (release-summary.json) lives under $RUNNER_TEMP and is never
// committed. No changelog-generation logic lives here — that is
// `prepare-changelog.mjs --summary-file` (single source of truth).
//
// Safety model for reruns: the release branch is rebuilt deterministically
// from the base branch every time. A rerun pushes with --force-with-lease
// ONLY when every commit unique to the existing release branch is
// machine-generated (bot author + exact prepare message). Any human/manual
// commit aborts the run instead of being overwritten.
import { execFileSync, execSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const TAG_RE = /^v[0-9]+\.[0-9]+\.[0-9]+$/;
const BOT_NAME = "github-actions[bot]";
const BOT_EMAIL = "41898282+github-actions[bot]@users.noreply.github.com";

function usage() {
  console.log(
    "Usage:\n" +
      "  release-pr.mjs prepare --version vX.Y.Z --summary-file PATH [--base BRANCH] [--changelog PATH] [--dry-run]\n" +
      "  release-pr.mjs wait-for-ci --workflow FILE --branch BRANCH --head-sha SHA [--timeout-secs N] [--appear-timeout-secs N] [--interval-secs N]",
  );
}

function flag(argv, name, def) {
  const i = argv.indexOf(name);
  if (i === -1) return def;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith("--")) throw new Error(`missing value for ${name}`);
  return v;
}

function git(args, opts = {}) {
  return execFileSync("git", args, { encoding: "utf8", ...opts }).trim();
}

function gh(args, opts = {}) {
  return execFileSync("gh", args, { encoding: "utf8", ...opts }).trim();
}

function commitMessageFor(version) {
  return `chore(release): prepare ${version}`;
}

// Every commit unique to the release branch must be machine-generated.
// Returns the offending commit lines (empty = safe).
function unsafeCommits({ base, remoteSha }) {
  const NUL = String.fromCharCode(0);
  const RS = String.fromCharCode(30);
  const out = git(["log", "--format=%H%x00%an%x00%ae%x00%s%x1e", `${base}..${remoteSha}`]);
  const bad = [];
  for (const record of out.split(RS)) {
    const trimmed = record.trim();
    if (!trimmed) continue;
    const [sha, author, email, subject] = trimmed.split(NUL);
    void sha;
    if (author !== BOT_NAME || email !== BOT_EMAIL || !(subject ?? "").startsWith("chore(release): prepare ")) {
      bad.push(trimmed.split(NUL).join(" ").slice(0, 120));
    }
  }
  return bad;
}

function renderPrBody(summary) {
  const lines = [];
  lines.push(`## Release prep ${summary.version}`, "");
  lines.push(`- Target version: \`${summary.version}\``);
  lines.push(`- Previous release tag: \`${summary.previousTag ?? "n/a (no previous tag)"}\``);
  lines.push(`- Range: ${summary.boundary ?? "n/a"}`, "");
  const included = summary.included ?? [];
  lines.push(`### Included PRs (${included.length})`);
  if (included.length === 0) lines.push("- (none)");
  for (const pr of included) {
    lines.push(`- #${pr.number} ${pr.title ?? ""} [${pr.group ?? "Uncategorized"}]`.trimEnd());
  }
  lines.push("");
  const skipped = summary.skippedNone ?? [];
  lines.push(`### Skipped internal-only (${skipped.length})`);
  if (skipped.length === 0) lines.push("- (none)");
  for (const pr of skipped) {
    lines.push(`- #${pr.number} ${pr.title ?? ""}`.trimEnd());
  }
  lines.push("");
  const counts = summary.groupCounts ?? {};
  lines.push(
    `Counts — New: ${counts.New ?? 0} · Improvements: ${counts.Improvement ?? 0} · Fixes: ${counts.Fix ?? 0} · Uncategorized: ${counts.Uncategorized ?? 0}`,
  );
  lines.push("");
  lines.push(
    "Please review the bilingual CHANGELOG entries before merging. Merge this PR, then tag the version to publish the Android release.",
  );
  lines.push("");
  lines.push("Release notes: none");
  lines.push("");
  return lines.join("\n");
}

function cmdPrepare(argv) {
  const version = flag(argv, "--version");
  const summaryFile = flag(argv, "--summary-file");
  if (!version || !TAG_RE.test(version.trim())) {
    console.error(`release-pr: --version must match ^vMAJOR.MINOR.PATCH (got ${JSON.stringify(version)})`);
    process.exit(1);
  }
  if (!summaryFile) {
    console.error("release-pr: --summary-file PATH is required");
    process.exit(1);
  }
  const base = flag(argv, "--base", "main");
  const changelogRel = flag(argv, "--changelog", "CHANGELOG.md");
  const dryRun = argv.includes("--dry-run");
  const cleanVersion = version.trim();
  const branch = `release/${cleanVersion}`;

  let summary;
  try {
    summary = JSON.parse(readFileSync(resolve(process.cwd(), summaryFile), "utf8"));
  } catch (err) {
    console.error(`release-pr: cannot read summary ${summaryFile}: ${err.message}`);
    process.exit(1);
  }
  if (summary.version !== cleanVersion) {
    console.error(
      `release-pr: summary version ${JSON.stringify(summary.version)} does not match ${cleanVersion} — re-run prepare first`,
    );
    process.exit(1);
  }
  const changelogPath = resolve(process.cwd(), changelogRel);
  let preparedContent;
  try {
    preparedContent = readFileSync(changelogPath, "utf8");
  } catch (err) {
    console.error(`release-pr: cannot read ${changelogPath}: ${err.message}`);
    process.exit(1);
  }

  // Observe remote state first (reads only).
  try {
    git(["fetch", "origin", base]);
  } catch (err) {
    console.error(`release-pr: failed to fetch origin/${base}: ${err.message}`);
    process.exit(1);
  }
  let remoteSha = "";
  try {
    remoteSha = git(["ls-remote", "--heads", "origin", branch])
      .split(/\s+/)[0]
      ?.trim();
  } catch {
    remoteSha = "";
  }
  if (remoteSha) {
    try {
      git(["fetch", "origin", branch]);
    } catch (err) {
      console.error(`release-pr: failed to fetch existing ${branch}: ${err.message}`);
      process.exit(1);
    }
    let bad;
    try {
      bad = unsafeCommits({ base: `origin/${base}`, remoteSha });
    } catch (err) {
      console.error(`release-pr: cannot inspect ${branch} history: ${err.message}`);
      process.exit(1);
    }
    if (bad.length > 0) {
      console.error(
        `release-pr: refusing to overwrite ${branch} — it contains ${bad.length} non-machine commit(s):`,
      );
      for (const b of bad.slice(0, 5)) console.error(`  - ${b}`);
      console.error("release-pr: reconcile the branch manually (or delete it to start over), then re-run Prepare Release.");
      process.exit(1);
    }
  }

  const expectedMessage = commitMessageFor(cleanVersion);
  const plan = {
    version: cleanVersion,
    base,
    branch,
    remoteExisted: Boolean(remoteSha),
    committed: false,
    pushedSha: "",
    prNumber: null,
    prUrl: "",
    updatedExistingPr: false,
  };

  if (dryRun) {
    console.log(JSON.stringify({ ...plan, dryRun: true, safeToReplace: true }));
    return;
  }

  // Rebuild deterministically from base. Stash only CHANGELOG.md across the
  // switch so prepared content survives even when already on the release
  // branch; every other working-tree file is left untouched.
  let stashed = false;
  try {
    const stashOut = git(["stash", "push", "-m", `release-pr ${cleanVersion}`, "--", changelogRel]);
    stashed = !stashOut.includes("No local changes");
  } catch {
    stashed = false;
  }
  git(["checkout", "-B", branch, `origin/${base}`]);
  writeFileSync(changelogPath, preparedContent);
  const changed = git(["status", "--porcelain", "--", changelogRel]).trim() !== "";
  if (changed) {
    git(["-c", `user.name=${BOT_NAME}`, "-c", `user.email=${BOT_EMAIL}`, "commit", "-m", expectedMessage, "--", changelogRel]);
    plan.committed = true;
  }
  if (remoteSha) {
    git(["push", `--force-with-lease=refs/heads/${branch}:${remoteSha}`, "origin", branch]);
  } else {
    git(["push", "-u", "origin", branch]);
  }
  plan.pushedSha = git(["rev-parse", branch]);
  if (stashed) {
    // Prepared content is now committed and pushed; the stash is redundant.
    // Dropped only on success so a failed run keeps it for manual recovery.
    try {
      git(["stash", "drop"]);
    } catch {
      // Already gone — nothing to recover. Continue.
    }
  }

  const tmpBody = join(mkdtempSync(join(tmpdir(), "release-pr-")), "body.md");
  writeFileSync(tmpBody, renderPrBody(summary));
  const existing = JSON.parse(gh(["pr", "list", "--head", branch, "--base", base, "--json", "number,url"]));
  if (existing.length > 0) {
    gh(["pr", "edit", String(existing[0].number), "--title", `chore(release): prepare ${cleanVersion}`, "--body-file", tmpBody]);
    plan.prNumber = existing[0].number;
    plan.prUrl = existing[0].url ?? "";
    plan.updatedExistingPr = true;
  } else {
    const created = JSON.parse(
      gh(["pr", "create", "--base", base, "--head", branch, "--title", `chore(release): prepare ${cleanVersion}`, "--body-file", tmpBody, "--json", "number,url"]),
    );
    plan.prNumber = created.number ?? null;
    plan.prUrl = created.url ?? "";
  }
  console.log(JSON.stringify(plan));
}

function sleepSecs(n) {
  execSync(`sleep ${Math.max(0, Number(n) || 0)}`);
}

function cmdWaitForCi(argv) {
  const workflow = flag(argv, "--workflow");
  const branch = flag(argv, "--branch");
  const headSha = flag(argv, "--head-sha");
  if (!workflow || !branch || !headSha) {
    console.error("release-pr: wait-for-ci requires --workflow, --branch, and --head-sha");
    process.exit(1);
  }
  const timeoutSecs = Number(flag(argv, "--timeout-secs", "1800"));
  const appearSecs = Number(flag(argv, "--appear-timeout-secs", "180"));
  const intervalSecs = Math.max(1, Number(flag(argv, "--interval-secs", "20")));
  const start = Date.now();
  const deadlineAppear = start + appearSecs * 1000;
  const deadlineAll = start + timeoutSecs * 1000;

  // Phase 1: correlate — newest workflow_dispatch run on this branch+sha.
  let runId = null;
  let runUrl = "";
  for (;;) {
    let runs;
    try {
      runs = JSON.parse(gh(["run", "list", "--workflow", workflow, "--branch", branch, "--limit", "10", "--json", "databaseId,headSha,event,createdAt,status,conclusion,url"]));
    } catch (err) {
      console.error(`release-pr: failed to list runs: ${err.message}`);
      process.exit(1);
    }
    const match = (Array.isArray(runs) ? runs : [])
      .filter((r) => r.headSha === headSha && r.event === "workflow_dispatch")
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
    if (match && Number.isFinite(Date.parse(match.createdAt)) && Date.parse(match.createdAt) >= start - 120_000) {
      runId = match.databaseId;
      runUrl = match.url ?? "";
      break;
    }
    if (Date.now() >= deadlineAppear) {
      console.error(`release-pr: no CI run appeared for ${branch}@${headSha.slice(0, 12)} within ${appearSecs}s — aborting`);
      process.exit(1);
    }
    sleepSecs(Math.min(intervalSecs, Math.max(1, (deadlineAppear - Date.now()) / 1000)));
  }
  console.log(`release-pr: watching CI run ${runId} (${runUrl})`);

  // Phase 2: wait for completion of that exact run.
  for (;;) {
    let run;
    try {
      run = JSON.parse(gh(["run", "view", String(runId), "--json", "status,conclusion,url"]));
    } catch (err) {
      console.error(`release-pr: failed to inspect run ${runId}: ${err.message}`);
      process.exit(1);
    }
    if (run.status === "completed") {
      if (run.conclusion === "success") {
        console.log(`release-pr: CI run ${runId} succeeded`);
        process.exit(0);
      }
      console.error(`release-pr: CI run ${runId} ended with conclusion=${run.conclusion ?? "unknown"} (${run.url ?? runUrl}) — failing preparation`);
      process.exit(1);
    }
    if (Date.now() >= deadlineAll) {
      console.error(`release-pr: CI run ${runId} did not complete within ${timeoutSecs}s — failing preparation`);
      process.exit(1);
    }
    sleepSecs(Math.min(intervalSecs, Math.max(1, (deadlineAll - Date.now()) / 1000)));
  }
}

const [sub, ...rest] = process.argv.slice(2);
if (sub === "prepare") cmdPrepare(rest);
else if (sub === "wait-for-ci") cmdWaitForCi(rest);
else {
  usage();
  process.exit(2);
}
