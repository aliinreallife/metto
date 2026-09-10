#!/usr/bin/env node
// Server-only daily holiday refresh for Metto's offline dataset.
//
// Normal mode (default): checks today + next 7 Tehran dates (8 upstream
// requests/day total, regardless of user count). Compares against
// public/holidays.json, preserves last-known-good on any failure, and
// publishes a new patch version ONLY when holiday information changes.
//
//   TIMESTAMP_IR_API_KEY=... pnpm holidays:sync
//
// Backfill mode (manual, separate): --backfill [--from YYYY-MM-DD]
// [--days N] [--max N]. Respects the ~200/day provider limit with a
// configurable ceiling (default 190, hard cap 190). Persists a cursor in
// data/.holidays-backfill.json, refuses concurrent runs via lockfile.
//
// The upstream API key never leaves the server (never bundled, never logged).
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toJalaali } from "jalaali-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATASET_PATH = path.join(ROOT, "public", "holidays.json");
const VERSION_PATH = path.join(ROOT, "public", "holidays.version.json");
const CURSOR_PATH = path.join(ROOT, "data", ".holidays-backfill.json");
const LOCK_PATH = path.join(ROOT, "data", ".holidays-backfill.lock");

const TIMESTAMP_BASE = "https://api.timestamp.ir/v1/events";
const FETCH_TIMEOUT_MS = 10_000;
const BACKFILL_HARD_CAP = 190;

const tehranDateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tehran",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function tehranDateStr(ms) {
  return tehranDateFmt.format(new Date(ms));
}

