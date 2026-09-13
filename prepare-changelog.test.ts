import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PREPARE = join(process.cwd(), "scripts", "prepare-changelog.mjs");
const EXTRACT = join(process.cwd(), "scripts", "extract-changelog-section.mjs");

const BASE_CHANGELOG = `# Changelog

## [Unreleased]
`;

function fixturePrs() {
  return [
    {
      number: 101,
      title: "Add night departures",
      body: "## Release notes\nCategory: New\n### English\n- Night departures are now shown.\n### فارسی\n- حرکت‌های شبانه حالا نمایش داده می‌شوند.\n",
    },
    {
      number: 102,
      title: "Fix midnight crash",
      body: "## Release notes\nCategory: Fix\n### English\n- Fixed a crash after midnight.\n### فارسی\n- کرش بعد از نیمه‌شب رفع شد.\n",
    },
    {
      number: 103,
      title: "Faster search",
      body: "## Release notes\n### English\n- Search is faster.\n### فارسی\n- جست‌وجو سریع‌تر شد.\n",
    },
    { number: 104, title: "Bump CI action", body: "Routine bump.\n\nRelease notes: none\n" },
  ];
}

// Ancestry fixture: which PRs are in range is decided ONLY by
// commit->PR associations. mergedAt values are deliberately misleading to
// prove timestamps cannot change the result.
function assocFixture() {
  return {
    commits: ["c1", "c2", "c3", "c4"],
    associations: { c1: [101], c2: [101, 102], c3: [103], c4: [104] },
    details: {
      // Merged long ago but stamped with a fresh mergedAt: still excluded,
      // because no in-range commit is associated with it.
      90: {
        number: 90,
        title: "Old work",
        body: "## Release notes\nCategory: New\n### English\n- Old stuff.\n### فارسی\n- چیز قدیمی.\n",
        base: "main",
        merged: true,
        mergedAt: "2026-09-13T00:00:00Z",
      },
      // mergedAt older than any tag: still included (timestamps ignored).
      101: {
        number: 101,
        title: "Add night departures",
        body: "## Release notes\nCategory: New\n### English\n- Night departures are now shown.\n### فارسی\n- حرکت‌های شبانه حالا نمایش داده می‌شوند.\n",
        base: "main",
        merged: true,
        mergedAt: "2001-01-01T00:00:00Z",
      },
      102: {
        number: 102,
        title: "Fix midnight crash",
        body: "## Release notes\nCategory: Fix\n### English\n- Fixed a crash after midnight.\n### فارسی\n- کرش بعد از نیمه‌شب رفع شد.\n",
        base: "main",
        merged: true,
        mergedAt: "2026-09-13T00:00:00Z",
      },
      // Closed without merging: excluded despite an in-range association.
      103: {
        number: 103,
        title: "Abandoned idea",
        body: "## Release notes\n### English\n- Never shipped.\n### فارسی\n- هرگز منتشر نشد.\n",
        base: "main",
        merged: false,
        mergedAt: "2026-09-13T00:00:00Z",
      },
      // Merged into another branch: excluded.
      104: {
        number: 104,
        title: "Side branch work",
        body: "## Release notes\n### English\n- Elsewhere.\n### فارسی\n- جای دیگر.\n",
        base: "feature",
        merged: true,
        mergedAt: "2026-09-13T00:00:00Z",
      },
    },
  };
}

function runPrepare(dir: string, args: string[]): { status: number; out: string } {
  try {
    const out = execFileSync("node", [PREPARE, ...args], { encoding: "utf8", cwd: dir });
    return { status: 0, out: String(out) };
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: unknown; stderr?: unknown };
    return { status: e.status ?? 1, out: String(e.stdout ?? "") + String(e.stderr ?? "") };
  }
}

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "prepare-changelog-"));
  const changelog = join(dir, "CHANGELOG.md");
  const prsFile = join(dir, "prs.json");
  writeFileSync(changelog, BASE_CHANGELOG);
  writeFileSync(prsFile, JSON.stringify(fixturePrs()));
  return { dir, changelog, prsFile };
}

