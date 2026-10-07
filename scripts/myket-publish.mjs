#!/usr/bin/env node
// Myket CD publisher (Server-to-Server only).
//
// Consumes the immutable GitHub Release APK produced by android-release.yml
// and publishes it to Myket as a second Android distribution target.
// Never part of the Android build itself.
//
// Flow (per https://myket.ir/kb/pages/developer-cd/):
//   1. PUT  /api/partners/applications/{package}/release-bundle        (create/update)
//   2. PUT  /api/partners/applications/{package}/release-bundle/upload (APK only)
//   3. POST /api/partners/applications/{package}/release-bundle/commit (submit for review)
//
// Auth: X-Access-Token header from the MYKET_ACCESS_TOKEN secret, which lives
// only in the protected `myket-release` GitHub Environment. Never printed,
// never committed, never exposed to pull-request workflows.
//
// Safety:
//   - GitHub Release is the source of truth; this script never deletes it.
//   - A bundle currently under review (WaitingForApproval) is never touched —
//     abort with manual instructions (the API itself rejects edits there).
//   - The "current bundle" (latest by createdAt) gate is not sufficient: the
//     v0.7.9 run showed latest=Approved while the PUT still failed with
//     EditNotPossible because ANOTHER entry was under review. So every entry
//     is scanned for review state before the PUT, and an EditNotPossible PUT
//     failure is re-marked the same way. Both paths throw with the
//     MYKET_UNDER_REVIEW marker so the workflow can turn this known waiting
//     state green-with-instructions instead of red.
//   - Flow is PUT → upload → verify → commit. The commit (the only step that
//     sends anything for review) fires only after OUR entry is positively
//     proven by our versionCode outside any review/live state. An Approved
//     live listing therefore cannot be submitted or overwritten by this
//     script; the worst case is an uncommitted draft row.
//   - --dry-run performs zero Myket mutations and needs no token.
//
// Node builtins only (plus global fetch/FormData/Blob on Node 22).
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { androidVersionFromTag } from "./android-version.mjs";
import { extractChangelogSection, formatStoreDescriptions } from "./release-notes.mjs";

export const MYKET_BASE_URL_DEFAULT = "https://developer.myket.ir";
export const MYKET_PACKAGE_DEFAULT = "ir.metto.app";
export const MAX_APK_BYTES = 500 * 1024 * 1024; // Myket rejects files larger than 500MB.
export const TAG_RE = /^v([0-9]+)\.([0-9]+)\.([0-9]+)$/;
export const PACKAGE_RE = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;
export const MYKET_STATUSES = ["JustCreated", "WaitingForApproval", "Rejected", "Approved", "RolledBack"];

/**
 * Machine-readable marker for the "a version is under Myket review" waiting
 * state. The workflow greps publish output for this marker: marked failures
 * become a green job with an action-needed summary (publish/revert in the
 * panel, then retry) instead of a red failure. Unmarked failures stay red.
 */
export const MYKET_UNDER_REVIEW_MARKER = "MYKET_UNDER_REVIEW";

export function isUnderReviewError(err) {
  return String(err?.message ?? err).includes(MYKET_UNDER_REVIEW_MARKER);
}

/**
 * Documented Myket endpoints. NOTE: the official doc page currently shows the
 * commit URL as `developer.myket.i/apir/...` (missing "r", wrong path). That
 * is a typo — every other endpoint on the same page uses
 * `developer.myket.ir/api/...`, so we use the corrected /api/ form here.
 */
export function myketEndpoints(baseUrl, packageName) {
  const base = String(baseUrl ?? MYKET_BASE_URL_DEFAULT).replace(/\/+$/, "");
  const pkg = String(packageName ?? MYKET_PACKAGE_DEFAULT).trim();
  return {
    list: `${base}/api/partners/applications/${pkg}/release-bundle`,
    bundle: `${base}/api/partners/applications/${pkg}/release-bundle`,
    upload: `${base}/api/partners/applications/${pkg}/release-bundle/upload`,
    commit: `${base}/api/partners/applications/${pkg}/release-bundle/commit`,
  };
}

