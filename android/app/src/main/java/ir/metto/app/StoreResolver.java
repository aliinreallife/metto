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

/**
 * Pure installer → store mapping for the "Rate Metto" flow.
 *
 * <p>Kept free of Android framework types so the selection logic stays
 * trivially reviewable (and would stay testable without an Android test
 * harness). {@link RateAppActivity} owns all Intent handling; this class
 * only answers "which store installed us, and where is our listing?".
 */
public final class StoreResolver {
    public static final String APP_PACKAGE = "ir.metto.app";

    public static final String BAZAAR_INSTALLER = "com.farsitel.bazaar";
    public static final String MYKET_INSTALLER = "ir.mservices.market";
    public static final String PLAY_INSTALLER = "com.android.vending";

    public enum Store {
        BAZAAR,
        MYKET,
        PLAY,
        UNKNOWN
    }

    private StoreResolver() {}

    /** Map a PackageManager installer package name to a known store. */
    public static Store resolve(String installerPackageName) {
        if (BAZAAR_INSTALLER.equals(installerPackageName)) {
            return Store.BAZAAR;
        }
        if (MYKET_INSTALLER.equals(installerPackageName)) {
            return Store.MYKET;
        }
        if (PLAY_INSTALLER.equals(installerPackageName)) {
            return Store.PLAY;
        }
        return Store.UNKNOWN;
    }

    /** Android package to pin the listing Intent to, or null when unpinned. */
    public static String storePackage(Store store) {
        switch (store) {
            case BAZAAR:
                return BAZAAR_INSTALLER;
            case MYKET:
                return MYKET_INSTALLER;
            case PLAY:
                return PLAY_INSTALLER;
            default:
                return null;
        }
    }

    /** Native marketplace URI for our listing (preferred, may be missing). */
    public static String nativeUri(Store store) {
        switch (store) {
            case BAZAAR:
                return "bazaar://details?id=" + APP_PACKAGE;
            case MYKET:
                return "myket://details?id=" + APP_PACKAGE;
            case PLAY:
            default:
                return "market://details?id=" + APP_PACKAGE;
        }
    }

    /** HTTPS listing fallback when the native app is missing. */
    public static String httpsFallback(Store store) {
        switch (store) {
            case BAZAAR:
                return "https://cafebazaar.ir/app/" + APP_PACKAGE;
            case MYKET:
                return "https://myket.ir/app/" + APP_PACKAGE;
            case PLAY:
                return "https://play.google.com/store/apps/details?id=" + APP_PACKAGE;
            default:
                return null;
        }
    }

    /** Web fallback page inside Metto for unknown/direct installs. */
    public static String ratePageFallback() {
        return "https://metto.ir/rate";
    }
}
