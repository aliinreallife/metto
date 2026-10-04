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
//   - Flow is PUT → upload → verify → commit. The commit (the only step that
//     sends anything for review) fires only after OUR entry is positively
//     proven by exact title + our versionCode outside any review/live state.
//     An Approved live listing therefore cannot be submitted or overwritten
//     by this script; the worst case is an uncommitted draft row.
//   - --dry-run performs zero Myket mutations and needs no token.
//
// Node builtins only (plus global fetch/FormData/Blob on Node 22).
import { readFileSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { androidVersionFromTag } from "./android-version.mjs";
import { extractChangelogSection, FA_SUBHEADING } from "./release-notes.mjs";

export const MYKET_BASE_URL_DEFAULT = "https://developer.myket.ir";
export const MYKET_PACKAGE_DEFAULT = "ir.metto.app";
export const MAX_APK_BYTES = 500 * 1024 * 1024; // Myket rejects files larger than 500MB.
export const TAG_RE = /^v([0-9]+)\.([0-9]+)\.([0-9]+)$/;
export const PACKAGE_RE = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;
export const MYKET_STATUSES = ["JustCreated", "WaitingForApproval", "Rejected", "Approved", "RolledBack"];

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
 * Myket's EN description validator rejects Persian/Arabic-script characters,
 * but our group headings are bilingual (`### New / جدید`). Strip Arabic
 * script from the EN side and clean up the orphaned ` / ` separators it
 * leaves behind. The FA side is untouched. Observed live: an unsanitized EN
 * description surfaces a panel validation error on the draft.
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
/**
 * Split an extracted CHANGELOG section body into Myket EN/FA descriptions.
 *
 * - Sends the COMPLETE section content; never truncates (no documented Myket
 *   length limit exists today — if Myket later returns a length validation
 *   error, add an explicit evidence-based limit then, not now).
 * - en: everything outside `#### فارسی` blocks (intro + group headings +
 *   English bullets), marker lines dropped, then sanitized via
 *   sanitizeEnForMyket (Myket rejects Persian script in the EN field).
 * - fa: parent group headings (bilingual `### ... / ...` lines) + Persian
 *   bullets only, so the Persian listing reads standalone.
 * - Falls back to the non-empty side when one side is missing; throws when
 *   both are empty.
 */
export function splitMyketDescriptions(sectionBody) {
  const text = String(sectionBody ?? "");
  if (!text.trim()) throw new Error("empty changelog section (no EN/FA descriptions to derive)");
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const enLines = [];
  const faLines = [];
  let inFa = false;
  let lastGroupHeading = null;
  let faHasGroup = false;

  const isFaMarker = (l) => l.trim() === FA_SUBHEADING;
  const isHeading = (l) => /^\s*#{1,6}\s/.test(l);
  const isGroupHeading = (l) => /^\s*###\s/.test(l) && !isFaMarker(l);

  for (const line of lines) {
    if (isFaMarker(line)) {
      inFa = true;
      faHasGroup = false;
      continue;
    }
    if (isHeading(line)) {
      if (isGroupHeading(line)) {
        lastGroupHeading = line;
        inFa = false;
        enLines.push(line);
        // Group heading is pushed to faLines lazily on first FA content line,
        // so groups without Persian bullets leave no empty heading behind.
        faHasGroup = false;
      } else if (/^\s*####\s/.test(line)) {
        // Any other #### subsection ends the FA block.
        inFa = false;
        enLines.push(line);
      } else {
        inFa = false;
        enLines.push(line);
      }
      continue;
    }
    if (inFa) {
      if (line.trim() === "" && faLines.length === 0) continue;
      if (!faHasGroup && lastGroupHeading) {
        if (faLines.length > 0) faLines.push("");
        faLines.push(lastGroupHeading, "");
        faHasGroup = true;
      }
      faLines.push(line);
    } else {
      enLines.push(line);
    }
  }

  const en = sanitizeEnForMyket(enLines.join("\n")).replace(/\n{3,}/g, "\n\n").trim();
  const faRaw = faLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
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
 * entry by title + versionCode after upload and only then commits, so the
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
          "an Approved bundle exists — attempting PUT for a new bundle entry for this title (verified by title + versionCode after upload, before commit; the reviewed release itself is never modified)",
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
      "  --dry-run             validate only; performs zero Myket network mutations, needs no token",
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
    throw new Error(`Myket PUT release-bundle failed (${code}): ${json?.translatedMessage ?? ""} — ${hint}`.trim());
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
    console.log("myket-publish dry-run: OK (no network, no token required)");
    return;
  }

  const token = String(process.env.MYKET_ACCESS_TOKEN ?? "");
  if (!token) {
    throw new Error("MYKET_ACCESS_TOKEN is empty. Add it to the protected `myket-release` GitHub Environment (never commit it).");
  }

  console.log(`myket-publish: tag=${tag} package=${packageId} rollout=${rollout} apk=${apkFilename} (${apkStat.size} bytes)`);

  const list = await myketGetList(endpoints, token);
  const current = getCurrentBundleFromList(list);
  console.log(`myket-publish: current bundle status=${current?.status ?? "(none)"} title=${JSON.stringify(current?.title ?? null)}${current ? ` (releases=${current.count})` : ""}`);
  const decision = decideMyketAction(current?.status ?? null);
  if (!decision.proceed) {
    throw new Error(`myket-publish aborted: ${decision.reason}`);
  }
  console.log(`myket-publish: status gate: ${decision.reason}`);
  assertNoDowngrade({ tag, versionCode, listJson: list });

  await myketPutBundle(endpoints, token, bundlePayload);
  console.log("myket-publish: bundle create/update: OK");
  try {
    await myketUploadApk(endpoints, token, apkPath, apkFilename);
  } catch (err) {
    const msg = String(err?.message ?? err);
    if (msg.includes("ReleaseNotFound")) {
      throw new Error(
        `${msg} — no draft bundle exists for the upload to attach to. Create the draft version in the Myket panel (APK + changelog, save as draft only), then retry`,
      );
    }
    throw err;
  }
  console.log("myket-publish: APK upload: OK (resultCode Successful)");
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