export function validatePackageId(pkg) {
  const v = String(pkg ?? "").trim();
  if (!PACKAGE_RE.test(v)) throw new Error(`invalid package id ${JSON.stringify(pkg)}`);
  return v;
}

export function validateRolloutPercent(raw) {
  const n = Number(String(raw ?? "").trim());
  if (!Number.isInteger(n) || n < 1 || n > 100) {
    throw new Error(`rollout percent must be an integer 1..100 (got ${JSON.stringify(raw)})`);
  }
  return n;
}

export function validateTag(tag) {
  // Single source of truth for strict semver + versionCode bounds.
  const { versionName, versionCode } = androidVersionFromTag(tag);
  return { tag: String(tag).trim(), versionName, versionCode };
}

export function bundleTitleForTag(tag) {
  return `metto ${String(tag).trim()}`;
}

export function commitMessageForTag(tag) {
  return `Metto Android release ${String(tag).trim()}`;
}

/**
 * Safety-net guard for the Myket EN description field: Myket's EN validator
 * rejects Persian/Arabic-script characters. Since issue #102 the changelog
 * source emits split headings (EN `### New`, FA `### جدید`), so the EN side
 * arrives clean by construction — this stays as defense in depth (e.g. a
 * stray Persian word in an English bullet) and for pre-split sections.
 * The FA side is never passed through here.
 */
const ARABIC_SCRIPT_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;

export function sanitizeEnForMyket(text) {
  return String(text ?? "")
    .split("\n")
    .map((line) =>
      line
        .replace(ARABIC_SCRIPT_RE, "")
        .replace(/\s+\/\s*$/, "")
        .replace(/[ \t]{2,}/g, " ")
        .trimEnd(),
    )
    .join("\n");
}

// File names for the exact store-description bytes (review + manual paste to
// Bazaar/Play). Written by main() in every run (dry-run included).
export function storeDescriptionFilenames(tag) {
  const t = String(tag).trim();
  return { en: `store-descriptions-${t}.en.txt`, fa: `store-descriptions-${t}.fa.txt` };
}

export function writeStoreDescriptionFiles(outDir, tag, { en, fa }) {
  mkdirSync(outDir, { recursive: true });
  const names = storeDescriptionFilenames(tag);
  const enPath = join(outDir, names.en);
  const faPath = join(outDir, names.fa);
  writeFileSync(enPath, String(en).trim() + "\n", "utf8");
  writeFileSync(faPath, String(fa).trim() + "\n", "utf8");
  return { enPath, faPath };
}

/**
 * Split an extracted CHANGELOG section body into Myket EN/FA descriptions.
 *
 * Stores render descriptions as plain text (no markdown), so both sides go
 * through formatStoreDescriptions: plain `New:` / `جدید:` headings, `- `
 * dash bullets, trailing `(#NN)` PR refs stripped, inline markdown
 * unwrapped. The `#### فارسی` marker never reaches a store.
 * Sends the COMPLETE section content; never truncates (no documented Myket
 * length limit exists today — if Myket later returns a length validation
 * error, add an explicit evidence-based limit then, not now).
 * Older section shapes (interleaved groups, legacy bilingual headings) are
 * accepted via parseSectionGroups.
 * Falls back to the non-empty side when one side is missing; throws when
 * both are empty. The EN side passes through sanitizeEnForMyket as a guard
 * (Myket's EN validator rejects Persian/Arabic-script characters).
 */
export function splitMyketDescriptions(sectionBody) {
  const text = String(sectionBody ?? "");
  if (!text.trim()) throw new Error("empty changelog section (no EN/FA descriptions to derive)");
  const { en: plainEn, fa: plainFa } = formatStoreDescriptions(text);
  const en = sanitizeEnForMyket(plainEn).replace(/\n{3,}/g, "\n\n").trim();
  const faRaw = plainFa.replace(/\n{3,}/g, "\n\n").trim();
  if (!en && !faRaw) throw new Error("empty changelog section (no EN/FA descriptions to derive)");
  return { en: en || faRaw, fa: faRaw || en };
}

