#!/usr/bin/env node
// Explicit, offline, reviewed Git-to-Git data refresh; never called by Vercel.
// Source files are read from a Git commit, NOT the working tree.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
function value(flag) {
  const i = argv.indexOf(flag);
  if (i < 0 || !argv[i + 1]) throw new Error(`required: ${flag}`);
  return argv[i + 1];
}
function git(dir, ...args) {
  return execFileSync("git", ["-C", dir, ...args], { maxBuffer: 10 * 1024 * 1024 });
}
if (argv.length !== 4) throw new Error("usage: pnpm metro-data:import --source-dir ../metto-data --revision <40-hex-SHA>");
const source = resolve(value("--source-dir"));
const revision = value("--revision");
if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error("revision must be a complete immutable Git commit SHA");
if (source === root || !existsSync(join(source, ".git"))) throw new Error("source must be a separate metto-data Git repository");
if (git(source, "cat-file", "-t", revision).toString().trim() !== "commit") {
  throw new Error("revision must point to a commit");
}
const repo = git(source, "config", "--get", "remote.origin.url").toString().trim();
if (!/^(?:https:\/\/github\.com\/|git@github\.com:)(?:aliinreallife\/metto-data)(?:\.git)?$/.test(repo)) {
  throw new Error(`unexpected data Git origin: ${repo}`);
}
const names = ["stations.json", "lines.json", "graph.json", "meta.json"];
const contents = {};
for (const name of names) {
  contents[name] = git(source, "show", `${revision}:data/cities/tehran/${name}`);
}
const j = Object.fromEntries(names.map((name) => [
  name, JSON.parse(contents[name].toString("utf8")),
]));
const meta = j["meta.json"];
if (meta.cityId !== "tehran" ||
    (meta.releaseStatus !== undefined && meta.releaseStatus !== "verified") ||
    !/^[a-f0-9]{40}$/.test(meta.upstream?.commit ?? "") ||
    j["stations.json"].length !== 151 || j["lines.json"].length !== 7 ||
    j["graph.json"].routes?.length !== 9 ||
    j["graph.json"].segments?.length !== 163) {
  throw new Error("Tehran release is unapproved, incomplete or incompatible; no files changed");
}
const sid = "tehran:station:shohada-ye-hefdah-e-shahrivar";
const graph = j["graph.json"];
if (graph.routes.find((r) => r.id === "tehran:route:line-6-main")
    ?.stops.find((s) => s.stationId === sid)?.status !== "under_construction" ||
    graph.routes.find((r) => r.id === "tehran:route:line-7-main")
    ?.stops.find((s) => s.stationId === sid)?.status !== "operational" ||
    j["stations.json"].find((s) => s.id === sid)?.status !== "operational") {
  throw new Error("reviewed 17 Shahrivar exception missing; no files changed");
}
const manifestPath = join(root, "data/metto-data/manifest.json");
const previous = JSON.parse(readFileSync(manifestPath, "utf8"));
if (previous.schemaVersion !== 1 || previous.city !== "tehran") {
  throw new Error("invalid existing manifest");
}
const next = {
  ...previous, commit: revision,
  files: Object.fromEntries(names.map((name) => {
    const bytes = contents[name];
    const hash = createHash("sha1")
      .update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]))
      .digest("hex");
    return [name, { gitBlobSha1: hash }];
  })),
};
const dest = join(root, "data/metto-data/tehran");
mkdirSync(dest, { recursive: true });
// Prepare all candidate files before mutating tracked outputs.
const staged = [];
try {
  for (const name of names) {
    const temp = join(dest, `.${name}.import-tmp`);
    writeFileSync(temp, contents[name]);
    staged.push({ temp, target: join(dest, name) });
  }
  const temp = manifestPath + ".import-tmp";
  writeFileSync(temp, JSON.stringify(next, null, 2) + "\n");
  staged.push({ temp, target: manifestPath });
  for (const { temp, target } of staged) renameSync(temp, target);
} finally {
  for (const { temp } of staged) {
    if (existsSync(temp)) unlinkSync(temp);
  }
}
console.log(`metto-data import: pinned Tehran source at ${revision}; run pnpm metro-data:source-check, pnpm typecheck, pnpm test before PR`);
