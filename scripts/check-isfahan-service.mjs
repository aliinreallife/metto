import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const read = name => readFileSync(new URL('../data/reference/' + name, import.meta.url));
const bytes = read('isfahan-service.json');
const data = JSON.parse(bytes), source = JSON.parse(read('isfahan-service-source.json'));
const graph = JSON.parse(read('isfahan-candidate-preview.json'));
if (createHash('sha256').update(bytes).digest('hex') !== source.sha256 || !/^[a-f0-9]{40}$/.test(source.commit) ||
    data.release.productionAuthorized !== true || data.release.graphSha256 !== graph.source.reportSha256 ||
    data.release.conditionalDispatchesIncluded !== false || data.calendar.nonFridayHolidayRule.operatorVerified !== false ||
    data.trips.length !== 278 || JSON.stringify(data.stationIds) !== JSON.stringify(graph.stations.map(s => s.id))) throw Error('Stale or invalid Isfahan release');
const seen = new Set();
for (const trip of data.trips) {
  if (seen.has(trip.id) || trip.times.length !== 20 || !['qods_to_defa','defa_to_qods'].includes(trip.direction) ||
      !['friday','saturday_thursday'].includes(trip.serviceId)) throw Error('Invalid Isfahan trip identity');
  seen.add(trip.id);
  const times = trip.direction === 'qods_to_defa' ? trip.times : [...trip.times].reverse();
  let last = -1;
  for (const value of times) {
    if (value === null) continue;
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) throw Error('Invalid Isfahan clock');
    const [h,m] = value.split(':').map(Number), minute = h*60+m;
    if (minute < last) throw Error('Backwards Isfahan trip');
    last = minute;
  }
  const nulls = data.stationIds.filter((id,i) => trip.times[i] === null);
  if (JSON.stringify(nulls) !== JSON.stringify(trip.serviceId === 'friday' ? data.release.fridayNoBoardingStationIds : [])) throw Error('Invented or missing station time');
}
console.log('Isfahan release: pinned 20-station graph; 278 regular runs; holidays explicitly provisional');
