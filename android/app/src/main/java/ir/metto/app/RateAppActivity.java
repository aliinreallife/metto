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
import android.net.Uri;
import android.os.Bundle;

/**
 * TWA "Rate Metto" deep-link target. Opens Bazaar/Myket's *review* screen,
 * not the normal app listing. No Play Core / GMS dependencies.
 *
 * The requested store is validated against what is actually installed.
 * Without a request, we prefer the installing store or the sole installed
 * store. The web UI presents a choice if both stores are available but the
 * installer is unknown. No installed store means no launch.
 */
public class RateAppActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try {
            StoreResolver.Store store = requestedStore();
            if (!StoreAvailability.isInstalled(this, store)) {
                store = StoreAvailability.preferredStore(this);
            }
            if (StoreAvailability.isInstalled(this, store) && !openReview(store)) {
                // Older store builds may not support their direct review intent.
                if (!openListing(store)) openWebListing(store);
            }
        } catch (Exception ignored) {
            // Rating must never crash the TWA.
        }
        finish();
    }

    private StoreResolver.Store requestedStore() {
        try {
            Uri uri = getIntent().getData();
            if (uri != null) {
                String requested = uri.getQueryParameter("store");
                if ("bazaar".equals(requested)) return StoreResolver.Store.BAZAAR;
                if ("myket".equals(requested)) return StoreResolver.Store.MYKET;
            }
        } catch (Exception ignored) {
            // Invalid link: use the installed preferred store.
        }
        return StoreResolver.Store.UNKNOWN;
    }

    private boolean openReview(StoreResolver.Store store) {
        String url;
        String action;
        if (store == StoreResolver.Store.BAZAAR) {
            action = Intent.ACTION_EDIT;
            url = "bazaar://details?id=" + StoreResolver.APP_PACKAGE;
        } else if (store == StoreResolver.Store.MYKET) {
            action = Intent.ACTION_VIEW;
            url = "myket://comment?id=" + StoreResolver.APP_PACKAGE;
        } else {
            return false;
        }
        return launch(action, Uri.parse(url), StoreResolver.storePackage(store));
    }

    private boolean openListing(StoreResolver.Store store) {
        return launch(Intent.ACTION_VIEW, Uri.parse(StoreResolver.nativeUri(store)),
                StoreResolver.storePackage(store));
    }

    private void openWebListing(StoreResolver.Store store) {
        String url = StoreResolver.httpsFallback(store);
        if (url != null) launch(Intent.ACTION_VIEW, Uri.parse(url), null);
    }

    private boolean launch(String action, Uri uri, String pkg) {
        try {
            Intent intent = new Intent(action, uri);
            if (pkg != null) intent.setPackage(pkg);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
            return true;
        } catch (ActivityNotFoundException ignored) {
            return false;
        } catch (Exception ignored) {
            return false;
        }
    }
}
