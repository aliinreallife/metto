# Licensing

This is a multi-license repository. Different contents are covered by
different licenses:

* Metto original source code → `AGPL-3.0-only` (see `LICENSE`).
* Tehran Metro station/network database derived from
  `mostafa-kheibary/tehran-metro-data` → `ODbL-1.0`
  (see `DATA_LICENSE.md` and `LICENSES/ODbL-1.0.txt`).
* Third-party software and assets → their respective licenses and terms
  (see below). The AGPL covering Metto's original code does not
  override those licenses.

## Metto source code

Original Metto source code is licensed under the GNU Affero General
Public License version 3 only (`AGPL-3.0-only`).

See `LICENSE`.

Copyright identity follows the repository history (`aliinreallife`).
No per-file AGPL markers are used: the root `LICENSE` together with
this notice establishes the AGPL default for original Metto code.
Per-file markers appear only on the ODbL-1.0 adapted-database data
files listed in `DATA_LICENSE.md`, where they clarify an exception to
that default.

## Tehran Metro data

Tehran Metro station/network data derived from
`mostafa-kheibary/tehran-metro-data` is licensed separately under the
Open Database License v1.0 (`ODbL-1.0`).

See `DATA_LICENSE.md`.

It is not covered by the AGPL merely because it lives in this
repository.

## Third-party software and assets

Third-party software, libraries, fonts, icons, mapping services,
datasets, images, and other materials remain subject to their
respective licenses and terms, including but not limited to:

* Leaflet (BSD-2-Clause); `react-leaflet@5.0.0` is separately licensed
  under Hippocratic-2.1 (non-OSI), which creates a potential AGPL
  distribution compatibility concern. Recommend removing it if unused.
* Vazirmatn font (SIL Open Font License 1.1). Note: `next/font/google`
  downloads the font at build time and self-hosts it with the built
  application, so distributed builds redistribute the font under OFL-1.1.
* Lucide icons (ISC), including the train glyph incorporated into
  `public/icon.svg`.
* shadcn/ui template code (MIT).
* Esri World Imagery / reference tiles (Esri terms; attribution shown
  in the map UI) and CARTO basemaps (CARTO terms; attribution shown in
  the map UI). Map tiles are a runtime service dependency, not files
  in this repository.
* OpenStreetMap data used via Nominatim geocoding (ODbL; API usage
  policy applies).
* npm dependencies per their own licenses (mostly MIT/Apache-2.0/BSD;
  `@vercel/analytics` is MPL-2.0). Proprietary services used at
  runtime (e.g. Fingerprint, Upstash, timestamp.ir, CARTO, Esri) are
  governed by their own terms.

## Deployments of modified versions

The footer "Source Code" link in the official deployment points to
<https://github.com/aliinreallife/metto>. Anyone deploying a modified
version must update the source link (or equivalent source offer) so it
points to the Corresponding Source of the modified version they are
actually running. Linking to the original Metto repository does not
satisfy the AGPL for a modified fork.

## Branding

The Metto name and original branding elements (subject to third-party
components incorporated in them, e.g. the Lucide-derived glyph in
`public/icon.svg`, which retains its ISC attribution) are not covered
by the AGPL copyright grant. No trademark rights are granted, and no
claim of registered-trademark status is made. A separate trademark
policy may be adopted in the future if desired.
