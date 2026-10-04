#!/usr/bin/env node
// Shared bilingual (English + Persian) release-notes helpers.
//
// Single source of truth for:
//   - scripts/check-release-notes.mjs      (PR-body CI check)
//   - scripts/prepare-changelog.mjs        (release-prep aggregation)
//   - scripts/extract-changelog-section.mjs (GitHub Release body)
//
// Pure functions, Node builtins only — no dependencies, no LLM, deterministic.
//
// PR snippet contract (see AGENTS.md):
//
//   ## Release notes
//   Category: New               <- optional; New | Improvement | Fix
//   ### English
//   - ...
//   ### فارسی
//   - ...
//
// …or, for internal-only PRs, a line containing exactly:
//
//   Release notes: none

// Canonical groups in render order. "Uncategorized" is the neutral/default
// bucket for snippets without a Category — a human sorts them during review.
export const GROUP_ORDER = ["New", "Improvement", "Fix", "Uncategorized"];

export const GROUP_HEADINGS_EN = {
  New: "### New",
  Improvement: "### Improvements",
  Fix: "### Fixes",
  Uncategorized: "### Uncategorized",
};

export const GROUP_HEADINGS_FA = {
  New: "### جدید",
  Improvement: "### بهبودها",
  Fix: "### رفع مشکلات",
  Uncategorized: "### بدون دسته‌بندی",
};

// Legacy bilingual headings (pre-split format, see issue #102). Kept for
// backward-compatible parsing of existing CHANGELOG sections — new sections
// always emit the full-split shape (whole EN listing, then whole FA listing).
// Never emit these; match them when reading.
export const GROUP_HEADINGS = {
  New: "### New / جدید",
  Improvement: "### Improvements / بهبودها",
  Fix: "### Fixes / رفع مشکلات",
  Uncategorized: "### Uncategorized / بدون دسته‌بندی",
};

export const FA_SUBHEADING = "#### فارسی";

const EN_HEADING_GROUP = new Map(Object.entries(GROUP_HEADINGS_EN).map(([g, h]) => [h, g]));
const FA_HEADING_GROUP = new Map(Object.entries(GROUP_HEADINGS_FA).map(([g, h]) => [h, g]));
const LEGACY_HEADING_GROUP = new Map(Object.entries(GROUP_HEADINGS).map(([g, h]) => [h, g]));

/**
 * Classify a `###` group heading line. Returns { group, lang } with lang one
 * of "en" | "fa" | "legacy", or null when the line is no known group heading.
 * Used to accept older section shapes while emitting only the full-split one.
 */
export function groupForHeading(line) {
  const t = String(line ?? "").trim();
  if (EN_HEADING_GROUP.has(t)) return { group: EN_HEADING_GROUP.get(t), lang: "en" };
  if (FA_HEADING_GROUP.has(t)) return { group: FA_HEADING_GROUP.get(t), lang: "fa" };
  if (LEGACY_HEADING_GROUP.has(t)) return { group: LEGACY_HEADING_GROUP.get(t), lang: "legacy" };
  return null;
}

// Accepted Category values (case-insensitive). A small fixed alias map —
// deterministic normalization, never prose interpretation.
const CATEGORY_ALIASES = new Map([
  ["new", "New"],
  ["improvement", "Improvement"],
  ["improvements", "Improvement"],
  ["fix", "Fix"],
  ["fixes", "Fix"],
  ["bugfix", "Fix"],
  ["bug fix", "Fix"],
]);

export const VALID_CATEGORY_LABELS = ["New", "Improvement", "Fix"];

