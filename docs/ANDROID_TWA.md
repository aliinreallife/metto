# metto Android TWA

The metto PWA (`https://metto.ir`) ships on Android as a Trusted Web
Activity. The wrapper lives in `android/` in this repo; the Next.js app
remains the main application and Vercel remains the web build authority.

- Package / application ID (permanent): `ir.metto.app`
- Launcher / app name: `metto`
- Origin: `https://metto.ir`, start URL `/`, display `standalone`
- Location delegation: enabled (`features.locationDelegation.enabled=true`
  in `android/twa-manifest.json` → `locationdelegation:1.1.2` +
  `PermissionRequestActivity` + `LocationDelegationExtraCommandHandler`).
  Required for `/nearby` and the GPS locate buttons.
- Generator: `@bubblewrap/cli@1.25.0` / `@bubblewrap/core@1.25.0`
  (pinned in `android/.bubblewrap-version`). Template values at generation
  time: `compileSdk 36`, `targetSdk 36`, Gradle `8.11.1`, AGP `8.9.1`
  (needs JDK 17 in CI). Since then the committed project moved to
  Gradle `9.6.0` / AGP `9.4.1` (still JDK 17 in CI; no toolchain pin —
  `android/gradle/gradle-daemon-jvm.properties` is intentionally absent).
- Committed defaults: `appVersionName 0.1.0`, `appVersionCode 1000`
  (consistent with the intended first release; release CI overrides both
  from the git tag and is authoritative).

## Layout

```text
android/                  # committed Bubblewrap output (source of truth)
  twa-manifest.json       # Bubblewrap config (package, host, colors, features)
  .bubblewrap-version     # pinned generator version (1.25.0)
  app/build.gradle        # includes the manually maintained metto signing block
  ...                     # Gradle wrapper, AndroidManifest, java, res/
scripts/
  generate-assetlinks.mjs # builds public/.well-known/assetlinks.json from fingerprints
  validate-assetlinks.mjs # strict validator; PENDING (exit 0) while prod file absent
  android-version.mjs     # strict tag -> versionName/versionCode derivation
  check-android-config.mjs# asserts committed TWA config (used by android-ci)
assetlinks.test.ts / android-version.test.ts  # vitest coverage for the above
```

## Regenerating the wrapper (maintainers only)

Bubblewrap is a generation tool, not part of the build. CI builds the
committed Gradle project directly and never runs `bubblewrap update`.

```bash
npx -y @bubblewrap/cli@1.25.0 init --manifest https://metto.ir/manifest.webmanifest --directory android
# re-apply metto overrides in android/twa-manifest.json
# (packageId ir.metto.app, names metto, 0.1.0/1000, locationDelegation.enabled=true)
npx -y @bubblewrap/cli@1.25.0 update --manifest android
# re-apply the "metto:" blocks in android/app/build.gradle (signing + version
# overrides) — `update` regenerates that file from the template.
# re-apply the "metto:" blocks in android/app/src/main/AndroidManifest.xml:
# ACCESS_COARSE_LOCATION + ACCESS_FINE_LOCATION uses-permissions plus
# DelegationService android:enabled/exported=true (location delegation must
# stay enabled even when enableNotifications=false, otherwise TWA GPS fails
# with PERMISSION_DENIED while the PWA works).
# Also re-apply the LocationSettingsActivity block ("Turn on location"
# deep link) and the ?twa=android line in LauncherActivity.getLaunchingUrl.
node scripts/check-android-config.mjs
```

## Location-services-OFF UX (no GMS)

Web geolocation cannot prove the device Location master switch is OFF
(`POSITION_UNAVAILABLE` also means "no fix", e.g. underground), so the web
UI (`lib/geolocation.ts` → `classifyGeoError`, `components/location-error.tsx`)
words unavailable/timeout failures as "make sure device Location is turned
on" guidance with a Retry action — and, only inside the TWA (`lib/twa.ts`
detection: `android-app://ir.metto.app` referrer, `?twa=android` launcher
param, or `getInstalledRelatedApps`), a native **Turn on location** action.

That action is a package-targeted Android intent URI
(`intent://open-location-settings#Intent;scheme=metto;package=ir.metto.app;end`;
a plain `metto://` navigation is swallowed by Chrome Custom Tabs, verified
on-device) resolving to `LocationSettingsActivity`, which
checks `LocationManager.isLocationEnabled()` (pre-28 fallback included) and
opens `Settings.ACTION_LOCATION_SOURCE_SETTINGS` only when Location is
really disabled — then finishes, so Back returns to the TWA. Deliberately
**no Google Play Services dependency**: a `SettingsClient` resolution dialog
would keep the user in-app, but it needs `play-services-location` + GMS on
the device, and metto also ships via Iranian marketplaces / direct APK where
GMS may be absent. Opening system settings covers every device.

