/**
 * Narrow offline document fallback for the top-level static tabs.
 *
 * Background: Serwist precaches canonical documents (`/`, `/map`,
 * `/stations`, `/nearby`) but only strips `utm_*`/`fbclid` query params
 * when matching, so a navigation like `/map?from=ahang&to=aliabad` misses
 * the precache entry. The fallback below maps such requests back to their
 * canonical precached document — normalizing ONLY for the cache lookup.
 * The browser URL is never mutated or redirected.
 *
 * Rules encoded here (and mirrored in `app/sw.ts` fallback entries):
 * - same-origin only;
 * - full document navigations only (`request.mode === "navigate"`,
 *   defensively also `destination === "document"`) — RSC/Flight, API,
 *   assets and tiles can never match;
 * - exact pathname must be one of the four canonical static documents;
 * - unknown paths match nothing and fail normally offline.
 */

export const CANONICAL_STATIC_DOCS: ReadonlyArray<string> = [
  "/",
  "/map",
  "/stations",
  "/nearby",
];

/** Exact-match check against the canonical static documents. */
export function isCanonicalStaticDoc(pathname: string): boolean {
  return (CANONICAL_STATIC_DOCS as ReadonlyArray<string>).includes(pathname);
}

export interface DocumentFallbackRequestShape {
  mode: string;
  destination: string;
  url: string;
  origin: string;
}

/**
 * True when an offline-failed request should fall back to the precached
 * canonical document for `pathname`. Returns the canonical pathname to
 * look up (always identical to the entry's own pathname), or null.
 */
export function canonicalDocFallbackFor(
  pathname: `/${string}`,
  req: DocumentFallbackRequestShape,
): `/${string}` | null {
  if (req.mode !== "navigate") return null;
  // Defensive: navigation mode is the semantic criterion; destination is
  // an extra guard so non-document fetches can never match.
  if (req.destination !== "" && req.destination !== "document") return null;
  let url: URL;
  try {
    url = new URL(req.url, req.origin);
  } catch {
    return null;
  }
  if (url.origin !== req.origin) return null;
  if (url.pathname !== pathname) return null;
  return isCanonicalStaticDoc(pathname) ? pathname : null;
}
