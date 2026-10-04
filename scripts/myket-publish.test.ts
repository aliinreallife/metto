import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  MAX_APK_BYTES,
  assertNoDowngrade,
  assertOurReleasePresent,
  buildCommitPayload,
  buildReleaseBundlePayload,
  buildUploadFormData,
  bundleTitleForTag,
  classifyUploadError,
  commitMessageForTag,
  decideMyketAction,
  getCurrentBundleFromList,
  maxVersionCodeFromList,
  myketEndpoints,
  normalizeMyketStatus,
  sanitizeEnForMyket,
  splitMyketDescriptions,
  storeDescriptionFilenames,
  validatePackageId,
  validateRolloutPercent,
  validateTag,
  writeStoreDescriptionFiles,
} from "./myket-publish.mjs";
import { formatStoreDescriptions } from "./release-notes.mjs";

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

### New

- Metto is now available as an installable Android app.
- The app shell keeps working offline after the first load.

#### فارسی

### جدید

- متو حالا به‌صورت اپلیکیشن قابل‌نصب اندروید منتشر شده است.
- پوسته برنامه بعد از اولین بازدید بدون اینترنت هم کار می‌کند.
`;

describe("myket-publish.mjs EN/FA transformation (exact, no truncation)", () => {
  it("splits English and Persian as plain text without markdown or marker leakage", () => {
    const { en, fa } = splitMyketDescriptions(SECTION_FIXTURE);
    expect(en).toBe(
      `First installable Android release of Metto.\n\nNew:\n\n- Metto is now available as an installable Android app.\n- The app shell keeps working offline after the first load.`,
    );
    expect(fa).toBe(
      `جدید:\n\n- متو حالا به‌صورت اپلیکیشن قابل‌نصب اندروید منتشر شده است.\n- پوسته برنامه بعد از اولین بازدید بدون اینترنت هم کار می‌کند.`,
    );
    // No markdown or changelog scaffolding leaks into store descriptions.
    expect(en).not.toContain("#");
    expect(fa).not.toContain("#");
    expect(en).not.toContain("#### فارسی");
    expect(fa).not.toContain("#### فارسی");
    expect(en).not.toContain("*");
    // Complete content preserved (not truncated).
    expect(en).toContain("Metto is now available as an installable Android app.");
    expect(fa).toContain("متو حالا به‌صورت اپلیکیشن قابل‌نصب اندروید منتشر شده است.");
  });

  it("keeps multi-group structure in both languages as plain headings", () => {
    const body = `### Improvements\n\n- Faster search.\n\n### Fixes\n\n- Fixed midnight crash.\n\n#### فارسی\n\n### بهبودها\n\n- جست‌وجو سریع‌تر شد.\n\n### رفع مشکلات\n\n- کرش بعد از نیمه‌شب رفع شد.\n`;
    const { en, fa } = splitMyketDescriptions(body);
    expect(en).toBe(
      `Improvements:\n\n- Faster search.\n\nFixes:\n\n- Fixed midnight crash.`,
    );
    expect(fa).toBe(
      `بهبودها:\n\n- جست‌وجو سریع‌تر شد.\n\nرفع مشکلات:\n\n- کرش بعد از نیمه‌شب رفع شد.`,
    );
    expect(en).not.toContain("جست‌وجو");
    expect(fa).not.toContain("- Faster search.");
  });

  it("strips trailing PR refs so stores never show (#NN)", () => {
    const body = `### New\n\n- Ship it. (#12)\n\n#### فارسی\n\n### جدید\n\n- ارسال شد. (#12)\n`;
    const { en, fa } = splitMyketDescriptions(body);
    expect(en).toBe(`New:\n\n- Ship it.`);
    expect(fa).toBe(`جدید:\n\n- ارسال شد.`);
    expect(en).not.toContain("(#");
    expect(fa).not.toContain("(#");
  });

  it("accepts interleaved sections without duplicating FA headings (issue #104)", () => {
    const body = `### New\n\n- Ship it.\n\n#### فارسی\n\n### جدید\n\n- ارسال شد.\n\n### Improvements\n\n- Faster.\n\n#### فارسی\n\n### بهبودها\n\n- سریع‌تر.\n`;
    const { en, fa } = splitMyketDescriptions(body);
    expect(en).toContain("New:");
    expect(en).toContain("Improvements:");
    expect(fa.split("جدید:").length - 1).toBe(1);
    expect(fa.split("بهبودها:").length - 1).toBe(1);
    expect(fa).toContain("- ارسال شد.");
    expect(fa).toContain("- سریع‌تر.");
  });

  it("accepts legacy bilingual sections, normalizing both sides (issue #102)", () => {
    const body = `### Improvements / بهبودها\n\n- Faster search.\n\n#### فارسی\n\n- جست‌وجو سریع‌تر شد.\n`;
    const { en, fa } = splitMyketDescriptions(body);
    expect(en).toContain("Improvements:");
    expect(en).not.toContain("بهبودها");
    expect(fa).toContain("بهبودها:");
    expect(fa).toContain("- جست‌وجو سریع‌تر شد.");
  });

  it("falls back to the non-empty side when one language is missing", () => {
    const { en, fa } = splitMyketDescriptions(`### New\n\n- Only English here.\n`);
    expect(en).toContain("Only English here.");
    expect(fa).toBe(en);
  });

  it("rejects an empty section", () => {
    expect(() => splitMyketDescriptions("   \n  ")).toThrow(/empty changelog section/);
  });

  it("keeps the EN sanitizer as a guard so Myket's EN validator accepts it", () => {
    const AR = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
    const body = `### New\n\n- App icon now supports themed icons.\n\n#### فارسی\n\n### جدید\n\n- آیکون برنامه از تم پشتیبانی می‌کند.\n`;
    const { en, fa } = splitMyketDescriptions(body);
    expect(en).toContain("New:");
    expect(AR.test(en)).toBe(false);
    expect(sanitizeEnForMyket("### Improvements / بهبودها")).toBe("### Improvements");
    expect(sanitizeEnForMyket("- Faster search.")).toBe("- Faster search.");
    // FA side keeps its script.
    expect(fa).toContain("آیکون برنامه از تم پشتیبانی می‌کند.");
    expect(fa).toContain("جدید:");
  });

  it("unwraps inline markdown links and emphasis for plain-text stores", () => {
    const { en } = formatStoreDescriptions(
      `### New\n\n- See [the guide](https://metto.ir/welcome) for **details**.\n\n#### فارسی\n\n### جدید\n\n- راهنما را ببینید.\n`,
    );
    expect(en).toBe(`New:\n\n- See the guide (https://metto.ir/welcome) for details.`);
    expect(en).not.toContain("**");
    expect(en).not.toContain("](");
  });

  it("never drops unknown hand-edited content (routes by script)", () => {
    const { en, fa } = formatStoreDescriptions(
      `### New\n\n- Ship it.\n\n### Release admin\n\nInternal rollout note.\n\n#### فارسی\n\n### جدید\n\n- ارسال شد.\n`,
    );
    expect(en).toContain("Release admin:");
    expect(en).toContain("Internal rollout note.");
    expect(fa).toContain("- ارسال شد.");
  });

  it("writes exact store-description bytes to out-dir files", () => {
    const dir = mkdtempSync(join(tmpdir(), "myket-out-"));
    const { enPath, faPath } = writeStoreDescriptionFiles(dir, "v0.1.0", {
      en: "New:\n\n- Ship it.",
      fa: "جدید:\n\n- ارسال شد.",
    });
    expect(storeDescriptionFilenames("v0.1.0")).toEqual({
      en: "store-descriptions-v0.1.0.en.txt",
      fa: "store-descriptions-v0.1.0.fa.txt",
    });
    expect(readFileSync(enPath, "utf8")).toBe("New:\n\n- Ship it.\n");
    expect(readFileSync(faPath, "utf8")).toBe("جدید:\n\n- ارسال شد.\n");
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
    ["Approved", true],
    ["تایید شده", true],
    ["SomethingNew", false],
  ])("status %s -> proceed=%s", (status, proceed) => {
    expect(decideMyketAction(status as string).proceed).toBe(proceed);
  });

  it("aborts WaitingForApproval with manual instructions", () => {
    const d = decideMyketAction("WaitingForApproval");
    expect(d.proceed).toBe(false);
    expect(d.reason).toMatch(/WaitingForApproval/);
  });

  it("maps live-observed Persian statuses to their designed branches", () => {
    // تایید شده seen on the v0.7.6 run; پیش‌نویس seen once our PUT+upload
    // materialized a draft.
    expect(normalizeMyketStatus("تایید شده")).toBe("Approved");
    expect(normalizeMyketStatus("پیش‌نویس")).toBe("JustCreated");
    expect(decideMyketAction("پیش‌نویس").proceed).toBe(true);
    expect(decideMyketAction("پیش‌نویس").reason).toMatch(/JustCreated/);
  });

  it("leaves unmapped statuses to fail-safe abort", () => {
    expect(normalizeMyketStatus("SomethingNew")).toBe("SomethingNew");
    expect(normalizeMyketStatus(null)).toBe("");
    const d = decideMyketAction("SomethingNew");
    expect(d.proceed).toBe(false);
    expect(d.reason).toMatch(/unknown bundle status/);
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

  it("proceeds past Approved to create a new entry (live listing untouched)", () => {
    const d = decideMyketAction("Approved");
    expect(d.proceed).toBe(true);
    expect(d.reason).toMatch(/new bundle entry/);
  });
});