Note: the CLI's first-run JDK/SDK prompts are interactive; generation
itself needs neither. The project in this PR was generated
programmatically with `@bubblewrap/core@1.25.0` (same code, no prompts).

## Signing (one release key, GitHub-hosted secrets only)

metto has a single long-term Android release signing key
(`metto-release.jks`, alias `metto-release`, RSA-4096). It is metto's
signing identity for Bazaar/Myket/direct APK releases (and possibly
F-Droid later). No Google-Play-specific setup exists yet — if Play
publishing happens later, a separate decision will cover whether this key
is imported into Play signing or used only as an upload key.

Secrets live in the protected **`android-release`** GitHub Environment and
are visible only to the release workflow (never to PR builds):

```text
ANDROID_KEYSTORE_BASE64
ANDROID_KEYSTORE_PASSWORD
ANDROID_KEY_ALIAS
ANDROID_KEY_PASSWORD
```

Gradle reads them exclusively from the environment
(`ANDROID_KEYSTORE_PATH` points at a `$RUNNER_TEMP` copy decoded from
`ANDROID_KEYSTORE_BASE64`). Local builds work without any secret
(unsigned). Passwords are never printed, never committed, and the keystore
is never uploaded as an artifact (ephemeral runner discards it).

Create the release key **once** (private machine, no shell-history password):

```bash
# 1. Generate (pick strong passwords; read -s keeps them out of history)
read -s -p "keystore password: " KS_PASS; echo
read -s -p "key password: " KEY_PASS; echo
keytool -genkeypair -v -keystore metto-release.jks -alias metto-release \
  -storetype JKS -keyalg RSA -keysize 4096 -validity 10950 \
  -storepass "$KS_PASS" -keypass "$KEY_PASS" \
  -dname "CN=Ali Rashidi, OU=metto, O=aliinreallife"
# validity 10950 days = 30 years (long-term signing identity)
unset KS_PASS KEY_PASS

# 2. Back up metto-release.jks OFFLINE and redundantly (2+ media +
#    password manager). Losing it means existing installs can never be
#    updated in place — a new signing identity would be required.

# 3. Fingerprint (public — this is what goes into assetlinks.json)
keytool -list -v -keystore metto-release.jks -alias metto-release | grep SHA256

# 4. Stage for GitHub (run from the key directory)
base64 -w0 metto-release.jks > metto-release.b64
gh secret set ANDROID_KEYSTORE_BASE64 --env android-release < metto-release.b64
read -s -p "keystore password: " P; gh secret set ANDROID_KEYSTORE_PASSWORD --env android-release <<<"$P"; unset P
gh secret set ANDROID_KEY_ALIAS --env android-release <<<"metto-release"
read -s -p "key password: " P; gh secret set ANDROID_KEY_PASSWORD --env android-release <<<"$P"; unset P
shred -u metto-release.b64  # or rm -P on macOS
```

The signed APK from the release workflow uses this release certificate, so
its fingerprint belongs in Digital Asset Links and direct-installed APKs
verify as a TWA.

## Digital Asset Links — live with the release signing fingerprint

`https://metto.ir/.well-known/assetlinks.json` serves the `ir.metto.app`
release certificate fingerprint (source: `public/.well-known/assetlinks.json`).
No placeholder fingerprints are committed. It was generated with:

```bash
node scripts/generate-assetlinks.mjs \
  --fingerprint '<RELEASE-SHA256>' \
  --output public/.well-known/assetlinks.json
node scripts/validate-assetlinks.mjs   # strict once the file exists
curl -s https://metto.ir/.well-known/assetlinks.json | head -c 400
```

If Google Play publishing is added later with Play App Signing, append the
Play signing certificate fingerprint alongside the release fingerprint
(re-run the generator with both `--fingerprint` flags) so store-installed
and direct-installed builds both verify. `vercel.json` already stages
`Content-Type: application/json` + short cache for this path, and the URL
must stay a direct 200 (no redirect, no Deployment Protection gate —
same rule as `/sw.js`).

## CI / release

- `android-ci.yml` (PRs + main, no secrets): Node 22 + JDK 17 + Android
  SDK; runs `check-android-config.mjs`, `validate-assetlinks.mjs`
  (pending-tolerant), `android-version.mjs v0.1.0` smoke, and
  `./gradlew -p android lint assembleDebug` on the committed project.
