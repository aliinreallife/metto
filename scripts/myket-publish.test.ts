import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  MAX_APK_BYTES,
  buildCommitPayload,
  buildReleaseBundlePayload,
  buildUploadFormData,
  bundleTitleForTag,
  commitMessageForTag,
  decideMyketAction,
  getCurrentBundleFromList,
  myketEndpoints,
  splitMyketDescriptions,
  validatePackageId,
  validateRolloutPercent,
  validateTag,
} from "./myket-publish.mjs";

const SCRIPT = join(process.cwd(), "scripts", "myket-publish.mjs");

function dryRun(args: string[]): { status: number; out: string } {
  try {
    const out = execFileSync("node", [SCRIPT, ...args], { encoding: "utf8" });
    return { status: 0, out: String(out) };
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: unknown; stderr?: unknown };
    return { status: e.status ?? 1, out: String(e.stdout ?? "") + String(e.stderr ?? "") };
  }
}

function tempApk(bytes = "dummy-apk-bytes"): string {
  const dir = mkdtempSync(join(tmpdir(), "myket-apk-"));
  const file = join(dir, "app.apk");
  writeFileSync(file, bytes);
  return file;
}

function tempChangelog(sectionBody: string, tag = "v0.1.0"): string {
  const dir = mkdtempSync(join(tmpdir(), "myket-cl-"));
  const file = join(dir, "CHANGELOG.md");
  writeFileSync(file, `# Changelog\n\n## [${tag}]\n\n${sectionBody}\n`);
  return file;
}

const SECTION_FIXTURE = `First installable Android release of Metto.

### New / جدید

- Metto is now available as an installable Android app.
- The app shell keeps working offline after the first load.

#### فارسی

- متو حالا به‌صورت اپلیکیشن قابل‌نصب اندروید منتشر شده است.
- پوسته برنامه بعد از اولین بازدید بدون اینترنت هم کار می‌کند.
`;

describe("myket-publish.mjs EN/FA transformation (exact, no truncation)", () => {
  it("splits English and Persian without truncation or marker leakage", () => {
    const { en, fa } = splitMyketDescriptions(SECTION_FIXTURE);
    expect(en).toBe(
      `First installable Android release of Metto.\n\n### New / جدید\n\n- Metto is now available as an installable Android app.\n- The app shell keeps working offline after the first load.`,
    );
    expect(fa).toBe(
      `### New / جدید\n\n- متو حالا به‌صورت اپلیکیشن قابل‌نصب اندروید منتشر شده است.\n- پوسته برنامه بعد از اولین بازدید بدون اینترنت هم کار می‌کند.`,
    );
    // No changelog scaffolding leaks into store descriptions.
    expect(en).not.toContain("#### فارسی");
    expect(fa).not.toContain("#### فارسی");
    // Complete content preserved (not truncated).
    expect(en).toContain("Metto is now available as an installable Android app.");
    expect(fa).toContain("متو حالا به‌صورت اپلیکیشن قابل‌نصب اندروید منتشر شده است.");
  });

  it("keeps multi-group structure in both languages", () => {
    const body = `### Improvements / بهبودها\n\n- Faster search.\n\n#### فارسی\n\n- جست‌وجو سریع‌تر شد.\n\n### Fixes / رفع مشکلات\n\n- Fixed midnight crash.\n\n#### فارسی\n\n- کرش بعد از نیمه‌شب رفع شد.\n`;
    const { en, fa } = splitMyketDescriptions(body);
    expect(en).toContain("### Improvements / بهبودها");
    expect(en).toContain("### Fixes / رفع مشکلات");
    expect(en).toContain("- Faster search.");
    expect(en).toContain("- Fixed midnight crash.");
    expect(en).not.toContain("جست‌وجو");
    expect(fa).toContain("### Improvements / بهبودها");
    expect(fa).toContain("### Fixes / رفع مشکلات");
    expect(fa).toContain("- جست‌وجو سریع‌تر شد.");
    expect(fa).toContain("- کرش بعد از نیمه‌شب رفع شد.");
    expect(fa).not.toContain("- Faster search.");
  });

  it("falls back to the non-empty side when one language is missing", () => {
    const { en, fa } = splitMyketDescriptions(`### New / جدید\n\n- Only English here.\n`);
    expect(en).toContain("Only English here.");
    expect(fa).toBe(en);
  });

  it("rejects an empty section", () => {
    expect(() => splitMyketDescriptions("   \n  ")).toThrow(/empty changelog section/);
  });
});

describe("myket-publish.mjs multipart APK upload (empty field name)", () => {
  it("uses an EMPTY multipart field name per Myket docs (--form '= @\"test.apk\"')", () => {
    const form = buildUploadFormData(new Uint8Array([1, 2, 3]), "metto-v0.1.0.apk");
    expect([...form.keys()]).toEqual([""]);
    expect(form.has("")).toBe(true);
    expect(form.getAll("")).toHaveLength(1);
    // Must not invent file/apk part names.
    expect(form.has("file")).toBe(false);
    expect(form.has("apk")).toBe(false);
  });

  it("preserves the APK filename on the empty-name part", () => {
    const form = buildUploadFormData(new Uint8Array([9, 9]), "metto-v0.7.3.apk");
    const part = form.get("") as File;
    expect(part).toBeTruthy();
    expect((part as unknown as { name: string }).name).toBe("metto-v0.7.3.apk");
    expect(part.size).toBe(2);
  });
});