export function buildReleaseBundlePayload({ title, rolloutPercent, enDescription, faDescription }) {
  const en = String(enDescription ?? "").trim();
  const fa = String(faDescription ?? "").trim();
  if (!String(title ?? "").trim()) throw new Error("bundle title is required");
  if (!en) throw new Error("English description is required");
  if (!fa) throw new Error("Persian description is required");
  return {
    title: String(title).trim(),
    stagedRolloutPercent: validateRolloutPercent(rolloutPercent),
    translationInfos: [
      { description: en, language: "en" },
      { description: fa, language: "fa" },
    ],
  };
}

export function buildCommitPayload({ message, isManualPublish = true }) {
  if (!String(message ?? "").trim()) throw new Error("commit message is required");
  return { isManualPublish: Boolean(isManualPublish), message: String(message).trim() };
}

/**
 * Build the APK upload multipart body.
 *
 * Reproduces the documented Myket request literally:
 *   --form '=@"test.apk"'
 * i.e. an EMPTY multipart field name carrying the APK file. Do NOT invent a
 * field name such as `file` or `apk` — the doc shows an empty name.
 */
export function buildUploadFormData(apkBytes, filename) {
  const name = String(filename ?? "").trim() || "app.apk";
  const bytes = apkBytes instanceof Uint8Array ? apkBytes : new Uint8Array(apkBytes);
  const blob = new Blob([bytes], { type: "application/vnd.android.package-archive" });
  const form = new FormData();
  form.append("", blob, basename(name));
  return form;
}

/** Pick the current bundle (latest by createdAt) from a GET list response. */
export function getCurrentBundleFromList(json) {
  const releases = json?.releases;
  if (!Array.isArray(releases) || releases.length === 0) return null;
  const sorted = [...releases].sort((a, b) => String(b?.createdAt ?? "").localeCompare(String(a?.createdAt ?? "")));
  const cur = sorted[0];
  if (!cur || !cur.status) return null;
  return { status: String(cur.status), title: cur.title ?? null, id: cur.id ?? null, count: releases.length };
}

/**
 * Every bundle entry currently under Myket review (normalized status).
 *
 * Myket rejects edits while ANY entry is under review — not just the latest
 * one. Observed live on the v0.7.9 run: latest was Approved ("تایید شده")
 * so the current-bundle gate proceeded, but the PUT failed with
 * EditNotPossible because another entry was under review.
 */
export function findReviewEntries(json) {
  const releases = Array.isArray(json?.releases) ? json.releases : [];
  return releases.filter((r) => normalizeMyketStatus(r?.status) === "WaitingForApproval");
}

/**
 * Normalize a Myket bundle status to its English API code.
 *
 * The API has been observed returning Persian display strings (v0.7.6 run:
 * "تایید شده" for Approved; later "پیش‌نویس" for a fresh draft). Only mappings proven
 * by live API responses belong here — never guess a mapping, because a
 * wrong proceed=true mapping could overwrite a live release. Anything
 * unmapped still aborts via the default branch below (fail-safe).
 */
export function normalizeMyketStatus(status) {
  const s = String(status ?? "").trim();
  if (s === "تایید شده") return "Approved"; // observed live on the v0.7.6 run
  if (s === "پیش‌نویس") return "JustCreated"; // observed live: API-created draft
  return s;
}

/**
 * Classify an APK upload failure. Observed live on the v0.7.6 runs:
 * - RepeatedVersionCode: the build's versionCode is already registered
 *   (e.g. an earlier run uploaded it). Not fatal: the flow continues to
 *   post-upload verification, which still gates the commit — if the code
 *   is only in a review/live entry (or nowhere committable), we abort.
 * - ReleaseNotFound: no draft exists for the upload to attach to — the
 *   human must create the draft in the panel first (draft only).
 */
export function classifyUploadError(err) {
  const message = String(err?.message ?? err);
  if (message.includes("RepeatedVersionCode")) return { kind: "already-staged", message };
  if (message.includes("ReleaseNotFound")) return { kind: "no-draft", message };
  return { kind: "fatal", message };
}

/**
 * Highest versionCode across every version of every bundle in a GET list
 * response. Returns null when no versions exist (nothing to downgrade from).
 */
export function maxVersionCodeFromList(json) {
  const releases = json?.releases;
  if (!Array.isArray(releases)) return null;
  let max = null;
  for (const r of releases) {
    const versions = r?.versions;
    if (!Array.isArray(versions)) continue;
    for (const v of versions) {
      const n = Number(v?.versionCode);
      if (Number.isInteger(n) && n > 0 && (max === null || n > max)) max = n;
    }
  }
  return max;
}