describe("prepare-changelog.mjs", () => {
  it("aggregates PR snippets into groups with PR refs", () => {
    const { dir, changelog, prsFile } = setup();
    const r = runPrepare(dir, [
      "--version",
      "v0.8.0",
      "--date",
      "2026-09-20",
      "--changelog",
      changelog,
      "--prs-file",
      prsFile,
    ]);
    expect(r.status).toBe(0);
    const text = readFileSync(changelog, "utf8");
    expect(text).toContain("## [v0.8.0] - 2026-09-20");
    expect(text).toContain("## [Unreleased]");
    expect(text).toContain("### New / جدید");
    expect(text).toContain("### Fixes / رفع مشکلات");
    expect(text).toContain("### Uncategorized / بدون دسته‌بندی");
    expect(text).toContain("Night departures are now shown. (#101)");
    expect(text).toContain("کرش بعد از نیمه‌شب رفع شد. (#102)");
    expect(text).toContain("Search is faster. (#103)");
    expect(text).not.toContain("#104");
    expect(r.out).toMatch(/skipped internal-only \(1\): #104/);
  });

  it("selects PRs by commit ancestry, ignoring timestamps, deduped", () => {
    const dir = mkdtempSync(join(tmpdir(), "prepare-changelog-"));
    const changelog = join(dir, "CHANGELOG.md");
    const assocFile = join(dir, "assoc.json");
    writeFileSync(changelog, BASE_CHANGELOG);
    writeFileSync(assocFile, JSON.stringify(assocFixture()));
    const r = runPrepare(dir, [
      "--version",
      "v0.8.0",
      "--date",
      "2026-09-20",
      "--changelog",
      changelog,
      "--assoc-file",
      assocFile,
    ]);
    expect(r.status).toBe(0);
    const text = readFileSync(changelog, "utf8");
    // In range via associations (timestamps say otherwise): included.
    expect(text).toContain("Night departures are now shown. (#101)");
    expect(text).toContain("Fixed a crash after midnight. (#102)");
    // Contained in the previous tag / unmerged / other branch: excluded.
    expect(text).not.toContain("Old stuff.");
    expect(text).not.toContain("Never shipped.");
    expect(text).not.toContain("Elsewhere.");
    // Duplicate commit->PR associations (c1+c2 -> #101) yield one entry.
    const occurrences = text.split("Night departures are now shown. (#101)").length - 1;
    expect(occurrences).toBe(1);
  });

  it("blocks a real run when in-range PRs lack notes, without writing", () => {
    const dir = mkdtempSync(join(tmpdir(), "prepare-changelog-"));
    const changelog = join(dir, "CHANGELOG.md");
    const prsFile = join(dir, "prs.json");
    writeFileSync(changelog, BASE_CHANGELOG);
    writeFileSync(
      prsFile,
      JSON.stringify([...fixturePrs().slice(0, 1), { number: 105, title: "Forgot notes", body: "Oops, no section here.\n" }]),
    );
    const args = ["--version", "v0.8.0", "--date", "2026-09-20", "--changelog", changelog, "--prs-file", prsFile];
    const r = runPrepare(dir, args);
    expect(r.status).not.toBe(0);
    expect(r.out).toMatch(/#105/);
    expect(readFileSync(changelog, "utf8")).toBe(BASE_CHANGELOG);
  });

  it("dry-run reports missing notes but stays informational", () => {
    const dir = mkdtempSync(join(tmpdir(), "prepare-changelog-"));
    const changelog = join(dir, "CHANGELOG.md");
    const prsFile = join(dir, "prs.json");
    writeFileSync(changelog, BASE_CHANGELOG);
    writeFileSync(
      prsFile,
      JSON.stringify([...fixturePrs().slice(0, 1), { number: 105, title: "Forgot notes", body: "Oops, no section here.\n" }]),
    );
    const r = runPrepare(dir, [
      "--version",
      "v0.8.0",
      "--date",
      "2026-09-20",
      "--changelog",
      changelog,
      "--prs-file",
      prsFile,
      "--dry-run",
    ]);
    expect(r.status).toBe(0);
    expect(r.out).toMatch(/needs notes: #105/);
    expect(readFileSync(changelog, "utf8")).toBe(BASE_CHANGELOG);
  });

  it("allows an explicit opt-in escape hatch for missing notes", () => {
    const dir = mkdtempSync(join(tmpdir(), "prepare-changelog-"));
    const changelog = join(dir, "CHANGELOG.md");
    const prsFile = join(dir, "prs.json");
    writeFileSync(changelog, BASE_CHANGELOG);
    writeFileSync(
      prsFile,
      JSON.stringify([...fixturePrs().slice(0, 1), { number: 105, title: "Forgot notes", body: "Oops, no section here.\n" }]),
    );
    const r = runPrepare(dir, [
      "--version",
      "v0.8.0",
      "--date",
      "2026-09-20",
      "--changelog",
      changelog,
      "--prs-file",
      prsFile,
      "--allow-missing-notes",
    ]);
    expect(r.status).toBe(0);
    const text = readFileSync(changelog, "utf8");
    expect(text).toContain("## [v0.8.0]");
    expect(text).toContain("Night departures are now shown. (#101)");
    expect(r.out).toMatch(/OMITTED via --allow-missing-notes.*#105/);
  });

  it("is idempotent: a second run adds nothing", () => {
    const { dir, changelog, prsFile } = setup();
    const args = [
      "--version",
      "v0.8.0",
      "--date",
      "2026-09-20",
      "--changelog",
      changelog,
      "--prs-file",
      prsFile,
    ];
    expect(runPrepare(dir, args).status).toBe(0);
    const first = readFileSync(changelog, "utf8");
    const second = runPrepare(dir, args);
    expect(second.status).toBe(0);
    expect(second.out).toMatch(/bullets added: 0/);
    expect(readFileSync(changelog, "utf8")).toBe(first);
  });

  it("dry-run does not write", () => {
    const { dir, changelog, prsFile } = setup();
    const r = runPrepare(dir, [
      "--version",
      "v0.8.0",
      "--date",
      "2026-09-20",
      "--changelog",
      changelog,
      "--prs-file",
      prsFile,
      "--dry-run",
    ]);
    expect(r.status).toBe(0);
    expect(readFileSync(changelog, "utf8")).toBe(BASE_CHANGELOG);
  });

  it("rejects a non-semver version", () => {
    const { dir, changelog, prsFile } = setup();
    const r = runPrepare(dir, ["--version", "0.8", "--changelog", changelog, "--prs-file", prsFile]);
    expect(r.status).not.toBe(0);
  });
});

describe("extract-changelog-section.mjs", () => {
  function extract(args: string[]): { status: number; out: string } {
    try {
      const out = execFileSync("node", [EXTRACT, ...args], { encoding: "utf8" });
      return { status: 0, out: String(out) };
    } catch (err: unknown) {
      const e = err as { status?: number; stdout?: unknown; stderr?: unknown };
      return { status: e.status ?? 1, out: String(e.stdout ?? "") + String(e.stderr ?? "") };
    }
  }

  it("extracts a real version from CHANGELOG.md", () => {
    const r = extract(["v0.7.0"]);
    expect(r.status).toBe(0);
    expect(r.out).toContain("installable Android app");
    expect(r.out).toContain("اپلیکیشن قابل‌نصب اندروید");
    expect(r.out).not.toMatch(/^## \[v0\.7\.0\]/m);
  });

  it("fails when the requested version is absent", () => {
    const r = extract(["v9.9.9"]);
    expect(r.status).not.toBe(0);
    expect(r.out).toMatch(/no "## \[v9\.9\.9\]"/);
  });
});
