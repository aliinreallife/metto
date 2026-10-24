# Metto transit data: verified, pinned import

Metto's runtime network now comes from a reviewed, pinned snapshot of
[`metto-data`](https://github.com/aliinreallife/metto-data).

## Current policy
- Only **Tehran** is approved for passenger routing. Mashhad remains a candidate
  in a separate, default-off [review preview](mashhad-preview.md); it must not
  be selectable for passenger routing yet.
- `data/metto-data/manifest.json` locks the exact source Git revision and
  Git object hashes of every data artifact.
- These four JSON files are committed with the app; **Vercel builds and
  service workers never access GitHub** for metro data.
- `node scripts/check-metto-data.mjs` runs in CI and before every app build.
  It rejects corrupted input, changed provenance, unexpected counts,
  candidate publication, or the loss of the line-specific boarding exception.
- The adapter in `lib/metro/from-metto-data.ts` translates namespaced
  `tehran:station:...` IDs back to stable public Metto slugs, retains
  Persian line labels, and separates station, boarding, track, and transfer
  semantics.
- Existing exports in `lib/metro/{stations,lines,routes,segments,aliases,transfers}.ts`
  now use that adapter. Routing, UI, API and MCP retain their public imports;
  there is one runtime network definition rather than another handwritten copy.
- `metro-data-integration.test.ts` compares **every station, line, route,
  segment, legacy alias and transfer rule** with independent fingerprints
  captured from the old tables before the runtime switch. Comparing the
  adapter to its own re-export alone would not protect a migration.
- `metro-runtime-parity.test.ts` compares all 22,650 directed station pairs
  with that pre-cutover baseline, including 20,875 reachable pairs and every
  blocked endpoint. It also compares 108 full planning results (including
  unreachable/no-service outcomes) across depart-at/arrive-by, weekday,
  Thursday, Friday, explicit holiday, last service, and midnight cases.
- Amenities are preserved exactly for compatibility. This does **not** certify
  their accuracy; new amenity/accessibility claims still require evidence.

## Source refresh (explicit PR only)
1. Independently review changes in `metto-data`, confirm Tehran is
   release-ready, and merge/approve its data PR.
2. At a reviewed, available local `metto-data` Git commit, run
   `pnpm metro-data:import --source-dir ../metto-data --revision <40-char-git-sha>`.
   This imports exactly the committed files with `git show` (not a
   mutable working-tree copy), pins hashes/provenance, and fails for
   missing or candidate Tehran releases. It never accesses the network.
   Review the resulting JSON diff and run `pnpm metro-data:source-check`.
3. Run `pnpm typecheck`, `pnpm test` and the offline/E2E suite.
   Review semantic changes to topology, boarding, names and aliases.
4. Review changes against the fixed pre-cutover behavior fixture. Deliberate
   network changes may require an explicitly reviewed baseline revision; never
   regenerate fixtures merely to make a regression disappear.

The old `pnpm generate:stations` command now fails with a migration message.
It cannot overwrite the pinned runtime exports. Change network facts in
`metto-data` and use the pinned import command above.

## Baseline and rollback

`test-fixtures/tehran-before-metto-data.json` was captured from the legacy
runtime at app commit `b33697a0701441658fdcc7c82798d41a10c57266`, before any
of its metro tables were replaced. It records canonical SHA-256 fingerprints
of the seven tables, one full-topology digest per origin, deterministic
planning-case digests, and the unchanged timetable file checksum. The fixture
was captured with the legacy modules, not the new adapter; source-table
differences were checked before capture. No live clock or remote service is
used by its regression tests.

The runtime change is isolated on `feat/metto-data-runtime-cutover`, based on
the staging draft PR #223. The dataset remains pinned to
`af057821dee7cbd5fcd2bf9ebde079070d8ac20c` in draft metto-data PR #9. Both
foundation PRs still need final review; local validation does not authorize a
merge or establish that Mashhad is ready. If the approved data revision changes,
refresh the staging pin and rerun all gates before merging the runtime change.

Rollback the isolated runtime-cutover commit to restore the old tables and
generator; the bundled snapshot/adapter can remain staged without serving any
requests. Timetable chunks, station-download bytes, manifest URLs, and offline
cache policy are unchanged by this cutover, so rollback does not need a data
cache migration. A rollback must retain all other app fixes and source pins.

## Local cutover validation (October 23, 2026)

- `pnpm lint`: passed with the existing unrelated `no-img-element` warning.
- `pnpm typecheck` and `pnpm test`: passed, 822 tests in 48 files. These
  include the independent all-pairs and 108 planning-case comparisons above.
- `pnpm build`: passed, including pinned source verification, Next production
  build, and the Serwist worker (62 precache URLs). TLS verification was kept
  enabled; Google Fonts access now works in this environment.
- Production HTTP checks: 151 Tehran stations, a complete timetable route,
  exact route parity for legacy aliases, planner HTML, and MCP initialization.
- `PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium pnpm test:e2e:offline`:
  all 18 tests passed, including cold offline routing/navigation, tile cache,
  reconnect behavior, and service-worker update lifecycle.
- `PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium pnpm exec playwright test
  tests/advanced-time.spec.ts tests/bazaar-readiness.spec.ts --grep
  'travel time card|Android TWA'`: all 13 selected tests passed, including
  depart-at/arrive-by, FA/EN, keyboard/accessibility, and TWA install behavior.
- `node scripts/check-android-config.mjs`: passed. No signed Android package
  was built, and no physical-device validation was performed.

These are local results for the runtime branch. They do not replace remote CI,
approval of the draft source/staging PRs, or Mashhad's independent service-data
review. Nothing has been merged, published, or deployed by this change.

**Critical exception:** At Shohada-ye Hefdah-e Shahrivar, the
`metto`-reviewed route stop on Line 6 is `under_construction`;
Line 7 boarding and Line 6 through-track segments remain `operational`.
Never replace this with a station-wide `disabled` boolean from the
original upstream Tehran repository.

The existing `public/schedule-data.json`, immutable timetable chunks and
offline updater remain untouched. Station cache publishing is a **separate**
compatibility and rollout decision.