/** Next 8 distinct Tehran calendar dates starting today (6h stepping). */
function tehranWeekDates(nowMs) {
  const dates = [];
  let cursor = nowMs;
  const guard = 8 * 5; // > enough 6h steps for 8 days incl. DST
  for (let i = 0; i < guard && dates.length < 8; i++) {
    const d = tehranDateStr(cursor);
    if (dates[dates.length - 1] !== d) dates.push(d);
    cursor += 6 * 3_600_000;
  }
  return dates;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function gregorianToJalali(gregorianDate) {
  const [y, m, d] = gregorianDate.split("-").map(Number);
  const { jy, jm, jd } = toJalaali(y, m, d);
  return `${jy}-${pad2(jm)}-${pad2(jd)}`;
}

function isRecord(v) {
  if (typeof v !== "object" || v === null) return false;
  const e = v;
  return (
    typeof e.jalali_date === "string" &&
    typeof e.gregorian_date === "string" &&
    typeof e.is_holiday === "boolean"
  );
}

/** Strict: only is_holiday === true counts (titles/categories never do). */
function parseDayResponse(raw) {
  if (
    typeof raw !== "object" ||
    raw === null ||
    raw.success !== true ||
    !Array.isArray(raw.events)
  ) {
    return { ok: false, error: "malformed-or-unsuccessful-response" };
  }
  const holidayEvents = [];
  for (const e of raw.events) {
    if (!isRecord(e)) return { ok: false, error: "malformed-event" };
    if (e.is_holiday === true) {
      if (typeof e.id !== "string" || typeof e.title !== "string") {
        return { ok: false, error: "malformed-holiday-event" };
      }
      holidayEvents.push({
        id: e.id,
        title: e.title,
        jalaliDate: e.jalali_date,
        gregorianDate: e.gregorian_date,
      });
    }
  }
  return { ok: true, isHoliday: holidayEvents.length > 0, holidayEvents };
}

async function fetchDay(jalaliDate, apiKey) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${TIMESTAMP_BASE}?date=${encodeURIComponent(jalaliDate)}`,
      { headers: { "X-API-Key": apiKey }, cache: "no-store", signal: ctrl.signal },
    );
    if (!res.ok) return { ok: false, error: `http-${res.status}` };
    let raw;
    try {
      raw = await res.json();
    } catch {
      return { ok: false, error: "invalid-json" };
    }
    return parseDayResponse(raw);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? `fetch-error:${err.name}` : "fetch-error" };
  } finally {
    clearTimeout(t);
  }
}

function loadDataset() {
  const raw = JSON.parse(readFileSync(DATASET_PATH, "utf8"));
  if (!raw || typeof raw !== "object" || typeof raw.records !== "object") {
    throw new Error("holidays.json is malformed");
  }
  return raw;
}

/** Atomic publish: tmp + rename so clients never read half-written JSON. */
function publishDataset(dataset) {
  const tmp = `${DATASET_PATH}.tmp`;
  writeFileSync(tmp, JSON.stringify(dataset));
  renameSync(tmp, DATASET_PATH);
  const versionDoc = {
    version: dataset.version,
    lastSuccessfulSync: dataset.lastSuccessfulSync,
    validThrough: dataset.validThrough,
    coverage: dataset.coverage,
  };
  const vtmp = `${VERSION_PATH}.tmp`;
  writeFileSync(vtmp, JSON.stringify(versionDoc));
  renameSync(vtmp, VERSION_PATH);
}

function bumpPatch(version) {
  const m = /^(\d+\.\d+\.)(\d+)$/.exec(version);
  if (m) return `${m[1]}${Number(m[2]) + 1}`;
  return `${version}.1`;
}

function addDays(gregorianDate, n) {
  const [y, m, d] = gregorianDate.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d) + n * 86_400_000;
  const dt = new Date(ms);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const backfill = args.has("--backfill");
  const apiKey = process.env.TIMESTAMP_IR_API_KEY;
  if (!apiKey) {
    console.error("Holiday sync\n\nMissing TIMESTAMP_IR_API_KEY — refusing to run.");
    process.exit(1);
  }

  let targets;
  if (backfill) {
    // Manual backfill: sequential dates with a persisted cursor + lockfile.
    if (existsSync(LOCK_PATH)) {
      console.error("Holiday sync\n\nBackfill lock exists (another run in progress?) — aborting.");
      process.exit(1);
    }
    const getArg = (name, fallback) => {
      const pref = `${name}=`;
      for (const a of process.argv.slice(2)) if (a.startsWith(pref)) return a.slice(pref.length);
      return fallback;
    };
    const max = Math.min(Number(getArg("--max", BACKFILL_HARD_CAP)) || BACKFILL_HARD_CAP, BACKFILL_HARD_CAP);
    let cursor = getArg("--from", null);
    try {
      if (!cursor && existsSync(CURSOR_PATH)) {
        cursor = JSON.parse(readFileSync(CURSOR_PATH, "utf8")).nextDate ?? null;
      }
    } catch { cursor = null; }
    if (!cursor) cursor = tehranDateStr(Date.now());
    const days = Math.min(Number(getArg("--days", max)) || max, max);
    targets = [];
    for (let i = 0; i < days; i++) targets.push(cursor), (cursor = addDays(cursor, 1));
    mkdirSync(path.dirname(LOCK_PATH), { recursive: true });
    writeFileSync(LOCK_PATH, String(process.pid));
    process.on("exit", () => { try { rmSync(LOCK_PATH, { force: true }); } catch {} });
  } else {
    targets = tehranWeekDates(Date.now());
  }

  const dataset = loadDataset();
  const syncedAt = new Date().toISOString();
  let successful = 0;
  let failed = 0;
  let changed = 0;
  const failures = [];

  for (const gregorianDate of targets) {
    const jalaliDate = gregorianToJalali(gregorianDate);
    const result = await fetchDay(jalaliDate, apiKey);
    if (!result.ok) {
      // Failure preserves last-known-good: no write, no demotion.
      failed++;
      failures.push(`${gregorianDate} (${result.error})`);
      continue;
    }
    successful++;
    const existing = dataset.records[gregorianDate];
    if (result.isHoliday) {
      const title = result.holidayEvents[0]?.title ?? "";
      if (!existing || existing.state !== "holiday") {
        changed++;
        dataset.records[gregorianDate] = {
          gregorianDate,
          jalaliDate,
          state: "holiday",
          // Baseline official dates keep their kind; newly announced
          // closures arrive here as exceptional (never invented locally).
          kind: existing?.kind === "official" ? "official" : "exceptional_closure",
          ...(title ? { faName: title } : {}),
          source: "timestamp.ir",
          checkedAt: syncedAt,
        };
      } else if (title && existing.faName !== title) {
        changed++;
        existing.faName = title;
        existing.checkedAt = syncedAt;
      } else {
        existing.checkedAt = syncedAt;
      }
    } else {
      // Verified normal day — but NEVER demote a baseline official holiday
      // on an empty API response (provider gaps must not erase the annual
      // calendar).
      if (existing?.kind === "official" && existing.state === "holiday") {
        existing.checkedAt = syncedAt;
      } else if (!existing || existing.state !== "non-holiday") {
        changed++;
        dataset.records[gregorianDate] = {
          gregorianDate,
          jalaliDate,
          state: "non-holiday",
          kind: "unknown",
          source: "timestamp.ir",
          checkedAt: syncedAt,
        };
      } else {
        existing.checkedAt = syncedAt;
      }
    }
  }

  // Prune stale verified-normal records (past dates); holidays are kept.
  const today = tehranDateStr(Date.now());
  for (const [key, rec] of Object.entries(dataset.records)) {
    if (rec && rec.state === "non-holiday" && key < today) delete dataset.records[key];
  }

  let updated = false;
  if (changed > 0) {
    dataset.version = bumpPatch(dataset.version);
    dataset.lastSuccessfulSync = syncedAt;
    publishDataset(dataset);
    updated = true;
  } else if (successful > 0) {
    // No content change → version stays identical (no spurious notify).
    dataset.lastSuccessfulSync = syncedAt;
    publishDataset(dataset);
  }

  if (backfill) {
    const last = targets[targets.length - 1];
    mkdirSync(path.dirname(CURSOR_PATH), { recursive: true });
    writeFileSync(CURSOR_PATH, JSON.stringify({ nextDate: addDays(last, 1), updatedAt: syncedAt }));
    try { rmSync(LOCK_PATH, { force: true }); } catch {}
  }

  console.log(
    [
      "Holiday sync",
      "",
      `Mode: ${backfill ? "backfill" : "daily (today + next 7 days)"}`,
      `Dates checked: ${targets.length}`,
      `Successful: ${successful}`,
      `Failed: ${failed}`,
      `Changed: ${changed}`,
      "",
      `Dataset updated: ${updated ? "yes" : "no"}`,
      `Version: ${dataset.version}`,
      failures.length > 0 ? `Failures: ${failures.join("; ")}` : null,
    ]
      .filter((l) => l !== null)
      .join("\n"),
  );
}

main().catch((err) => {
  console.error(`Holiday sync\n\nFatal: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
