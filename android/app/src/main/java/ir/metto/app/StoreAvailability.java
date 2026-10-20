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

import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;

/** App-store availability shared by the launcher and the review intent target. */
public final class StoreAvailability {
    private StoreAvailability() {}

    public static boolean isInstalled(Context context, StoreResolver.Store store) {
        if (store != StoreResolver.Store.BAZAAR && store != StoreResolver.Store.MYKET) {
            return false; // Metto has no Google Play review listing.
        }
        try {
            context.getPackageManager().getPackageInfo(StoreResolver.storePackage(store), 0);
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    /** Serialized once into the TWA start URL; never ask browser JS to enumerate apps. */
    public static String availableParameter(Context context) {
        boolean bazaar = isInstalled(context, StoreResolver.Store.BAZAAR);
        boolean myket = isInstalled(context, StoreResolver.Store.MYKET);
        if (bazaar && myket) return "bazaar,myket";
        if (bazaar) return "bazaar";
        if (myket) return "myket";
        return "none";
    }

    /** Prefer the actual installer only when that store is still installed. */
    public static StoreResolver.Store preferredStore(Context context) {
        StoreResolver.Store installer = StoreResolver.resolve(getInstallerPackageNameSafe(context));
        if (isInstalled(context, installer)) return installer;
        boolean bazaar = isInstalled(context, StoreResolver.Store.BAZAAR);
        boolean myket = isInstalled(context, StoreResolver.Store.MYKET);
        if (bazaar && !myket) return StoreResolver.Store.BAZAAR;
        if (myket && !bazaar) return StoreResolver.Store.MYKET;
        return StoreResolver.Store.UNKNOWN; // No store, or both available: let user choose.
    }

    public static String preferredParameter(Context context) {
        switch (preferredStore(context)) {
            case BAZAAR: return "bazaar";
            case MYKET: return "myket";
            default: return "choose";
        }
    }

    private static String getInstallerPackageNameSafe(Context context) {
        try {
            PackageManager pm = context.getPackageManager();
            String app = context.getPackageName();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                try {
                    android.content.pm.InstallSourceInfo info = pm.getInstallSourceInfo(app);
                    if (info != null && info.getInstallingPackageName() != null) {
                        return info.getInstallingPackageName();
                    }
                } catch (Exception ignored) {
                    // Some devices do not report the source; try the legacy API.
                }
            }
            return pm.getInstallerPackageName(app);
        } catch (Exception ignored) {
            return null;
        }
    }
}
