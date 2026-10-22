# Metto transit data: verified, pinned import

This is an intentionally conservative first stage of the transition from
hand-maintained Metto metro data to
[`metto-data`](https://github.com/aliinreallife/metto-data).

## Current policy
- Only **Tehran** is approved and bundled. Mashhad remains a candidate and
  must not be selectable for passenger routing yet.
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
- `metro-data-integration.test.ts` compares **every station, line, route,
  segment, legacy alias and transfer rule** with the existing Metto values.
  No release cutover is appropriate while any mismatch remains.

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
4. Only after approval should app runtime imports switch to the adapter.

**Critical exception:** At Shohada-ye Hefdah-e Shahrivar, the
`metto`-reviewed route stop on Line 6 is `under_construction`;
Line 7 boarding and Line 6 through-track segments remain `operational`.
Never replace this with a station-wide `disabled` boolean from the
original upstream Tehran repository.

The existing `public/schedule-data.json`, immutable timetable chunks and
offline updater remain untouched. Station cache publishing is a **separate**
compatibility and rollout decision.