/**
 * Refuse to submit an older build over a newer store listing. Equal codes
 * are allowed: re-submitting the identical build (e.g. retrying after an
 * aborted run that already uploaded) is idempotent, not a downgrade.
 */
export function assertNoDowngrade({ tag, versionCode, listJson }) {
  const max = maxVersionCodeFromList(listJson);
  if (max !== null && versionCode < max) {
    throw new Error(
      `refusing to submit ${tag} (versionCode ${versionCode}) below store max versionCode ${max} — tag a newer version instead`,
    );
  }
  return max;
}

/**
 * Post-upload verification: OUR uploaded build must be present as a
 * committable entry. Identity key is OUR versionCode inside versions[],
 * searched across ALL releases with no createdAt ordering assumptions —
 * Myket titles auto-created drafts itself (e.g. "CD - …") and may ignore
 * our title, so title is only a preference, never the key.
 *
 * A match inside a review/live entry is refused outright. No match means
 * the upload landed nowhere committable: abort before commit (an
 * uncommitted draft row is reversible, never published, never submitted).
 *
 * @param {{ releases?: Array<{ title?: unknown, status?: unknown, versions?: Array<{ versionCode?: unknown }> }> }} listJson
 * @param {{ title: string, versionCode?: number | string | null }} [opts]
 */
export function assertOurReleasePresent(listJson, { title, versionCode = null } = {}) {
  const releases = Array.isArray(listJson?.releases) ? listJson.releases : [];
  const code = versionCode === null || versionCode === undefined ? null : Number(versionCode);
  const carrying =
    code === null
      ? []
      : releases.filter(
          (r) => Array.isArray(r?.versions) && r.versions.some((v) => Number(v?.versionCode) === code),
        );
  if (carrying.length === 0) {
    throw new Error(
      `verification failed: no bundle carries versionCode ${code} after upload — Myket staged nothing committable. Create the draft version in the Myket panel (APK + changelog, save as draft only), then retry`,
    );
  }
  const eligible = carrying.filter((r) => {
    const st = normalizeMyketStatus(r?.status);
    return st !== "WaitingForApproval" && st !== "Approved";
  });
  if (eligible.length === 0) {
    const only = carrying[0];
    throw new Error(
      `verification failed: versionCode ${code} is only present inside ${only?.status} entry ${JSON.stringify(only?.title)} — refusing to submit a review/live entry`,
    );
  }
  const ours = eligible.find((r) => r?.title === title) ?? eligible[0];
  if (ours?.title !== title) {
    console.log(
      `myket-publish: note: committing draft titled ${JSON.stringify(ours?.title)} (Myket-titled; identity proven by versionCode ${code})`,
    );
  }
  return ours;
}

/**
 * Safety gate around the current bundle status. A bundle under review must
 * never be touched. Status is normalized first (the API emits Persian
 * display strings). An Approved bundle proceeds: the flow verifies OUR
 * entry by versionCode after upload and only then commits, so the
 * live listing can never be submitted or overwritten by this script.
 */
export function decideMyketAction(status) {
  const normalized = normalizeMyketStatus(status);
  if (normalized === "") {
    return { proceed: true, reason: "no current bundle — create normally" };
  }
  switch (normalized) {
    case "JustCreated":
      return { proceed: true, reason: "JustCreated bundle exists — update it and continue" };
    case "Rejected":
      return { proceed: true, reason: "Rejected bundle exists — update/re-upload and re-commit" };
    case "RolledBack":
      return { proceed: true, reason: "RolledBack bundle exists — update/re-upload and re-commit" };
    case "WaitingForApproval":
      return {
        proceed: false,
        reason:
          "a bundle is WaitingForApproval (under Myket review) — refusing to overwrite. Publish or revert it manually in the Myket panel, then retry.",
      };
    case "Approved":
      return {
        proceed: true,
        reason:
          "an Approved bundle exists — attempting PUT for a new bundle entry for this title (verified by versionCode after upload, before commit; the reviewed release itself is never modified)",
      };
    default:
      return {
        proceed: false,
        reason: `unknown bundle status ${JSON.stringify(status)}${normalized !== String(status ?? "").trim() ? ` (normalized: ${JSON.stringify(normalized)})` : ""} — refusing to proceed blindly. Inspect GET /release-bundle and handle manually.`,
      };
  }
}

