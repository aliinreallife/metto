/*
 * Copyright 2026 Metto contributors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package ir.metto.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;

/**
 * "Turn on location" target for the TWA web UI.
 *
 * <p>The web Geolocation API cannot prove the device Location master switch
 * is OFF (POSITION_UNAVAILABLE also means "no fix", e.g. underground), so
 * the web UI only <i>offers</i> this action after an unavailable/timeout
 * failure inside the TWA. This activity provides the certainty: it checks
 * {@link LocationManager#isLocationEnabled()} (with a pre-28 fallback) and
 * opens system Location settings only when Location is really disabled.
 *
 * <p>Launched via the {@code metto://open-location-settings} deep link from
 * web content — plain-Chrome navigation to a custom scheme resolves to this
 * exported activity, so no JavaScript bridge, no intent: hacks, and no
 * Google Play Services dependency are needed (important: Metto also ships
 * outside Google Play, where GMS may be absent).
 *
  * <p>No UI (Theme.NoDisplay + noHistory): it forwards to Settings and
 * finishes, so Back from Settings returns straight to the TWA.
 */
public class LocationSettingsActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (!isLocationEnabled()) {
            Intent intent = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                startActivity(intent);
            } catch (Exception ignored) {
                // No settings activity on this device — nothing to open.
            }
        }
        finish();
    }

    private boolean isLocationEnabled() {
        try {
            LocationManager lm =
                    (LocationManager) getSystemService(Context.LOCATION_SERVICE);
            // Unknown state: default to enabled so we never push the user
            // to Settings on a guess.
            if (lm == null) return true;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                return lm.isLocationEnabled();
            }
            // Pre-28 fallback (minSdk 21).
            int mode =
                    Settings.Secure.getInt(
                            getContentResolver(),
                            Settings.Secure.LOCATION_MODE,
                            Settings.Secure.LOCATION_MODE_OFF);
            return mode != Settings.Secure.LOCATION_MODE_OFF;
        } catch (Exception ignored) {
            return true;
        }
    }
}
