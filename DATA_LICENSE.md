# Tehran Metro data license

Tehran Metro station/network data used by Metto is based on the
Tehran Metro Data project by mostafa-kheibary and is made available
under the Open Database License (ODbL) v1.0.

* Upstream: <https://github.com/mostafa-kheibary/tehran-metro-data>
* ODbL 1.0: <https://opendatacommons.org/licenses/odbl/1-0/>
* Local copy of the license text: `LICENSES/ODbL-1.0.txt`

## Files covered

The following files contain, or are substantially derived from, that
metro database (the adapted database), and are licensed under
`ODbL-1.0` — not under the AGPL license that covers Metto's original
source code:

* `data/tehran-metro-stations.json` — canonical upstream copy
  (coordinates, names, amenities, relations).
* `lib/metro/stations.ts` — generated from the file above by
  `scripts/generate-stations.ts`. 149 stations copy upstream
  coordinates exactly; the Shahid Sepahbod Qasem Soleimani pin,
  Shahid Fakhrizadeh record, and station statuses come from
  `scripts/metto-overrides.json`.
* Factual network-topology tables derived from the upstream database:
  ordered station lists in `lib/metro/routes.ts`, edges and track
  statuses in `lib/metro/segments.ts`, the station/line slug and
  legacy-name map in `lib/metro/aliases.ts`, the line table in
  `lib/metro/lines.ts`, and the `TRANSFER_RULES` data table in
  `lib/metro/transfers.ts`.
* `scripts/metto-overrides.json` — Metto-maintained corrections layered
  on the adapted database (documented here because strict JSON files
  cannot carry license comments).
* `lib/metro/NOTES.md` — topology documentation for the adapted database.

### Mixed file: `lib/metro/transfers.ts`

`lib/metro/transfers.ts` mixes both scopes and therefore carries no
per-file license marker: the `TRANSFER_RULES` data table is part of
the ODbL-1.0 adapted database described above, while the surrounding
functions are original Metto logic covered by the root `AGPL-3.0-only`
license. See `NOTICE.md` for the overall structure.

The generator programs themselves (`scripts/generate-stations.ts`,
`scripts/fetch-schedules.ts`) are original Metto software under
`AGPL-3.0-only`; only their database output/input is covered by this
document.

## Upstream license note

The upstream repository's LICENSE/README identify the database as
ODbL-1.0, while its `package.json` says `ISC`. Metto does not attempt
to resolve that inconsistency by relicensing the data. As a
conservative approach, Metto treats data copied from or substantially
derived from that metro database as `ODbL-1.0`.

## Your obligations (summary, not legal advice)

If you publicly use this adapted database or a derivative of it, the
ODbL requires attribution, Share-Alike for derivative databases, and
that the derivative database (or the alterations) be offered in
machine-readable form (see ODbL §§ 4.2–4.6). Read the full license
text in `LICENSES/ODbL-1.0.txt`.

Metto keeps the machine-readable adapted database in this public
repository (`data/tehran-metro-stations.json` and
`lib/metro/stations.ts`).

## Not covered by this document

* Metto's original source code: `AGPL-3.0-only`, see `LICENSE` and
  `NOTICE.md`.
* Third-party software, fonts, icons, mapping services, and other
  materials: their respective licenses/terms — see `NOTICE.md`.
