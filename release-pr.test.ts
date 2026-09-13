import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT = join(process.cwd(), "scripts", "release-pr.mjs");

function sh(cmd: string, cwd: string, env: Record<string, string> = {}): string {
  return execFileSync("bash", ["-c", cmd], {
    encoding: "utf8",
    cwd,
    env: { ...process.env, ...env },
  });
}

// Local "origin" (bare) + working clone on main. Fully offline.
function setupRepo(): { dir: string; origin: string } {
  const dir = mkdtempSync(join(tmpdir(), "release-pr-"));
  const origin = join(dir, "origin.git");
  sh(`git init --bare -b main "${origin}"`, dir);
  sh(`git clone "${origin}" work 2>/dev/null`, dir);
  const work = join(dir, "work");
  sh(`git config user.email t@t && git config user.name t`, work);
  writeFileSync(join(work, "CHANGELOG.md"), "# Changelog\n\n## [Unreleased]\n");
  writeFileSync(join(work, "app.txt"), "v1\n");
  sh(`git add -A && git commit -qm init && git push -q -u origin main`, work);
  return { dir, origin };
}

// Stub `gh`: canned JSON responses per subcommand call index.
// writeStub(bin, "pr-list", 0, "[]") serves the 1st `gh pr list` call.
function setupGhStub(dir: string): { bin: string; stub: string; respond: (key: string, idx: number, body: string) => void; calls: () => string } {
  const bin = join(dir, "bin");
  const stub = join(dir, "gh-stub");
  sh(`mkdir -p "${bin}" "${stub}"`, dir);
  writeFileSync(
    join(bin, "gh"),
    `#!/usr/bin/env bash\n` +
      `d="\${GH_STUB_DIR:?}"; k="$1-$2"; c="$d/counter-$k"; n=0; [ -f "$c" ] && n=$(cat "$c"); echo $((n+1)) > "$c";\n` +
      `echo "CALL: $*" >> "$d/calls.log"; r="$d/$k-$n.json";\n` +
      `if [ -f "$r" ]; then cat "$r"; exit 0; else echo "gh-stub: no response for $k call #$n" >&2; exit 1; fi\n`,
  );
  sh(`chmod +x "${bin}/gh"`, dir);
  return {
    bin,
    stub,
    respond: (key, idx, body) => writeFileSync(join(stub, `${key}-${idx}.json`), body),
    calls: () => (existsSync(join(stub, "calls.log")) ? readFileSync(join(stub, "calls.log"), "utf8") : ""),
  };
}

function runScript(args: string[], cwd: string, bin: string, stub: string): { status: number; out: string } {
  try {
    const out = execFileSync("node", [SCRIPT, ...args], {
      encoding: "utf8",
      cwd,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GH_STUB_DIR: stub },
    });
    return { status: 0, out: String(out) };
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: unknown; stderr?: unknown };
    return { status: e.status ?? 1, out: String(e.stdout ?? "") + String(e.stderr ?? "") };
  }
}

function writeSummary(work: string, extra: Record<string, unknown> = {}): string {
  const summary = {
    version: "v0.8.0",
    date: "2026-09-20",
    base: "main",
    previousTag: "v0.7.0",
    boundary: "test",
    included: [{ number: 101, title: "Add night departures", group: "New" }],
    skippedNone: [{ number: 104, title: "Bump CI action" }],
    missing: [],
    groupCounts: { New: 1, Improvement: 0, Fix: 0, Uncategorized: 0 },
    addedBullets: 2,
    dryRun: false,
    ...extra,
  };
  const file = join(work, "..", "summary.json"); // outside the repo, like $RUNNER_TEMP
  writeFileSync(file, JSON.stringify(summary));
  return file;
}

function prepareArgs(work: string, summary: string, extra: string[] = []): string[] {
  return ["prepare", "--version", "v0.8.0", "--summary-file", summary, "--base", "main", ...extra];
}