describe("myket-publish.mjs post-upload verification + downgrade guard", () => {
  const entry = (title: string, status: string, codes: unknown[] = []) => ({
    title,
    status,
    createdAt: "2026-10-03T00:00:00Z",
    id: "e",
    versions: codes.map((versionCode) => ({ versionCode })),
  });
  // Live shape observed on the v0.7.6 runs: Myket titles auto-created drafts
  // itself ("CD - …"), so identity is proven by versionCode, not title.
  const live076 = () => ({
    releases: [
      { ...entry("0.7.3", "تایید شده", [7003]), createdAt: "2026-10-03T00:00:00Z" },
      { ...entry("CD - ۱۴۰۵/۰۷/۱۲ ۱۱:۰۱:۰۱", "پیش‌نویس", [7006]), createdAt: "2026-10-04T00:00:00Z" },
    ],
  });

  it("accepts our versionCode inside a Myket-titled draft (live shape)", () => {
    const cur = assertOurReleasePresent(live076(), { title: "metto v0.7.6", versionCode: 7006 });
    expect(cur?.status).toBe("پیش‌نویس");
  });

  it("prefers the title match when several entries carry the code", () => {
    const list = {
      releases: [entry("CD - other", "JustCreated", [7006]), entry("metto v0.7.6", "JustCreated", [7006])],
    };
    expect(assertOurReleasePresent(list, { title: "metto v0.7.6", versionCode: 7006 })?.title).toBe(
      "metto v0.7.6",
    );
  });

  it("rejects when no entry carries our versionCode", () => {
    expect(() =>
      assertOurReleasePresent({ releases: [entry("0.7.3", "X", [7003])] }, {
        title: "metto v0.7.6",
        versionCode: 7006,
      }),
    ).toThrow(/no bundle carries versionCode 7006/);
    expect(() => assertOurReleasePresent({ releases: [] }, { title: "metto v0.7.6" })).toThrow(
      /no bundle carries versionCode null/,
    );
  });

  it("rejects when our code lives only inside review/live entries", () => {
    for (const s of ["WaitingForApproval", "Approved"]) {
      expect(() =>
        assertOurReleasePresent({ releases: [entry("0.7.3", s, [7006])] }, {
          title: "metto v0.7.6",
          versionCode: 7006,
        }),
      ).toThrow(/refusing to submit/);
    }
  });

  it("rejects an entry whose versions lack our code", () => {
    expect(() =>
      assertOurReleasePresent({ releases: [entry("metto v0.7.6", "JustCreated", [7003])] }, {
        title: "metto v0.7.6",
        versionCode: 7006,
      }),
    ).toThrow(/no bundle carries versionCode 7006/);
  });

  it("finds the max versionCode across releases", () => {
    expect(
      maxVersionCodeFromList({
        releases: [
          { versions: [{ versionCode: 7003 }, { versionCode: "7004" }] },
          { versions: [{ versionCode: 7006 }] },
          {},
        ],
      }),
    ).toBe(7006);
    expect(maxVersionCodeFromList({ releases: [] })).toBeNull();
    expect(maxVersionCodeFromList({})).toBeNull();
  });

    it("allows re-submitting the identical build, refuses older ones", () => {

    const listJson = { releases: [{ versions: [{ versionCode: 7003 }] }] };
    expect(assertNoDowngrade({ tag: "v0.7.6", versionCode: 7006, listJson })).toBe(7003);
    expect(assertNoDowngrade({ tag: "v0.7.3", versionCode: 7003, listJson })).toBe(7003);
    expect(() => assertNoDowngrade({ tag: "v0.7.2", versionCode: 7002, listJson })).toThrow(
      /below store max versionCode 7003/,
    );
  });

  it("classifies upload failures: already-staged continues to verify, no-draft and fatal abort", () => {
    // Seen live: re-uploading the already-registered 7006.
    expect(classifyUploadError(new Error("Myket APK upload failed (RepeatedVersionCode): …")).kind).toBe(
      "already-staged",
    );
    expect(classifyUploadError(new Error("… ReleaseNotFound …")).kind).toBe("no-draft");
    expect(classifyUploadError(new Error("socket connection was closed")).kind).toBe("fatal");
    expect(classifyUploadError("plain string failure").kind).toBe("fatal");
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
    const outDir = mkdtempSync(join(tmpdir(), "myket-dry-"));
    const r = dryRun(["--tag", "v0.1.0", "--apk", apk, "--changelog", changelog, "--out-dir", outDir, "--dry-run"]);
    expect(r.status).toBe(0);
    expect(r.out).toContain("dry-run");
    expect(r.out).toContain("ir.metto.app");
    expect(r.out).toContain("/release-bundle/upload");
    expect(r.out).toContain("/release-bundle/commit");
    expect(r.out).toContain("no network, no token required");
    // Exact store bytes are printed and written for review/paste.
    expect(r.out).toContain("New:");
    expect(r.out).toContain("جدید:");
    expect(r.out).not.toContain("###");
    expect(readFileSync(join(outDir, "store-descriptions-v0.1.0.en.txt"), "utf8")).toContain("New:");
    expect(readFileSync(join(outDir, "store-descriptions-v0.1.0.fa.txt"), "utf8")).toContain("جدید:");
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
