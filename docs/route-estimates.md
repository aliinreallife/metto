# Missing-timetable estimate audit

The existing fallback is useful for rough **ride duration**, but is too optimistic
for a complete journey when it cannot account for waiting. It should not be used
to enable Mashhad arrival estimates.

Run `pnpm estimates:evaluate` from the app root. This bundles and calls the actual
production `estimateSegmentSeconds` and `findRoute` functions. It writes a full
JSON report and per-span CSV to `.quality-report/`. The checked-in [JSON snapshot](quality/route-estimates.json)
records these results. No timetable, coordinate, alias, speed or routing behavior
was changed for this audit.

The input is `public/schedule-data.json`, SHA-256
`46fb0992aebd9fa266a44651fc60c93eb8d935d617144df1e1502ffb0f258f2c`,
the same bytes as the independent pre-migration Tehran baseline.

## Ride-duration comparison

The formula sums straight-line distance between adjacent infrastructure stations
at 35 km/h, adding 25 seconds per hop, then rounds once. It includes intermediate
infrastructure stops when a timetable train skips them. It does not know which
express service would run after its timetable is removed.

We compare every forward span in each scheduled train with this formula.
Repeated trains are grouped by line, branch, direction, day type, express flag
and ordered path; each group receives one vote, against its median scheduled
ride duration. This avoids weighting a frequently repeated train as many
independent accuracy measurements. Overlapping spans are still correlated.

There are 5,254 train rows and 1,219,308 candidate span observations.
1,183,694 observations pass topology checks, forming 10,752 regular-service groups
and 12 express groups. Input times have one-minute resolution.

| Regular rides | Error |
| --- | ---: |
| Mean absolute error | 2.03 min |
| Median absolute error | 1.52 min |
| 90th percentile absolute error | 4.20 min |
| Mean signed error (estimate minus timetable) | −1.06 min |
| Mean absolute percentage error | 12.77% |
| Within 1 minute | 37.23% |
| Within 5 minutes | 93.77% |

| Service | Mean absolute error | 90th percentile | Groups |
| --- | ---: | ---: | ---: |
| Line 1 main | 3.14 min | 6.18 min | 2,718 |
| Line 2 | 1.47 min | 2.95 min | 1,386 |
| Line 3 | 1.19 min | 2.55 min | 1,800 |
| Line 4 main | 1.17 min | 2.33 min | 1,140 |
| Line 5 main, regular | 7.16 min | 13.93 min | 339 |
| Line 6 | 1.53 min | 3.15 min | 1,950 |
| Line 7 | 1.65 min | 3.43 min | 1,386 |
| Line 1 branch, usable spans only | 0.78 min | 0.78 min | 6 |
| Line 4 airport branch | 0.43 min | 0.63 min | 18 |
| Line 5 extension | 3.73 min | 5.60 min | 9 |

The 12 express groups have 20.26 minutes mean absolute error and 31 minutes at the
90th percentile. They are a small, separate stress case; the geometric fallback
cannot predict express service. Neither they nor the six usable Line 1 branch
groups support a general accuracy claim for those services.

### Timetable identity exclusions

35,614 span observations (2.92%) fail branch membership or monotonic stop order
checks. They remain counted in the report and are excluded from accuracy metrics;
we do not silently repair station names.

For example, Line 1 main has a row ordered `Kahrizak → Imam Khomeini → Shahed`,
then another `Imam Khomeini` later downtown. Both currently normalize to the same
downtown ID. The first appears to refer to the shrine station. Line 1's airport
branch also uses `Imam Khomeini`, which normalizes downtown rather than to the
airport. These are legacy timetable identity issues, separate from the trusted
physical station inventory. Their intended identities need a focused source
review before any data correction. The original raw input is unchanged.

## Complete-journey comparison

We also run the existing nine pre-migration journey pairs across six fixed
scenarios: weekday morning, Thursday, Friday, holiday, last service and midnight.
For each usable journey we mask either one ride leg's timetable or all timetables,
then call the real router. Transfers and later timetable connections are still
propagated by production code.

Of 54 requested cases, 19 have complete, topologically consistent timetable
baselines. Six have inconsistent timetable spans, 23 have no service and six have
another unavailable/untimed baseline. They are reported, not assigned an accuracy
score. Each valid journey is run once with all legs masked and once per leg with
only that leg masked. This is a small, deliberately varied regression matrix,
not a representative sample of all Tehran journeys.

| Masking | Comparisons | Mean absolute ETA error | Median | 90th percentile | Mean signed error |
| --- | ---: | ---: | ---: | ---: | ---: |
| One leg missing | 33 | 8.10 min | 7.48 min | 15.00 min | −7.93 min |
| All timetables missing | 19 | 11.59 min | 9.65 min | 28.92 min | −11.31 min |

The difference from ride-only accuracy comes largely from unmodeled waiting and
connections. When a leg has no timetable, the router adds its geometric ride time
but adds **zero platform wait** for that leg. Being early at a later transfer can
also select a train that the scheduled journey would miss. The planner now says
plainly when its timing omits these waits.

For all 23 no-service baseline cases, forcibly masking every timetable produces
a complete estimated journey. This is expected from a geometric fallback, but
means it cannot establish that trains are running. The normal loaded-timetable
path still returns `no_service` and never replaces it with a guessed train.

## What actually triggers fallback

`findTripDetailed` and its reverse counterpart distinguish missing line/day data
from a covered line/day with no usable departure. A completely unloaded timetable,
missing line or missing day type permits fallback. An individual station missing
from an otherwise covered line/day currently returns `no_service`, as does a
missed final train. This audit preserves that conservative behavior; it does not
convert unknown station coverage into an invented departure.

These comparisons use scheduled times, not observed train performance. They do
not measure live delays, crowding, actual walking speed or service reliability.
No parameters were fitted and no holdout accuracy is claimed. Tehran results do
not validate Mashhad speed, wait times, transfers or operating hours. Mashhad
continues to show stations and routes, with travel and arrival times blank until
there is evidence for them.