describe("release-pr.mjs prepare", () => {
  it("creates the branch, commits only CHANGELOG.md, and opens a PR", () => {
    const { dir } = setupRepo();
    const work = join(dir, "work");
    const { bin, stub, respond, calls } = setupGhStub(dir);
    // Unrelated uncommitted change must survive untouched and uncommitted.
    writeFileSync(join(work, "app.txt"), "v2-local-only\n");
    writeFileSync(join(work, "CHANGELOG.md"), "# Changelog\n\n## [Unreleased]\n\n## [v0.8.0] - 2026-09-20\n");
    const summary = writeSummary(work);
    respond("pr-list", 0, "[]");
    respond("pr-create", 0, JSON.stringify({ number: 77, url: "https://example/pr/77" }));

    const r = runScript(prepareArgs(work, summary), work, bin, stub);
    expect(r.status).toBe(0);
    const plan = JSON.parse(r.out);
    expect(plan.branch).toBe("release/v0.8.0");
    expect(plan.committed).toBe(true);
    expect(plan.prNumber).toBe(77);
    expect(plan.updatedExistingPr).toBe(false);

    expect(sh(`git log origin/release/v0.8.0 --format=%s -1`, work).trim()).toBe("chore(release): prepare v0.8.0");
    expect(sh(`git show --name-only --format= origin/release/v0.8.0`, work).trim()).toBe("CHANGELOG.md");
    expect(sh(`git status --porcelain -- app.txt`, work).trim()).toBe("M app.txt");
    expect(calls()).toMatch(/pr create.*--title chore\(release\): prepare v0\.8\.0/);
    // PR body carries metadata + Release notes: none.
    const bodyCall = calls().split("\n").find((l) => l.includes("pr create"));
    expect(bodyCall).toMatch(/--body-file/);
  });

  it("reruns safely with force-with-lease and reuses the existing PR", () => {
    const { dir } = setupRepo();
    const work = join(dir, "work");
    const { bin, stub, respond } = setupGhStub(dir);
    writeFileSync(join(work, "CHANGELOG.md"), "# Changelog\n\n## [Unreleased]\n\n## [v0.8.0] - 2026-09-20\n");
    const summary = writeSummary(work);
    respond("pr-list", 0, "[]");
    respond("pr-create", 0, JSON.stringify({ number: 77, url: "https://example/pr/77" }));
    const first = runScript(prepareArgs(work, summary), work, bin, stub);
    expect(first.status).toBe(0);
    const sha1 = JSON.parse(first.out).pushedSha;

    // New changelog content -> second machine commit on top, lease push, PR edit.
    writeFileSync(join(work, "CHANGELOG.md"), readFileSync(join(work, "CHANGELOG.md"), "utf8") + "\nTweak.\n");
    respond("pr-list", 1, JSON.stringify([{ number: 77, url: "https://example/pr/77" }]));
    respond("pr-edit", 0, "");
    const second = runScript(prepareArgs(work, summary), work, bin, stub);
    expect(second.status).toBe(0);
    const plan = JSON.parse(second.out);
    expect(plan.committed).toBe(true);
    expect(plan.updatedExistingPr).toBe(true);
    expect(plan.prNumber).toBe(77);
    expect(plan.pushedSha).not.toBe(sha1);
    // Deterministic rebuild: one prepare commit holding the latest content.
    expect(sh(`git log origin/release/v0.8.0 --format=%s`, work).trim().split("\n")).toEqual([
      "chore(release): prepare v0.8.0",
      "init",
    ]);
    expect(sh(`git show origin/release/v0.8.0:CHANGELOG.md`, work)).toMatch(/Tweak\./);
  });

  it("aborts instead of overwriting human commits on the release branch", () => {
    const { dir } = setupRepo();
    const work = join(dir, "work");
    const { bin, stub, respond } = setupGhStub(dir);
    writeFileSync(join(work, "CHANGELOG.md"), "# Changelog\n\n## [Unreleased]\n\n## [v0.8.0] - 2026-09-20\n");
    const summary = writeSummary(work);
    respond("pr-list", 0, "[]");
    respond("pr-create", 0, JSON.stringify({ number: 77, url: "https://example/pr/77" }));
    expect(runScript(prepareArgs(work, summary), work, bin, stub).status).toBe(0);
    const before = sh(`git rev-parse origin/release/v0.8.0`, work).trim();

    sh(`git checkout -q release/v0.8.0`, work);
    writeFileSync(join(work, "CHANGELOG.md"), readFileSync(join(work, "CHANGELOG.md"), "utf8") + "\nHuman edit.\n");
    sh(`git -c user.name=human -c user.email=h@x commit -qam "human: tweak wording"`, work);
    sh(`git push -q origin release/v0.8.0`, work);

    const r = runScript(prepareArgs(work, summary), work, bin, stub);
    expect(r.status).not.toBe(0);
    expect(r.out).toMatch(/refusing to overwrite/);
    expect(sh(`git rev-parse origin/release/v0.8.0`, work).trim()).not.toBe(before);
    // Remote advanced only by the human commit; no machine commit was added.
    expect(sh(`git log origin/release/v0.8.0 --format=%s -1`, work).trim()).toBe("human: tweak wording");
  });

  it("rejects a summary for a different version", () => {
    const { dir } = setupRepo();
    const work = join(dir, "work");
    const { bin, stub } = setupGhStub(dir);
    const summary = writeSummary(work, { version: "v0.9.0" });
    const r = runScript(prepareArgs(work, summary), work, bin, stub);
    expect(r.status).not.toBe(0);
    expect(r.out).toMatch(/does not match/);
  });
});