function usage() {
  console.log(
    [
      "Usage: myket-publish.mjs --tag vX.Y.Z --apk <path> [options]",
      "",
      "  --tag <vX.Y.Z>        strict semver tag (required)",
      "  --apk <path>          signed release APK from the GitHub Release (required)",
      "  --package <id>        default ir.metto.app",
      "  --rollout <1..100>    staged rollout percent, default 100",
      "  --changelog <path>    default CHANGELOG.md",
      "  --base-url <url>      default https://developer.myket.ir",
      "  --out-dir <dir>       where store-description .txt files go, default dist",
      "  --dry-run             validate only; performs zero Myket network mutations, needs no token",
      "                        (prints both descriptions and writes the .txt files for review/paste)",
      "  --help                this help",
      "",
      "Env (non-dry-run only): MYKET_ACCESS_TOKEN (X-Access-Token header, never printed).",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  const out = {
    tag: null,
    apk: null,
    package: MYKET_PACKAGE_DEFAULT,
    rollout: "100",
    changelog: resolve(process.cwd(), "CHANGELOG.md"),
    baseUrl: MYKET_BASE_URL_DEFAULT,
    outDir: resolve(process.cwd(), "dist"),
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v == null || v.startsWith("--")) throw new Error(`missing value for ${a}`);
      i++;
      return v;
    };
    if (a === "--tag") out.tag = next();
    else if (a === "--apk") out.apk = next();
    else if (a === "--package") out.package = next();
    else if (a === "--rollout") out.rollout = next();
    else if (a === "--changelog") out.changelog = resolve(process.cwd(), next());
    else if (a === "--base-url") out.baseUrl = next();
    else if (a === "--out-dir") out.outDir = resolve(process.cwd(), next());
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--help" || a === "-h") {
      usage();
      process.exit(0);
    } else throw new Error(`unknown argument ${JSON.stringify(a)} (see --help)`);
  }
  return out;
}

function readChangelogSection(changelogPath, tag) {
  let text;
  try {
    text = readFileSync(changelogPath, "utf8");
  } catch (err) {
    throw new Error(`cannot read changelog ${changelogPath}: ${err.message}`);
  }
  const body = extractChangelogSection(text, tag);
  if (!body || !body.trim()) {
    throw new Error(
      `no "## [${tag}]" section with content in ${changelogPath}. Run prepare-changelog, review, and merge before tagging.`,
    );
  }
  return body;
}

function validateApk(apkPath) {
  let st;
  try {
    st = statSync(apkPath);
  } catch {
    throw new Error(`APK not found: ${apkPath} (download the exact signed APK from the GitHub Release)`);
  }
  if (!st.isFile() || st.size === 0) throw new Error(`APK is empty: ${apkPath}`);
  if (st.size > MAX_APK_BYTES) {
    throw new Error(`APK is ${st.size} bytes — Myket rejects files larger than 500MB; upload via the panel instead`);
  }
  return st;
}

async function readJsonSafe(res) {
  const text = await res.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text.slice(0, 500) };
  }
}

