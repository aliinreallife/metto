#!/usr/bin/env node
// Asserts the committed Android TWA configuration (source of truth for CI).
// Fails non-zero with a clear message on any drift. Does NOT invoke
// Bubblewrap and does NOT regenerate anything (see docs/ANDROID_TWA.md).
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fail = [];
const ok = (cond, msg) => {
  if (cond) console.log(`  ok: ${msg}`);
  else fail.push(msg);
};

const twa = JSON.parse(readFileSync(resolve(repoRoot, "android/twa-manifest.json"), "utf8"));
ok(twa.packageId === "ir.metto.app", `twa-manifest packageId == ir.metto.app (got ${twa.packageId})`);
ok(twa.host === "metto.ir", `twa-manifest host == metto.ir (got ${twa.host})`);
ok(twa.name === "Metto", `twa-manifest name == Metto (got ${twa.name})`);
ok(twa.launcherName === "Metto", `twa-manifest launcherName == Metto (got ${twa.launcherName})`);
ok(twa.startUrl === "/", `twa-manifest startUrl == / (got ${twa.startUrl})`);
ok(twa.display === "standalone", `twa-manifest display == standalone (got ${twa.display})`);
ok(twa.appVersionName === "0.1.0" || twa.appVersion === "0.1.0", "twa-manifest default version 0.1.0");
ok(twa.appVersionCode === 1000, `twa-manifest appVersionCode == 1000 (got ${twa.appVersionCode})`);
ok(twa.features?.locationDelegation?.enabled === true, "twa-manifest features.locationDelegation.enabled == true");
ok(twa.webManifestUrl === "https://metto.ir/manifest.webmanifest", "twa-manifest webManifestUrl points at prod");

const gradle = readFileSync(resolve(repoRoot, "android/app/build.gradle"), "utf8");
ok(gradle.includes('targetSdkVersion 36'), "app/build.gradle targetSdkVersion 36");
ok(gradle.includes('compileSdkVersion 36'), "app/build.gradle compileSdkVersion 36");
ok(gradle.includes('applicationId "ir.metto.app"'), 'app/build.gradle applicationId "ir.metto.app"');
ok(
  gradle.includes("com.google.androidbrowserhelper:locationdelegation"),
  "app/build.gradle locationdelegation dependency (location delegation)",
);
ok(gradle.includes("signingConfigs") && gradle.includes("mettoRelease"), "app/build.gradle mettoRelease signing block");
ok(gradle.includes("ANDROID_KEYSTORE_PATH"), "app/build.gradle reads ANDROID_KEYSTORE_PATH env");
ok(gradle.includes("mettoVersionCode") && gradle.includes("mettoVersionName"), "app/build.gradle mettoVersion overrides");
ok(!/storePassword\s+"[^"]+"/.test(gradle), "app/build.gradle contains no hard-coded password");

const manifestXml = readFileSync(
  resolve(repoRoot, "android/app/src/main/AndroidManifest.xml"),
  "utf8",
);
ok(
  manifestXml.includes("com.google.androidbrowserhelper.locationdelegation.PermissionRequestActivity"),
  "AndroidManifest declares location PermissionRequestActivity",
);
ok(
  manifestXml.includes("android.permission.ACCESS_COARSE_LOCATION"),
  "AndroidManifest declares ACCESS_COARSE_LOCATION (location delegation prompt)",
);
ok(
  manifestXml.includes("android.permission.ACCESS_FINE_LOCATION"),
  "AndroidManifest declares ACCESS_FINE_LOCATION (location delegation prompt)",
);
// Location delegation rides on DelegationService — it must stay enabled even
// when notifications are off. Bubblewrap templates tie this service to
// @bool/enableNotification, which silently breaks TWA GPS.
ok(
  /<service[^>]*android:name="\.DelegationService"[^>]*android:enabled="true"/s.test(manifestXml) ||
    /<service[^>]*android:enabled="true"[^>]*android:name="\.DelegationService"/s.test(manifestXml),
  "AndroidManifest keeps DelegationService android:enabled=true (location delegation independent of notifications)",
);
ok(
  /<service[^>]*android:name="\.DelegationService"[^>]*android:exported="true"/s.test(manifestXml) ||
    /<service[^>]*android:exported="true"[^>]*android:name="\.DelegationService"/s.test(manifestXml),
  "AndroidManifest keeps DelegationService android:exported=true (Chrome must bind to it)",
);

const pinned = readFileSync(resolve(repoRoot, "android/.bubblewrap-version"), "utf8").trim();
ok(pinned === "1.25.0", `android/.bubblewrap-version pins 1.25.0 (got ${pinned})`);

// "Turn on location" helper (LocationSettingsActivity): native certainty for
// the device-Location-OFF state via LocationManager.isLocationEnabled(),
// reached from web content through metto://open-location-settings.
// Deliberately GMS-free (Metto also ships outside Google Play).
ok(
  manifestXml.includes('android:name=".LocationSettingsActivity"'),
  "AndroidManifest declares .LocationSettingsActivity (Turn on location target)",
);
ok(
  /<activity[^>]*android:name="\.LocationSettingsActivity"[^>]*android:exported="true"/s.test(manifestXml) ||
    /<activity[^>]*android:exported="true"[^>]*android:name="\.LocationSettingsActivity"/s.test(manifestXml),
  "AndroidManifest keeps LocationSettingsActivity android:exported=true (Chrome must fire the deep link)",
);
ok(
  manifestXml.includes('android:scheme="metto"') &&
    manifestXml.includes('android:host="open-location-settings"'),
  "AndroidManifest routes metto://open-location-settings to LocationSettingsActivity",
);
ok(
  manifestXml.includes("Theme.Translucent.NoDisplay"),
  "AndroidManifest keeps LocationSettingsActivity UI-less (forward to Settings, then finish)",
);
const launcherJava = readFileSync(
  resolve(repoRoot, "android/app/src/main/java/ir/metto/app/LauncherActivity.java"),
  "utf8",
);
ok(
  launcherJava.includes('appendQueryParameter("twa", "android")'),
  "LauncherActivity tags TWA launches with ?twa=android (web-side wrapper detection)",
);
ok(
  !gradle.includes("play-services"),
  "app/build.gradle adds no Play Services dependency (Location settings via platform Settings intent)",
);

if (fail.length) {
  console.error("\ncheck-android-config: FAILED");
  for (const m of fail) console.error(`  missing: ${m}`);
  process.exit(1);
}
console.log("\ncheck-android-config: OK (ir.metto.app, targetSdk 36, location delegation, signing-via-env)");