- `prepare-release.yml` (Actions → Prepare Release, input `vX.Y.Z`): the
  normal release path. Validates the version, drafts the bilingual
  `CHANGELOG.md` section from merged-PR notes on `release/vX.Y.Z` (fails if
  any in-range PR lacks usable notes), runs lint/typecheck/tests/extraction
  inline, opens (or updates) the `chore(release): prepare vX.Y.Z` PR, then
  dispatches CI on the release branch and waits for it. One-time manual
  prerequisite: Settings → Actions → General → Workflow permissions →
  **Allow GitHub Actions to create and approve pull requests** must be ON.
- `android-release.yml` (tags `v*.*.*`): strict `^v(\d+)\.(\d+)\.(\d+)$`
  validation first, `origin/main` ancestry check
  (`merge-base --is-ancestor`), semver-derived
  `versionCode = major*1_000_000 + minor*1_000 + patch`
  (`minor,patch <= 999`; Android requires a positive versionCode and Google
  Play's maximum is 2_100_000_000, so 1 <= versionCode <= 2_100_000_000;
  e.g. v0.1.0→1000, v1.12.34→1012034) injected via
  `-PmettoVersionCode/-PmettoVersionName`, signed
  `bundleRelease + assembleRelease`, `SHA256SUMS.txt`, GitHub Release with
  `.aab` + `.apk` + checksums. No store publishing inside this workflow; the
  `.apk` is for direct/GitHub distribution and downstream Myket publishing
  (`myket-release.yml`), the `.aab` is for manual Google Play upload.
- `myket-release.yml` (GitHub Release `published` + manual `workflow_dispatch`,
  `myket-release` environment, `contents: read`): downloads the exact signed
  `.apk` from the GitHub Release (checksum-verified, never rebuilt) and
  publishes it to Myket (APK only) — see “Myket distribution (APK)” below.

## Myket distribution (APK)

> Status (proven live on v0.7.6): token auth, bundle read, APK upload path,
> and the status safety gate all work against the real account. First proven
> end-to-end upload is still pending a submittable bundle state (see below).

Myket is metto's second Android distribution target (APK only). Google Play
keeps using the `.aab` via manual Internal Testing upload — no Play API
integration exists. The Android build itself never talks to Myket; the chain is:

```text
semver tag → android-release.yml → signed APK + AAB + checksums
  → GitHub Release (immutable source of truth)
  → myket-release.yml (auto-fired by workflow_run on release completion,
     or manual retry) consumes that exact APK → Myket API
```

Package is always the permanent `ir.metto.app`.

### One-time setup (manual)

1. Create/register the `ir.metto.app` application in the Myket developer
   panel under the account that will own it. CI cannot do this — the app
   must first exist and be owned by that account, otherwise the API returns
   `401`.
2. In the same panel, open the app's in-app products section and copy the
   verification token (“توکن صحت‌سنجی”). This is the Server-to-Server
   `X-Access-Token`.
3. Store it as `MYKET_ACCESS_TOKEN` in the protected **`myket-release`**
   GitHub Environment (never in code, resources, workflow inputs, artifacts,
   logs, or PR workflows):
   `gh secret set MYKET_ACCESS_TOKEN --env myket-release` (paste when prompted).

### Automatic flow

When `Android Release (TWA)` completes on a version tag, `myket-release.yml`
auto-fires via `workflow_run` (a `release: published` trigger cannot work:
releases created with `GITHUB_TOKEN` emit no workflow-triggering events, as
proven by v0.7.6). Non-tag or unsuccessful upstream runs exit quietly green.
The job: validates semver → confirms the release exists → downloads
`metto-vX.Y.Z.apk` + `SHA256SUMS.txt` → verifies the APK checksum → runs
`node scripts/myket-publish.mjs --tag vX.Y.Z --apk …` (`--dry-run` needs no
token: `node scripts/myket-publish.mjs --tag vX.Y.Z --apk … --dry-run`).
The script derives the bundle title (`metto vX.Y.Z`), the full EN/FA
descriptions (complete `## [vX.Y.Z]` CHANGELOG section split on
`#### فارسی` — never truncated), and rollout (default `100`), then calls:

1. `PUT …/release-bundle` (create/update),
2. `PUT …/release-bundle/upload` (signed APK as multipart with an **empty**
   field name, exactly as Myket documents `--form '=@"test.apk"'` — never the
   `.aab`),
3. `POST …/release-bundle/commit` with
   `{"isManualPublish": true, "message": "Metto Android release vX.Y.Z"}`.

The commit endpoint uses the corrected
`https://developer.myket.ir/api/…/release-bundle/commit` form — the doc page
shows `developer.myket.i/apir/…`, which is a typo (see the source comment in
`scripts/myket-publish.mjs`).

### Manual retry (no rebuild)

Actions → Myket Release → Run workflow → `tag: vX.Y.Z` (optional
`staged-rollout-percent`, `dry-run`). It downloads and checksum-verifies that
release's APK and publishes it — the GitHub Release stays the immutable
source of truth. Use `dry-run: true` first to validate tag/APK/metadata/
payload/endpoints without touching Myket or needing a token.