describe("release-pr.mjs wait-for-ci", () => {
  const runObj = (over: Record<string, unknown> = {}) => ({
    databaseId: 999,
    headSha: "abc123",
    event: "workflow_dispatch",
    createdAt: new Date(Date.now() + 5000).toISOString(),
    status: "in_progress",
    conclusion: "",
    url: "https://example/run/999",
    ...over,
  });

  it("succeeds when the correlated run succeeds", () => {
    const { dir } = setupRepo();
    const work = join(dir, "work");
    const { bin, stub, respond } = setupGhStub(dir);
    respond("run-list", 0, "[]");
    respond("run-list", 1, JSON.stringify([runObj()]));
    respond("run-view", 0, JSON.stringify(runObj()));
    respond("run-view", 1, JSON.stringify(runObj({ status: "completed", conclusion: "success" })));
    const r = runScript(
      ["wait-for-ci", "--workflow", "ci.yml", "--branch", "release/v0.8.0", "--head-sha", "abc123", "--interval-secs", "1"],
      work, bin, stub,
    );
    expect(r.status).toBe(0);
    expect(r.out).toMatch(/succeeded/);
  });

  it("fails when the run fails", () => {
    const { dir } = setupRepo();
    const work = join(dir, "work");
    const { bin, stub, respond } = setupGhStub(dir);
    respond("run-list", 0, JSON.stringify([runObj()]));
    respond("run-view", 0, JSON.stringify(runObj({ status: "completed", conclusion: "failure" })));
    const r = runScript(
      ["wait-for-ci", "--workflow", "ci.yml", "--branch", "release/v0.8.0", "--head-sha", "abc123", "--interval-secs", "1"],
      work, bin, stub,
    );
    expect(r.status).not.toBe(0);
    expect(r.out).toMatch(/conclusion=failure/);
  });

  it("fails on timeout instead of waiting forever", () => {
    const { dir } = setupRepo();
    const work = join(dir, "work");
    const { bin, stub, respond } = setupGhStub(dir);
    respond("run-list", 0, JSON.stringify([runObj()]));
    for (let i = 0; i < 5; i++) respond("run-view", i, JSON.stringify(runObj()));
    const r = runScript(
      ["wait-for-ci", "--workflow", "ci.yml", "--branch", "release/v0.8.0", "--head-sha", "abc123", "--timeout-secs", "2", "--interval-secs", "1"],
      work, bin, stub,
    );
    expect(r.status).not.toBe(0);
    expect(r.out).toMatch(/did not complete/);
  });

  it("fails when no run appears", () => {
    const { dir } = setupRepo();
    const work = join(dir, "work");
    const { bin, stub, respond } = setupGhStub(dir);
    for (let i = 0; i < 4; i++) respond("run-list", i, "[]");
    const r = runScript(
      ["wait-for-ci", "--workflow", "ci.yml", "--branch", "release/v0.8.0", "--head-sha", "abc123", "--appear-timeout-secs", "2", "--interval-secs", "1"],
      work, bin, stub,
    );
    expect(r.status).not.toBe(0);
    expect(r.out).toMatch(/no CI run appeared/);
  });
});
