#!/usr/bin/env node
// Offline-only gate for the private candidate artifact; never approves it.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "data/previews/mashhad");
const read = (name) => readFileSync(join(root, name));
const manifest = JSON.parse(read("manifest.json"));
if (manifest.schemaVersion !== 1 || manifest.cityId !== "mashhad" ||
    manifest.reviewOnly !== true || manifest.releaseStatus !== "candidate" || manifest.timing !== "none" ||
    manifest.repository !== "https://github.com/aliinreallife/metto-data" || !/^[a-f0-9]{40}$/.test(manifest.commit) ||
    JSON.stringify(manifest.visibleLineIds) !== JSON.stringify(["mashhad:line:1", "mashhad:line:2"])) {
  throw new Error("Unexpected city preview source or release policy");
}
const files = ["graph.json", "lines.json", "meta.json", "stations.json"];
if (JSON.stringify(Object.keys(manifest.files).sort()) !== JSON.stringify(files)) throw new Error("Preview file inventory changed");
for (const name of files) {
  const bytes = read(name);
  const hash = createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])).digest("hex");
  if (hash !== manifest.files[name]?.gitBlobSha1) throw new Error(`City preview hash mismatch: ${name}`);
}
const meta = JSON.parse(read("meta.json"));
if (meta.cityId !== "mashhad" || meta.releaseStatus !== "candidate") throw new Error("Candidate preview status changed");
// Separate source reports are pinned to upstream, not certified facilities.
const reports = manifest.reportedAmenitiesSource;
if (reports?.file !== "upstream-stations.json" || reports.verification !== "unverified" ||
    reports.repository !== meta.upstream.repository || reports.commit !== meta.upstream.commit || reports.path !== "data/stations.json") {
  throw new Error("Unexpected reported amenities source");
}
const reportBytes = read(reports.file);
const reportHash = createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${reportBytes.length}\0`), reportBytes])).digest("hex");
if (reportHash !== reports.gitBlobSha1) throw new Error("Reported amenities source hash mismatch");
const reportData = JSON.parse(reportBytes);
for (const station of JSON.parse(read("stations.json"))) {
  if (!reportData[station.sourceKeys.upstreamKey] || station.amenitiesVerified !== false ||
      Object.values(station.amenities).some(value => value !== null)) throw new Error("Source reports must remain separate from canonical unknown amenities");
}
const link = (from, to) => ({ stationId: "mashhad:station:shariati", fromLineId: `mashhad:line:${from}`, toLineId: `mashhad:line:${to}` });
if (JSON.stringify(manifest.transferLinks) !== JSON.stringify([link(1, 2), link(2, 1)])) throw new Error("Preview interchange scope changed");
console.log("city preview: pinned candidate verified; Lines 1/2 only; no timing capability or production approval");