### `isManualPublish=true` behavior

Actions uploads the APK and submits it for Myket review; Myket reviews it;
you finalize publication manually in the Myket panel afterward. Automatic
publication after approval is deliberately off for initial releases. To switch
later, change the commit payload to `"isManualPublish": false` (script +
workflow + this doc together) — after Myket approval the release then
publishes automatically.

### Status / failure handling

- Pre-flight `GET …/release-bundle` gates overwrites: no bundle,
  `JustCreated`, `Rejected`, or `RolledBack` → proceed (update/re-upload).
  `WaitingForApproval` → abort (a bundle under review is never touched; the
  API itself rejects edits there). Unknown statuses abort. An `Approved`
  bundle does NOT block: per the documented PUT create-or-update semantics a
  new title registers a new bundle entry — but only after two proof checks:
  the tag's `versionCode` must exceed the store max (downgrade guard), and a
  post-PUT re-GET must show a fresh entry with our exact title outside any
  review/live state before the APK uploads. The API emits Persian display
  strings (e.g. `تایید شده` for `Approved`); `normalizeMyketStatus()` maps
  only live-observed ones — never guess a mapping.
- `400`/`401` fail only the Myket job with the Myket `messageCode`
  (`EditNotPossible`, `MissingRequiredData`, `PostAppFailed`, …) in the log
  and step summary — the GitHub Release is never modified or deleted.
- Never retry by creating duplicate bundles blindly; inspect the bundle list
  first. Never print `MYKET_ACCESS_TOKEN` (headers via env only).
- Useful statuses: `JustCreated`, `WaitingForApproval`, `Rejected`,
  `Approved`, `RolledBack` (see `GET …/release-bundle?status=…`).
- Check review state in the Myket developer panel or via
  `GET /api/partners/applications/ir.metto.app/release-bundle`.

## Metro data updates (no APK needed)

Timetable/web-UI changes ship through the web/PWA channel — never
an APK/AAB update. The wrapper needs a new release only for Android-side
changes (permissions, target SDK, TWA config, package metadata).
(Station *metadata* still ships inside the web bundle — see the storage note
and issue #69; no APK is needed for it either, but a web deployment is.)

- Source of truth: `public/schedule-data.json` (bootstrap monolith) +
  `public/metro-data-manifest.json` (schema v2, generated by
  `scripts/generate-metro-data.mjs` — never hand-edited). Chunk files under
  `public/data/` are content-addressed (`schedule-<key>.<hash>.json`); a
  changed chunk gets a new URL, so immutable caching is safe.
- Storage division: Cache Storage owns the app shell + bootstrap monolith;
  IndexedDB (`metto-schedule`) owns the active verified timetable
  (`active`, plus one `previous` for rollback). The client renders from
  local data immediately and refreshes changed chunks in the background
  (SHA-256-verified before activation; failures keep last-known-good).
- Measured footprint (v2, production): precache holds the 5.4 MB monolith +
  8 KB holidays (5.41 MB of 8.92 MB total precache); IDB holds **zero**
  schedule bytes on fresh install (the baseline is activated in memory, never
  copied — verified in-browser: `metto-schedule` exists with no keys). After
  one line update: ~11–12 MB total (monolith + changed chunk + one IDB
  generation ≈ 5.4 MB). After a second update: ~16–18 MB worst case
  (monolith + downloaded chunks + two IDB generations). Only `active` +
  one `previous` key ever exist — no pending/abandoned entries (chunk
  downloads live in memory only; the runtime chunk cache is LRU-bounded at
  32 entries, and at most 11 chunk URLs can exist per manifest). The
  duplication is inherent to bootstrap + LKG + rollback guarantees, so it is
  documented here, not optimized away.
- Deploy order: immutable `public/data/*` first, manifest last. Old chunk
  URLs keep working, so in-flight clients never break.
- Limitation: the very first launch while fully offline — before the
  service worker has ever installed — cannot bootstrap the PWA baseline.
  No native bridge is provided for this; one online visit prepares the
  device, after which underground/offline use is fully local.

## First release (after this PR merges)

```bash
# 1. Draft + review the changelog (Actions → Prepare Release, input v0.1.0),
#    then merge the resulting chore(release): prepare v0.1.0 PR to main.
git fetch origin && git checkout main && git pull --ff-only
git tag v0.1.0 && git push origin v0.1.0
# -> release workflow validates, builds, and creates the GitHub Release.
```

Post-release: test the signed `.apk` on a real device (installs cleanly,
TWA verification via Digital Asset Links shows no address bar, `/nearby`
GPS works), then submit it to Cafe Bazaar / Myket.
