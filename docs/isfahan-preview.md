# Isfahan candidate preview

`/preview/isfahan?lang=fa` (or `lang=en`) is a review screen in the Metto app.
It is enabled only on Vercel preview deployments and local development.
Production shows the not-found page, and metadata disallows indexing. The public city
registry, APIs, station counts, sitemap and normal city selector are unchanged.

The screen reuses Metto's RealMap and station combobox. It displays the 20 core
Isfahan candidate stations and the original rail geometry, with station
selection, a list, and reversible track inspection between two stations. It
does not call a passenger planner, Tehran timetables, landmark search, WebMCP,
or a street routing service. Candidate endpoint selection stays local to this
screen and does not replace saved Tehran/Mashhad trip endpoints.

The visible FA/EN review notice explains that this is not for travel and that
Daneshgah/Kargar boarding remains unconfirmed. No ETA or amenities are asserted.
RealMap's `review_*` marker statuses are labelled unverified, not construction.
Its optional edge coordinates preserve the source rail shape; existing city
maps keep their previous straight-edge rendering unless they supply geometry.

The projection in `data/reference/isfahan-candidate-preview.json` was derived
from the deterministic `pnpm candidate:isfahan` report at metto-data commit
`1e83f67df3b3dd8e599eb416c42ed93a2a2bee7f` (PR #37). It records that report's
SHA-256 and preserves review-only flags. It excludes construction extensions
and inactive stops. Original source attribution is OpenStreetMap contributors,
ODbL-1.0; see the linked source PR and its pinned raw source files.