describe("myket-publish.mjs status gate (never overwrite review)", () => {
  it.each([
    [null, true],
    [undefined, true],
    ["", true],
    ["JustCreated", true],
    ["Rejected", true],
    ["RolledBack", true],
    ["WaitingForApproval", false],
    ["Approved", false],
    ["SomethingNew", false],
  ])("status %s -> proceed=%s", (status, proceed) => {
    expect(decideMyketAction(status as string).proceed).toBe(proceed);
  });

  it("aborts WaitingForApproval with manual instructions", () => {
    const d = decideMyketAction("WaitingForApproval");
    expect(d.proceed).toBe(false);
    expect(d.reason).toMatch(/WaitingForApproval/);
  });

  it("picks the latest bundle by createdAt from GET list", () => {
    const json = {
      releases: [
        { status: "Approved", createdAt: "2026-01-01T00:00:00Z", id: "old" },
        { status: "WaitingForApproval", createdAt: "2026-02-01T00:00:00Z", id: "new" },
      ],
    };
    const cur = getCurrentBundleFromList(json);
    expect(cur?.status).toBe("WaitingForApproval");
    expect(cur?.count).toBe(2);
  });

  it("returns null when no releases exist", () => {
    expect(getCurrentBundleFromList({ releases: [] })).toBeNull();
    expect(getCurrentBundleFromList({})).toBeNull();
  });
});

describe("myket-publish.mjs payload + endpoints", () => {
  it("builds the bundle payload with title, rollout, EN/FA infos", () => {
    const p = buildReleaseBundlePayload({
      title: "metto v0.1.0",
      rolloutPercent: 100,
      enDescription: "English notes",
      faDescription: "یادداشت‌های فارسی",
    });
    expect(p).toEqual({
      title: "metto v0.1.0",
      stagedRolloutPercent: 100,
      translationInfos: [
        { description: "English notes", language: "en" },
        { description: "یادداشت‌های فارسی", language: "fa" },
      ],
    });
  });

  it("defaults commit to manual publish (never auto-publish initially)", () => {
    expect(buildCommitPayload({ message: "Metto Android release v0.1.0" })).toEqual({
      isManualPublish: true,
      message: "Metto Android release v0.1.0",
    });
  });

  it("uses the documented endpoints with the corrected /api/ commit URL", () => {
    const e = myketEndpoints("https://developer.myket.ir", "ir.metto.app");
    expect(e).toEqual({
      list: "https://developer.myket.ir/api/partners/applications/ir.metto.app/release-bundle",
      bundle: "https://developer.myket.ir/api/partners/applications/ir.metto.app/release-bundle",
      upload: "https://developer.myket.ir/api/partners/applications/ir.metto.app/release-bundle/upload",
      commit: "https://developer.myket.ir/api/partners/applications/ir.metto.app/release-bundle/commit",
    });
    // The doc typo (myket.i/apir) must never appear.
    expect(e.commit).not.toContain("myket.i/apir");
    expect(e.commit).toContain("myket.ir/api/");
  });

  it("derives title/message from the tag", () => {
    expect(bundleTitleForTag("v0.1.0")).toBe("metto v0.1.0");
    expect(commitMessageForTag("v0.1.0")).toBe("Metto Android release v0.1.0");
  });

  it("validates tag/package/rollout strictly", () => {
    expect(validateTag("v0.1.0").versionCode).toBe(1000);
    expect(() => validateTag("1.0.0")).toThrow();
    expect(validatePackageId("ir.metto.app")).toBe("ir.metto.app");
    expect(() => validatePackageId("bad package!")).toThrow();
    expect(validateRolloutPercent("100")).toBe(100);
    expect(validateRolloutPercent(1)).toBe(1);
    expect(() => validateRolloutPercent("0")).toThrow();
    expect(() => validateRolloutPercent("101")).toThrow();
    expect(MAX_APK_BYTES).toBe(500 * 1024 * 1024);
  });
});

describe("myket-publish.mjs --dry-run (no token, no network)", () => {
  it("validates tag+apk+metadata and prints endpoints without a token", () => {
    const apk = tempApk();
    const changelog = tempChangelog(SECTION_FIXTURE, "v0.1.0");
    const r = dryRun(["--tag", "v0.1.0", "--apk", apk, "--changelog", changelog, "--dry-run"]);
    expect(r.status).toBe(0);
    expect(r.out).toContain("dry-run");
    expect(r.out).toContain("ir.metto.app");
    expect(r.out).toContain("/release-bundle/upload");
    expect(r.out).toContain("/release-bundle/commit");
    expect(r.out).toContain("no network, no token required");
  });

  it("rejects a bad tag and a missing APK in dry-run", () => {
    const apk = tempApk();
    const changelog = tempChangelog(SECTION_FIXTURE, "v0.1.0");
    expect(dryRun(["--tag", "1.0.0", "--apk", apk, "--changelog", changelog, "--dry-run"]).status).not.toBe(0);
    expect(
      dryRun(["--tag", "v0.1.0", "--apk", "/nonexistent/app.apk", "--changelog", changelog, "--dry-run"]).status,
    ).not.toBe(0);
  });
});