function authHeaders(token, json = false) {
  const h = { "X-Access-Token": token };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

async function myketGetList(endpoints, token) {
  const res = await fetch(endpoints.list, { method: "GET", headers: authHeaders(token) });
  if (res.status === 401) {
    throw new Error("Myket GET release-bundle: 401 — token invalid or application not owned by this account. Check MYKET_ACCESS_TOKEN and panel ownership.");
  }
  const json = await readJsonSafe(res);
  if (!res.ok) {
    throw new Error(`Myket GET release-bundle failed: HTTP ${res.status} ${JSON.stringify(json)?.slice(0, 300)}`);
  }
  return json;
}

async function myketPutBundle(endpoints, token, payload) {
  const res = await fetch(endpoints.bundle, {
    method: "PUT",
    headers: authHeaders(token, true),
    body: JSON.stringify(payload),
  });
  const json = await readJsonSafe(res);
  if (res.status === 401) {
    throw new Error("Myket PUT release-bundle: 401 — token invalid or application not owned by this account.");
  }
  if (!res.ok || json?.code === 400) {
    const code = json?.messageCode ?? `HTTP ${res.status}`;
    const hint =
      code === "EditNotPossible"
        ? "a version is under review — publish/revert it manually first, then retry"
        : code === "MissingRequiredData"
          ? "required bundle data missing — check title/descriptions/rollout"
          : code === "UploadReleaseVersionFailed"
            ? "no uploadable version present — the APK upload step must succeed first"
            : "see messageCode above";
    const message = `Myket PUT release-bundle failed (${code}): ${json?.translatedMessage ?? ""} — ${hint}`.trim();
    // Known waiting state, not a bug: mark it so the workflow can go green
    // with manual instructions instead of failing red.
    if (code === "EditNotPossible") throw new Error(`${MYKET_UNDER_REVIEW_MARKER}: ${message}`);
    throw new Error(message);
  }
  return json;
}

async function myketUploadApk(endpoints, token, apkPath, filename) {
  const bytes = readFileSync(apkPath);
  const form = buildUploadFormData(bytes, filename);
  const res = await fetch(endpoints.upload, { method: "PUT", headers: authHeaders(token), body: form });
  const json = await readJsonSafe(res);
  if (res.status === 401) {
    throw new Error("Myket APK upload: 401 — token invalid or application not owned by this account.");
  }
  if (!res.ok) {
    const code = json?.messageCode ?? `HTTP ${res.status}`;
    throw new Error(`Myket APK upload failed (${code}): ${json?.translatedMessage ?? JSON.stringify(json)?.slice(0, 300)}`);
  }
  if (json && json.resultCode !== undefined && json.resultCode !== "Successful") {
    throw new Error(`Myket APK upload: unexpected resultCode ${JSON.stringify(json.resultCode)}`);
  }
  return json;
}

async function myketCommit(endpoints, token, payload) {
  const res = await fetch(endpoints.commit, {
    method: "POST",
    headers: authHeaders(token, true),
    body: JSON.stringify(payload),
  });
  const json = await readJsonSafe(res);
  if (res.status === 401) {
    throw new Error("Myket commit: 401 — token invalid or application not owned by this account.");
  }
  if (!res.ok) {
    throw new Error(`Myket commit failed: HTTP ${res.status} ${JSON.stringify(json)?.slice(0, 300)}`);
  }
  return json;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.tag) throw new Error("missing --tag vX.Y.Z (see --help)");
  if (!opts.apk) throw new Error("missing --apk <path> (see --help)");

  const { tag, versionName, versionCode } = validateTag(opts.tag);
  const packageId = validatePackageId(opts.package);
  const rollout = validateRolloutPercent(opts.rollout);
  const apkPath = resolve(process.cwd(), opts.apk);
  const apkStat = validateApk(apkPath);
  const section = readChangelogSection(opts.changelog, tag);
  const { en, fa } = splitMyketDescriptions(section);
  const title = bundleTitleForTag(tag);
  const bundlePayload = buildReleaseBundlePayload({ title, rolloutPercent: rollout, enDescription: en, faDescription: fa });
  const commitPayload = buildCommitPayload({ message: commitMessageForTag(tag), isManualPublish: true });
  const endpoints = myketEndpoints(opts.baseUrl, packageId);
  const apkFilename = basename(apkPath);
  // Exact store-description bytes for review + manual Bazaar/Play paste.
  // Written before any network call, in dry-run and live runs alike.
  const { enPath, faPath } = writeStoreDescriptionFiles(opts.outDir, tag, { en, fa });

  if (opts.dryRun) {
    console.log(`myket-publish dry-run: tag=${tag} versionName=${versionName} versionCode=${versionCode}`);
    console.log(`  package=${packageId} rollout=${rollout} apk=${apkPath} (${apkStat.size} bytes, file=${apkFilename})`);
    console.log(`  endpoints:`);
    console.log(`    list/commit-source: ${endpoints.list}`);
    console.log(`    bundle (PUT):       ${endpoints.bundle}`);
    console.log(`    upload (PUT APK):   ${endpoints.upload}`);
    console.log(`    commit (POST):      ${endpoints.commit}`);
    console.log(`  bundle title: ${JSON.stringify(title)}`);
    console.log(`  commit: ${JSON.stringify(commitPayload)}`);
    console.log(`  en chars=${en.length} fa chars=${fa.length} (full section, no truncation)`);
    console.log(`  wrote: ${enPath}`);
    console.log(`  wrote: ${faPath}`);
    console.log("  --- EN description (exact bytes) ---");
    console.log(en);
    console.log("  --- FA description (exact bytes) ---");
    console.log(fa);
    console.log("myket-publish dry-run: OK (no network, no token required)");
    return;
  }

  const token = String(process.env.MYKET_ACCESS_TOKEN ?? "");
  if (!token) {
    throw new Error("MYKET_ACCESS_TOKEN is empty. Add it to the protected `myket-release` GitHub Environment (never commit it).");
  }

  console.log(`myket-publish: tag=${tag} package=${packageId} rollout=${rollout} apk=${apkFilename} (${apkStat.size} bytes)`);
  console.log(`myket-publish: store descriptions: en chars=${en.length} fa chars=${fa.length} (files: ${enPath}, ${faPath})`);

  const list = await myketGetList(endpoints, token);
  const current = getCurrentBundleFromList(list);
  console.log(`myket-publish: current bundle status=${current?.status ?? "(none)"} title=${JSON.stringify(current?.title ?? null)}${current ? ` (releases=${current.count})` : ""}`);
  const decision = decideMyketAction(current?.status ?? null);
  if (!decision.proceed) {
    const marker = normalizeMyketStatus(current?.status) === "WaitingForApproval" ? `${MYKET_UNDER_REVIEW_MARKER}: ` : "";
    throw new Error(`${marker}myket-publish aborted: ${decision.reason}`);
  }
  console.log(`myket-publish: status gate: ${decision.reason}`);
  // The current-bundle gate only sees the latest entry, but Myket blocks
  // edits while ANY entry is under review (v0.7.9 run: latest was Approved
  // yet PUT failed with EditNotPossible). Refuse early with instructions.
  const reviewEntries = findReviewEntries(list);
  if (reviewEntries.length > 0) {
    const titles = reviewEntries.map((r) => JSON.stringify(r?.title ?? r?.id ?? "?")).join(", ");
    throw new Error(
      `${MYKET_UNDER_REVIEW_MARKER}: ${reviewEntries.length} bundle(s) under Myket review (${titles}) — publish or revert them manually in the Myket panel, then retry with the same tag`,
    );
  }
  assertNoDowngrade({ tag, versionCode, listJson: list });

  await myketPutBundle(endpoints, token, bundlePayload);
  console.log("myket-publish: bundle create/update: OK");
  try {
    await myketUploadApk(endpoints, token, apkPath, apkFilename);
    console.log("myket-publish: APK upload: OK (resultCode Successful)");
  } catch (err) {
    const c = classifyUploadError(err);
    if (c.kind === "already-staged") {
      console.log(
        `myket-publish: note: upload reports RepeatedVersionCode — build ${versionCode} is already registered; verifying what is staged before commit`,
      );
    } else if (c.kind === "no-draft") {
      throw new Error(
        `${c.message} — no draft bundle exists for the upload to attach to. Create the draft version in the Myket panel (APK + changelog, save as draft only), then retry`,
      );
    } else {
      throw err;
    }
  }
  const afterUpload = await myketGetList(endpoints, token);
  const ours = assertOurReleasePresent(afterUpload, { title, versionCode });
  console.log(
    `myket-publish: verified our entry: title=${JSON.stringify(ours.title)} status=${ours.status} versionCode=${versionCode} — safe to commit`,
  );
  await myketCommit(endpoints, token, commitPayload);
  console.log(`myket-publish: commit: OK (isManualPublish=true — finalize manually in Myket after approval)`);
}

const isMain = process.argv[1] === new URL(import.meta.url).pathname;
if (isMain) {
  main().catch((err) => {
    console.error(`myket-publish: ${err?.message ?? err}`);
    process.exit(1);
  });
}
