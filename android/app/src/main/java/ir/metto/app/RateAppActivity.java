/*
 * Copyright 2026 metto contributors.
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
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;

/**
 * "Rate Metto" target for the TWA web UI.
 *
 * <p>Launched via the {@code metto://rate-app} deep link from web content.
 * Detects which store installed {@code ir.metto.app} (Cafe Bazaar, Myket,
 * or Play) and opens our listing directly in that exact store — pinned to
 * the store package so no chooser appears. Unknown/direct/APK installs try
 * a generic {@code market://} Intent first, then fall back to the
 * bilingual {@code https://metto.ir/rate} page where the user picks a
 * store by hand.
 *
 * <p>Deliberately GMS-free: no Play Core / In-App Review dependency. When
 * Play is the installer, opening the Play listing is sufficient.
 *
 * <p>No UI (Theme.NoDisplay + noHistory): it forwards and finishes, so
 * Back returns straight to the TWA. Never crashes when a store is
 * missing — every launch is guarded.
 */
public class RateAppActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try {
            openListing();
        } catch (Exception ignored) {
            // Never crash the rating flow — worst case the user stays in-app.
        }
        finish();
    }

    private void openListing() {
        String installer = getInstallerPackageNameSafe();
        StoreResolver.Store store = StoreResolver.resolve(installer);
        if (store != StoreResolver.Store.UNKNOWN) {
            if (tryNativeListing(store)) {
                return;
            }
            if (tryHttpsFallback(store)) {
                return;
            }
            // Known store app missing entirely: let the user pick on /rate.
            openWebFallback();
            return;
        }
        // Unknown / direct / ADB install: never guess a store.
        if (tryGenericMarket()) {
            return;
        }
        openWebFallback();
    }

    private String getInstallerPackageNameSafe() {
        try {
            PackageManager pm = getPackageManager();
            if (pm == null) {
                return null;
            }
            String self = getPackageName();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                try {
                    android.content.pm.InstallSourceInfo info =
                            pm.getInstallSourceInfo(self);
                    if (info != null) {
                        String name = info.getInstallingPackageName();
                        if (name != null) {
                            return name;
                        }
                    }
                } catch (Exception ignored) {
                    // Fall through to the legacy API.
                }
            }
            try {
                return pm.getInstallerPackageName(self);
            } catch (Exception ignored) {
                return null;
            }
        } catch (Exception ignored) {
            return null;
        }
    }

    private boolean tryNativeListing(StoreResolver.Store store) {
        try {
            String uri = StoreResolver.nativeUri(store);
            String pkg = StoreResolver.storePackage(store);
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(uri));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (pkg != null) {
                intent.setPackage(pkg);
            }
            startActivity(intent);
            return true;
        } catch (ActivityNotFoundException e) {
            return false;
        } catch (Exception ignored) {
            return false;
        }
    }

    private boolean tryHttpsFallback(StoreResolver.Store store) {
        try {
            String url = StoreResolver.httpsFallback(store);
            if (url == null) {
                return false;
            }
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
            return true;
        } catch (ActivityNotFoundException e) {
            return false;
        } catch (Exception ignored) {
            return false;
        }
    }

    private boolean tryGenericMarket() {
        try {
            Intent intent =
                    new Intent(
                            Intent.ACTION_VIEW,
                            Uri.parse(
                                    "market://details?id="
                                            + StoreResolver.APP_PACKAGE));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
            return true;
        } catch (ActivityNotFoundException e) {
            return false;
        } catch (Exception ignored) {
            return false;
        }
    }

    private void openWebFallback() {
        try {
            Intent intent =
                    new Intent(
                            Intent.ACTION_VIEW,
                            Uri.parse(StoreResolver.ratePageFallback()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Exception ignored) {
            // No browser either — nothing more to do.
        }
    }
}
