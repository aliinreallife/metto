// Offline, explicit release import. No fetching or upstream code execution.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const source = process.argv[2];
if (!source) throw Error('Usage: node scripts/import-isfahan-service.mjs /path/to/metto-data');
const bytes = readFileSync(resolve(source, 'data/releases/isfahan-line1.json'));
const data = JSON.parse(bytes);
const graph = JSON.parse(readFileSync(new URL('../data/reference/isfahan-candidate-preview.json', import.meta.url)));
if (data.cityId !== 'isfahan' || data.release.productionAuthorized !== true ||
    data.release.graphSha256 !== graph.source.reportSha256 || data.release.conditionalDispatchesIncluded !== false ||
    data.trips.length !== 278 || data.stationIds.length !== 20) throw Error('Invalid Isfahan release scope');
writeFileSync(new URL('../data/reference/isfahan-service.json', import.meta.url), bytes);
writeFileSync(new URL('../data/reference/isfahan-service-source.json', import.meta.url), JSON.stringify({
  repository: 'aliinreallife/metto-data', commit: execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], {encoding:'utf8'}).trim(),
  path: 'data/releases/isfahan-line1.json', sha256: createHash('sha256').update(bytes).digest('hex'),
}, null, 2) + '\n');
