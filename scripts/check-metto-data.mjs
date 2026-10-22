#!/usr/bin/env node
// Offline release gate: reject any unreviewed dataset, damaged blob or
// accidental Mashhad candidate promotion; do not fetch from GitHub at build.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function fail(message) { throw new Error(`metto-data integrity: ${message}`); }
function read(relative) { return readFileSync(path.join(root, relative)); }
const m = JSON.parse(read("data/metto-data/manifest.json").toString("utf8"));
if (m.schemaVersion !== 1 || m.city !== "tehran" ||
    m.repository !== "https://github.com/aliinreallife/metto-data" ||
    !/^[a-f0-9]{40}$/.test(m.commit) ||
    !m.policy?.line6ShahrivarMettoOverride ||
    JSON.stringify(m.policy?.verifiedCities) !== JSON.stringify(["tehran"]) ||
    JSON.stringify(m.policy?.excludedCandidates) !== JSON.stringify(["mashhad"])) {
  fail("unexpected manifest/provenance/release policy");
}
const names = ["stations.json", "lines.json", "graph.json", "meta.json"];
if (JSON.stringify(Object.keys(m.files).sort()) !== JSON.stringify([...names].sort())) {
  fail("source file inventory changed");
}
const json = {};
for (const name of names) {
  const bytes = read("data/metto-data/tehran/" + name);
  const gitObject = Buffer.concat([
    Buffer.from(`blob ${bytes.length}\0`), bytes,
  ]);
  const sha = createHash("sha1").update(gitObject).digest("hex");
  if (!/^[a-f0-9]{40}$/.test(m.files[name]?.gitBlobSha1 ?? "") ||
      sha !== m.files[name].gitBlobSha1) fail(`hash mismatch: ${name}`);
  json[name] = JSON.parse(bytes.toString("utf8"));
}
const { "stations.json": stations, "lines.json": lines,
        "graph.json": graph, "meta.json": meta } = json;
if (meta.cityId !== "tehran" || meta.upstream?.commit !==
      "bcf474e17f29a53684bd02229e73bcaa06c4f37d" ||
    (meta.releaseStatus !== undefined && meta.releaseStatus !== "verified")) {
  fail("Tehran source metadata unrecognized or unverified");
}
if (stations.length !== 151 || lines.length !== 7 || graph.routes.length !== 9 ||
    graph.segments.length !== 163 || graph.transfers.length !== 2) {
  fail("unexpected Tehran network dimensions");
}
const sid = "tehran:station:shohada-ye-hefdah-e-shahrivar";
const getStop = (line) => graph.routes
  .find((r) => r.id === `tehran:route:line-${line}-main`)
  ?.stops.find((s) => s.stationId === sid)?.status;
const through = graph.segments.filter((s) =>
  s.lineId === "tehran:line:6" && (s.from === sid || s.to === sid));
if (getStop(6) !== "under_construction" || getStop(7) !== "operational" ||
    stations.find((s) => s.id === sid)?.status !== "operational" ||
    through.length !== 2 || through.some((s) => s.status !== "operational")) {
  fail("17 Shahrivar Metto boarding / track exception lost");
}
console.log("metto-data: pinned Tehran provenance, policy and hashes verified");