const NONE_MARKER_RE = /^\*{0,2}\s*release notes\s*:\s*none\s*\*{0,2}\s*$/im;
const SECTION_HEADING_RE = /^#{2,3}\s*release notes\s*:?\s*$/im;
// A level-1 or level-2 markdown heading ends the release-notes section;
// deeper headings (### English, ### فارسی, #### فارسی) are part of it.
const SECTION_END_RE = /^#{1,2}(?:\s|$)/;
const ANY_HEADING_RE = /^\s*#{1,6}\s/;
const EN_HEADING_RE = /^#{2,4}\s*english\s*$/im;
const FA_HEADING_RE = /^#{2,4}\s*(?:فارسی|persian)\s*$/im;
const CATEGORY_RE = /^\*{0,2}\s*category\s*\*{0,2}\s*:\s*(.+?)\s*$/im;
const BULLET_RE = /^\s*[-*]\s+(.*)$/;
// Template scaffolding / empty bullets must not count as real content.
const PLACEHOLDER_RE = /^(?:\.\.\.|…|TODO\b.*|TBD\b.*|<[^>]*>)$/i;
const TRAILING_REF_RE = /\s*\(#\d+\)\s*$/;

export function normalizeCategory(raw) {
  if (raw == null) return null;
  return CATEGORY_ALIASES.get(String(raw).trim().toLowerCase()) ?? null;
}

function splitLines(text) {
  return String(text ?? "").replace(/\r\n/g, "\n").split("\n");
}

function collectBullets(lines) {
  const bullets = [];
  for (const line of lines) {
    const m = BULLET_RE.exec(line);
    if (!m) continue;
    const item = m[1].trim();
    if (!item || PLACEHOLDER_RE.test(item)) continue;
    bullets.push(item);
  }
  return bullets;
}

function countWords(items) {
  return items.join(" ").split(/\s+/).filter(Boolean).length;
}

/**
 * Parse a PR body. Returns:
 * {
 *   hasNoneMarker: boolean,
 *   section: null | {
 *     categoryRaw: string | null, category: "New"|"Improvement"|"Fix"|null,
 *     english: string[], persian: string[],
 *   }
 * }
 */
export function parseReleaseNotes(body) {
  const text = String(body ?? "");
  const hasNoneMarker = NONE_MARKER_RE.test(text);
  const lines = splitLines(text);
  const headIdx = lines.findIndex((l) => SECTION_HEADING_RE.test(l));
  if (headIdx === -1) return { hasNoneMarker, section: null };

  // Section runs until the next level-1/2 heading (a new top-level section) or EOF.
  let endIdx = lines.length;
  for (let i = headIdx + 1; i < lines.length; i++) {
    if (SECTION_END_RE.test(lines[i].trim())) {
      endIdx = i;
      break;
    }
  }
  const slice = lines.slice(headIdx + 1, endIdx);

  let categoryRaw = null;
  for (const line of slice) {
    if (ANY_HEADING_RE.test(line)) break; // category must precede subsections
    const m = CATEGORY_RE.exec(line);
    if (m) {
      categoryRaw = m[1].trim();
      break;
    }
  }

  const enIdx = slice.findIndex((l) => EN_HEADING_RE.test(l));
  const faIdx = slice.findIndex((l) => FA_HEADING_RE.test(l));

  const bulletsAfter = (start) => {
    if (start === -1) return [];
    let end = slice.length;
    for (let i = start + 1; i < slice.length; i++) {
      if (ANY_HEADING_RE.test(slice[i])) {
        end = i;
        break;
      }
    }
    return collectBullets(slice.slice(start + 1, end));
  };

  const english = bulletsAfter(enIdx);
  const persian = bulletsAfter(faIdx);

  return {
    hasNoneMarker,
    section: {
      categoryRaw,
      category: normalizeCategory(categoryRaw),
      english,
      persian,
    },
  };
}

/**
 * Validate a PR body against the contract.
 * { ok, kind: "notes"|"none"|"missing", errors[], warnings[], parsed }
 */
export function validateReleaseNotes(body) {
  const errors = [];
  const warnings = [];
  const parsed = parseReleaseNotes(body);
  const { hasNoneMarker, section } = parsed;
  const realBullets = section ? section.english.length + section.persian.length : 0;

  if (hasNoneMarker && realBullets > 0) {
    errors.push(
      'Ambiguous PR body: it contains both "Release notes: none" and release-note bullets. Keep exactly one.',
    );
    return { ok: false, kind: "missing", errors, warnings, parsed };
  }
  if (hasNoneMarker) {
    return { ok: true, kind: "none", errors, warnings, parsed };
  }
  if (!section) {
    errors.push(
      'Missing bilingual release notes. Add a "## Release notes" section with "### English" and "### فارسی" bullets, or exactly "Release notes: none" for internal-only changes. See AGENTS.md.',
    );
    return { ok: false, kind: "missing", errors, warnings, parsed };
  }
  if (section.categoryRaw !== null && section.category === null) {
    errors.push(
      `Invalid Category ${JSON.stringify(section.categoryRaw)}. Use one of: ${VALID_CATEGORY_LABELS.join(", ")}. Omit the line if unsure — the entry goes to Uncategorized for human review.`,
    );
  }
  if (section.english.length === 0) {
    errors.push(
      'Empty "### English" release notes. Add 1–3 short plain-language bullets (placeholder "- ..." does not count).',
    );
  }
  if (section.persian.length === 0) {
    errors.push(
      'Empty "### فارسی" release notes. Add 1–3 short plain-language bullets in Persian (placeholder "- ..." does not count).',
    );
  }
  for (const [label, items] of [
    ["English", section.english],
    ["Persian", section.persian],
  ]) {
    const words = countWords(items);
    if (words > 60) {
      warnings.push(`${label} release notes are ~${words} words (keep roughly ≤ 60).`);
    }
    if (items.length > 3) {
      warnings.push(`${label} release notes have ${items.length} bullets (keep roughly 1–3).`);
    }
  }
  return {
    ok: errors.length === 0,
    kind: "notes",
    errors,
    warnings,
    parsed,
  };
}

/**
 * Select the in-range commit SHAs from paginated GitHub compare results.
 *
 * `pages` is an array of pages, each an array of compare `.commits` entries
 * (`{ sha, ... }`), newest first. Status/count validation is strict:
 *   - "identical" is valid only with ahead_by === 0 and behind_by === 0.
 *   - "ahead" is valid only with ahead_by > 0 and behind_by === 0.
 *   - "behind", "diverged", unknown statuses, or inconsistent counts throw.
 *   - A missing/malformed first page throws — never read as an empty range.
 *   - An "ahead" range that yields zero commits throws (truncated response).
 *
 * SHAs are deduplicated defensively. Throws on anything unexpected so the
 * caller aborts instead of producing a partial changelog.
 */
export function selectCompareCommits({ status, aheadBy = 0, behindBy = 0, pages = [] }) {
  const name = status === undefined || status === null ? "(missing)" : JSON.stringify(String(status));
  const ahead = Number(aheadBy);
  const behind = Number(behindBy);
  if (status === "identical") {
    if (ahead !== 0 || behind !== 0) {
      throw new Error(
        `inconsistent compare result (status identical with ahead_by=${aheadBy} behind_by=${behindBy}) — aborting, no partial changelog`,
      );
    }
    return [];
  }
  if (status !== "ahead" || !(ahead > 0) || behind !== 0) {
    throw new Error(
      `cannot determine a clean compare range (status: ${name}, ahead_by=${aheadBy}, behind_by=${behindBy}) — aborting, no partial changelog`,
    );
  }
  if (!Array.isArray(pages) || pages.length === 0 || !Array.isArray(pages[0])) {
    throw new Error("missing first compare page — aborting rather than assuming an empty range");
  }
  const seen = new Set();
  const ordered = [];
  for (const page of pages) {
    if (!Array.isArray(page)) {
      throw new Error("malformed compare page — aborting, no partial changelog");
    }
    for (const entry of page) {
      const sha = String(entry?.sha ?? "").trim();
      if (!sha || seen.has(sha)) continue;
      seen.add(sha);
      ordered.push(sha);
    }
  }
  if (ordered.length === 0) {
    throw new Error("compare reports ahead commits but returned none — aborting, no partial changelog");
  }
  return ordered;
}

/**
 * Select the merged PRs represented by commits in a PREV_TAG..BASE range.
 *
 * Pure ancestry-based selection — commit/PR timestamps are never consulted:
 *   - commits: SHAs returned by the GitHub compare of PREV_TAG...BASE
 *     (i.e. commits reachable from BASE but not from PREV_TAG).
 *   - associations: map of commit SHA -> PR numbers associated with it
 *     (GitHub's commit→pulls association, merge-strategy agnostic:
 *     normal merges, squash merges, and rebases all associate).
 *   - details: map of PR number -> { number, title, body, base, merged }.
 *   - base: release branch name; only PRs merged into it are selected.
 *
 * Returns unique PR detail objects sorted by PR number.
 */
export function selectPrsInRange({ commits = [], associations = {}, details = {}, base = "main" }) {
  const seen = new Map();
  for (const sha of commits) {
    const nums = associations[sha] ?? [];
    for (const n of nums) {
      const d = details[String(n)] ?? details[n];
      if (!d) continue;
      if (d.merged !== true) continue;
      if ((d.base ?? "main") !== base) continue;
      const number = Number(d.number ?? n);
      if (!Number.isInteger(number)) continue;
      if (!seen.has(number)) seen.set(number, { ...d, number });
    }
  }
  return [...seen.values()].sort((a, b) => a.number - b.number);
}

/** Append a "(#NN)" PR reference to a bullet unless already present. */
export function withPrRef(bullet, prNumber) {
  const text = String(bullet).trim();
  if (new RegExp(`\\(#${prNumber}\\)\\s*$`).test(text)) return text;
  return `${text} (#${prNumber})`;
}

function normalizeBulletLine(line) {
  return String(line).trim().replace(/\s+/g, " ").toLowerCase();
}

function bulletIdentity(line) {
  // Identity ignores the trailing "(#NN)" ref so re-runs and light human
  // curation do not produce duplicates.
  return normalizeBulletLine(String(line).replace(TRAILING_REF_RE, ""));
}

function versionHeading(version) {
  return `## [${version}]`;
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Render a full version section in the full-split shape (issue #104): the
 * whole EN listing first, then the whole FA listing. `groups` maps group
 * name -> array of { en: string[], fa: string[], pr: number|null }.
 */
export function renderVersionSection({ version, date, groups }) {
  const out = [`${versionHeading(version)} - ${date}`, ""];
  for (const group of GROUP_ORDER) {
    const items = (groups[group] ?? []).filter((it) => it.en.length + it.fa.length > 0);
    if (items.length === 0) continue;
    const enLines = [];
    for (const item of items) {
      for (const b of item.en) enLines.push(`- ${item.pr ? withPrRef(b, item.pr) : b}`);
    }
    if (enLines.length > 0) out.push(GROUP_HEADINGS_EN[group], "", ...enLines, "");
  }
  let faAny = false;
  for (const group of GROUP_ORDER) {
    const items = (groups[group] ?? []).filter((it) => it.en.length + it.fa.length > 0);
    if (items.length === 0) continue;
    const faLines = [];
    for (const item of items) {
      for (const b of item.fa) faLines.push(`- ${item.pr ? withPrRef(b, item.pr) : b}`);
    }
    if (faLines.length === 0) continue;
    if (!faAny) {
      out.push(FA_SUBHEADING, "");
      faAny = true;
    }
    out.push(GROUP_HEADINGS_FA[group], "", ...faLines, "");
  }
  // Trim trailing blank lines, ensure single trailing newline handled by caller.
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  return out.join("\n") + "\n";
}

/**
 * Parse a version-section body (the `## [version]` heading line excluded)
 * into { intro, groups, unknown }.
 *
 * - intro: non-heading prose before the first group heading (kept verbatim,
 *   re-emitted at the top of the EN region).
 * - groups: Map group -> { en: string[], fa: string[] } with verbatim bullet
 *   lines, in first-appearance order within each side.
 * - unknown: [{ heading: string|null, lines: string[] }] for content under
 *   unrecognized `###` headings (or before any group); re-emitted verbatim
 *   after the FA region so normalize never drops content. The pipeline only
 *   emits known headings, so this is strictly a hand-edit safety net.
 *
 * Accepts the full-split shape (#104), the interleaved per-group shape
 * (#103), and legacy bilingual headings (#102): an EN or legacy heading
 * opens/switches to that group's EN side, `#### فارسی` switches to the same
 * group's FA side, an FA heading opens that group's FA side.
 */
export function parseSectionGroups(body) {
  const groups = new Map(GROUP_ORDER.map((g) => [g, { en: [], fa: [] }]));
  const intro = [];
  const unknown = [];
  let currentUnknown = null;
  let ctx = null; // { group, lang } | null
  let lastGroup = null;
  let seenGroup = false;

  const bulletTo = (line) => {
    if (ctx) {
      groups.get(ctx.group)[ctx.lang].push(line);
    } else if (currentUnknown) {
      currentUnknown.lines.push(line);
    } else if (!seenGroup) {
      intro.push(line);
    } else {
      currentUnknown = { heading: null, lines: [line] };
      unknown.push(currentUnknown);
    }
  };

  for (const line of splitLines(body)) {
    const t = line.trim();
    if (t === "") continue;
    if (t === FA_SUBHEADING) {
      if (lastGroup) {
        ctx = { group: lastGroup, lang: "fa" };
        currentUnknown = null;
      } else {
        ctx = null;
        currentUnknown = { heading: null, lines: [] };
        unknown.push(currentUnknown);
      }
      continue;
    }
    const known = /^\s*###\s/.test(line) ? groupForHeading(line) : null;
    if (known) {
      seenGroup = true;
      currentUnknown = null;
      lastGroup = known.group;
      ctx = { group: known.group, lang: known.lang === "fa" ? "fa" : "en" };
      continue;
    }
    if (/^\s*#{1,6}\s/.test(line)) {
      // Unrecognized heading: preserved verbatim via the unknown bucket
      // (re-emitted after the FA region). The pipeline only emits known
      // headings, so this is strictly a hand-edit safety net.
      seenGroup = true;
      ctx = null;
      currentUnknown = { heading: line, lines: [] };
      unknown.push(currentUnknown);
      continue;
    }
    const m = BULLET_RE.exec(line);
    if (m && m[1].trim()) {
      bulletTo(line);
      continue;
    }
    // Non-bullet prose: intro before the first group, otherwise kept with
    // the current side so content is never dropped.
    if (!seenGroup && !ctx) {
      intro.push(line);
    } else {
      bulletTo(line);
    }
  }
  return { intro, groups, unknown };
}

/** Re-emit parsed section content in the canonical full-split shape. */
function emitParsedGroups({ intro, groups, unknown }) {
  const out = [];
  if (intro.length > 0) out.push(...intro, "");
  for (const group of GROUP_ORDER) {
    const en = groups.get(group)?.en ?? [];
    if (en.length === 0) continue;
    out.push(GROUP_HEADINGS_EN[group], "", ...en, "");
  }
  const faGroups = GROUP_ORDER.filter((g) => (groups.get(g)?.fa ?? []).length > 0);
  if (faGroups.length > 0) {
    out.push(FA_SUBHEADING, "");
    for (const group of faGroups) {
      out.push(GROUP_HEADINGS_FA[group], "", ...groups.get(group).fa, "");
    }
  }
  for (const block of unknown) {
    if (block.heading) out.push(block.heading, "");
    if (block.lines.length > 0) out.push(...block.lines, "");
  }
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  return out;
}

/**
 * Normalize any accepted section body (full-split, interleaved, legacy) to
 * the canonical full-split shape. Lossless: unknown content is preserved.
 */
export function normalizeSectionBody(body) {
  return emitParsedGroups(parseSectionGroups(body)).join("\n").trim() + "\n";
}

/**
 * Extract the body of a `## [version]` section (heading line excluded).
 * Returns the trimmed body string, or null when absent.
 */
export function extractChangelogSection(changelogText, version) {
  const lines = splitLines(changelogText);
  const headRe = new RegExp(`^##\\s*\\[${escapeRegExp(version)}\\]`);
  const headIdx = lines.findIndex((l) => headRe.test(l));
  if (headIdx === -1) return null;
  let endIdx = lines.length;
  for (let i = headIdx + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) {
      endIdx = i;
      break;
    }
  }
  return lines.slice(headIdx + 1, endIdx).join("\n").trim() + "\n";
}

/**
 * Merge rendered entries into CHANGELOG text (idempotent).
 * `items`: [{ group, en, fa, pr }] with raw bullet strings.
 * Returns { text, added }.
 */
export function mergeIntoChangelog(changelogText, { version, date, items }) {
  const groupOf = (item) =>
    item.group && GROUP_ORDER.includes(item.group) ? item.group : "Uncategorized";

  // Desired bullet lines per group.
  const desired = new Map(GROUP_ORDER.map((g) => [g, []]));
  for (const item of items) {
    const g = groupOf(item);
    for (const b of item.en) desired.get(g).push({ line: `- ${item.pr ? withPrRef(b, item.pr) : b}`, lang: "en" });
    for (const b of item.fa) desired.get(g).push({ line: `- ${item.pr ? withPrRef(b, item.pr) : b}`, lang: "fa" });
  }

  const lines = splitLines(changelogText);
  const headRe = new RegExp(`^##\\s*\\[${escapeRegExp(version)}\\]`);
  let headIdx = lines.findIndex((l) => headRe.test(l));

  if (headIdx === -1) {
    // Fresh section: render whole block and insert after [Unreleased].
    const groups = {};
    for (const g of GROUP_ORDER) {
      groups[g] = [];
    }
    for (const item of items) {
      groups[groupOf(item)].push({ en: item.en, fa: item.fa, pr: item.pr });
    }
    const section = renderVersionSection({ version, date, groups });
    const unreleasedIdx = lines.findIndex((l) => /^##\s*\[Unreleased\]/i.test(l));
    let insertAt = lines.length;
    if (unreleasedIdx !== -1) {
      insertAt = lines.length;
      for (let i = unreleasedIdx + 1; i < lines.length; i++) {
        if (/^##\s/.test(lines[i])) {
          insertAt = i;
          break;
        }
      }
    }
    const before = lines.slice(0, insertAt).join("\n").replace(/\s+$/, "");
    const after = lines.slice(insertAt).join("\n").replace(/^\s+/, "");
    const added = [...desired.values()].reduce((n, arr) => n + arr.length, 0);
    const text = [before, "", section.trimEnd(), "", after].filter((p, i, a) => !(p === "" && a[i - 1] === "")).join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
    return { text, added };
  }

  // Existing section: parse (accepting older shapes), append only bullets
  // not already present, and re-emit in the canonical full-split shape.
  let endIdx = lines.length;
  for (let i = headIdx + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) {
      endIdx = i;
      break;
    }
  }
  const parsed = parseSectionGroups(lines.slice(headIdx + 1, endIdx).join("\n"));
  const existing = new Set();
  for (const g of GROUP_ORDER) {
    for (const side of ["en", "fa"]) {
      for (const l of parsed.groups.get(g)[side]) existing.add(bulletIdentity(l));
    }
  }
  for (const block of parsed.unknown) {
    for (const l of block.lines) {
      const m = BULLET_RE.exec(l);
      if (m && m[1].trim()) existing.add(bulletIdentity(l));
    }
  }

  let added = 0;
  for (const g of GROUP_ORDER) {
    for (const d of desired.get(g)) {
      if (existing.has(bulletIdentity(d.line))) continue;
      parsed.groups.get(g)[d.lang].push(d.line);
      existing.add(bulletIdentity(d.line));
      added += 1;
    }
  }

  const section = [lines[headIdx], "", ...emitParsedGroups(parsed)];
  const next = [...lines.slice(0, headIdx), ...section, ...lines.slice(endIdx)];
  return { text: next.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n", added };
}
