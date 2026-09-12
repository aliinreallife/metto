# Metto Android TWA

The Metto PWA (`https://metto.ir`) ships on Android as a Trusted Web
Activity. The wrapper lives in `android/` in this repo; the Next.js app
remains the main application and Vercel remains the web build authority.

- Package / application ID (permanent): `ir.metto.app`
- Launcher / app name: `Metto`
- Origin: `https://metto.ir`, start URL `/`, display `standalone`
- Location delegation: enabled (`features.locationDelegation.enabled=true`
  in `android/twa-manifest.json` → `locationdelegation:1.1.2` +
  `PermissionRequestActivity` + `LocationDelegationExtraCommandHandler`).
  Required for `/nearby` and the GPS locate buttons.
- Generator: `@bubblewrap/cli@1.25.0` / `@bubblewrap/core@1.25.0`
  (pinned in `android/.bubblewrap-version`). Template values at generation
  time: `compileSdk 36`, `targetSdk 36`, Gradle `8.11.1`, AGP `8.9.1`
  (needs JDK 17 in CI).
- Committed defaults: `appVersionName 0.1.0`, `appVersionCode 1000`
  (consistent with the intended first release; release CI overrides both
  from the git tag and is authoritative).

## Layout

```text
android/                  # committed Bubblewrap output (source of truth)
  twa-manifest.json       # Bubblewrap config (package, host, colors, features)
  .bubblewrap-version     # pinned generator version (1.25.0)
  app/build.gradle        # includes the manually maintained Metto signing block
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
# re-apply Metto overrides in android/twa-manifest.json
# (packageId ir.metto.app, names Metto, 0.1.0/1000, locationDelegation.enabled=true)
npx -y @bubblewrap/cli@1.25.0 update --manifest android
# re-apply the "Metto:" blocks in android/app/build.gradle (signing + version
# overrides) — `update` regenerates that file from the template.
node scripts/check-android-config.mjs
```

Note: the CLI's first-run JDK/SDK prompts are interactive; generation
itself needs neither. The project in this PR was generated
programmatically with `@bubblewrap/core@1.25.0` (same code, no prompts).

## Signing (one release key, GitHub-hosted secrets only)

Metto has a single long-term Android release signing key
(`metto-release.jks`, alias `metto-release`, RSA-4096). It is Metto's
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
  -dname "CN=Ali Rashidi, OU=Metto, O=aliinreallife"
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
- `android-release.yml` (tags `v*.*.*`): strict `^v(\d+)\.(\d+)\.(\d+)$`
  validation first, `origin/main` ancestry check
  (`merge-base --is-ancestor`), semver-derived
  `versionCode = major*1_000_000 + minor*1_000 + patch`
  (`minor,patch <= 999`; Android requires a positive versionCode and Google
  Play's maximum is 2_100_000_000, so 1 <= versionCode <= 2_100_000_000;
  e.g. v0.1.0→1000, v1.12.34→1012034) injected via
  `-PmettoVersionCode/-PmettoVersionName`, signed
  `bundleRelease + assembleRelease`, `SHA256SUMS.txt`, GitHub Release with
  `.aab` + `.apk` + checksums. No store auto-publish; the `.apk` is for
  direct/GitHub distribution and Bazaar/Myket submission, the `.aab` is
  kept for future store needs.

## First release (after this PR merges)

```bash
git fetch origin && git checkout main && git pull --ff-only
git tag v0.1.0 && git push origin v0.1.0
# -> release workflow validates, builds, and creates the GitHub Release.
```

Post-release: test the signed `.apk` on a real device (installs cleanly,
TWA verification via Digital Asset Links shows no address bar, `/nearby`
GPS works), then submit it to Cafe Bazaar / Myket.
