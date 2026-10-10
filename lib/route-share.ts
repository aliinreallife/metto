// Share-preview builder: single source of truth for route share presentation.
//
// A share URL describes a specific journey state (city + stations + optional
// place pins + optional planned time). An SEO URL describes a durable
// transportation relationship — share URLs are therefore always
// `noindex, follow`, never in the sitemap, and canonicalized to the stable
// planner root. This module is Level-1 only: it resolves display names and
// the *selected* time from URL state and never calculates routes, ETAs, or
// next trains just to generate metadata.
//
// Isomorphic by design: imports only server-safe, client-safe pure modules
// (same graph the client planner already ships), so generateMetadata, the OG
// image handler, and future native-share text all share these semantics.
//
// Time model (unchanged): Tehran wall-clock input -> absolute instant -> UTC
// ISO Z in URL -> Tehran-local display via lib/tehran-time. Never the server
// or browser timezone, never a hardcoded offset.

import { getCityMeta } from "./cities";
import { encodePlacePin, parsePlaceParam } from "./geo";
import { STRINGS, persianDigits } from "./i18n";
import { getStation, resolveStationId } from "./metro/selectors";
import {
  formatPlanSummary,
  parseTimeModeParams,
  type TimeMode,
} from "./route-planning";

export const SHARE_PATH = "/share";
export const SHARE_OG_PATH = "/share/og";
export const SHARE_DEFAULT_CITY = "tehran";
export const SHARE_SITE_URL = "https://metto.ir";
export const SHARE_PLANNER_ROOT = "https://metto.ir/route";
export const SHARE_STATIC_IMAGE = "/socialprev.png";

/** Max display-label length (chars) before ellipsis — chat bubbles + OG card. */
export const SHARE_MAX_LABEL = 48;

// Generic fallback copy. Must match app/layout.tsx (root metadata) — the
// share page inherits the root layout, so fallback previews stay identical
// to every other non-route page.
export const SHARE_GENERIC_TITLE = "متو | مسیریاب مترو، ساده و سریع";
export const SHARE_GENERIC_DESC =
  "متو؛ مسیریاب رایگان مترو با زمان رسیدن، نقشه واقعی و اطلاعات ایستگاه‌ها.";

export interface SharePin {
  lat: number;
  lng: number;
  label: string;
}

export interface ShareTripState {
  /** City slug as given. Always emitted by the serializer. */
  city: string;
  /** False for unknown slugs (generic fallback, still noindex). */
  cityKnown: boolean;
  /** Canonical station slugs (legacy aliases resolved), or null. */
  from: string | null;
  to: string | null;
  /** Place pins: presentation only, never routing, never coordinates. */
  originPin: SharePin | null;
  destPin: SharePin | null;
  timeMode: TimeMode;
  /** Absolute instant (epoch ms), or null for now-mode / invalid `at`. */
  atMs: number | null;
}

export interface SharePresentation {
  valid: boolean;
  state: ShareTripState;
  /** Truncated FA display labels (pin label wins over station name). */
  originDisplay: string;
  destDisplay: string;
  /** FA title, e.g. "تجریش ← تئاتر شهر · رسیدن تا ۱۳:۳۵". No site suffix. */
  title: string;
  /** Standalone time phrase ("رسیدن تا ۱۳:۳۵") or "" for now-mode. */
  timePhrase: string;
  /** FA description: selection statement + CTA, never computed claims. */
  description: string;
  locale: "fa_IR";
  /** "/share/og?..." when valid, "/socialprev.png" otherwise. */
  imagePath: string;
  /** Canonical share path+query (serializer output). */
  sharePath: string;
  /** Absolute planner-root canonical. */
  canonical: string;
}

/**
 * Parse share state from URL params. Never throws; anything unresolvable
 * degrades (invalid `at` -> now-mode, unknown stations -> invalid state).
 * `city` omitted -> default city (old links stay valid forever).
 */
export function parseShareParams(sp: URLSearchParams): ShareTripState {
  const rawCity = (sp.get("city") ?? "").trim();
  const city = rawCity === "" ? SHARE_DEFAULT_CITY : rawCity;
  const cityKnown = getCityMeta(city) !== null;

  const rawFrom = (sp.get("from") ?? "").trim();
  const rawTo = (sp.get("to") ?? "").trim();
  const from = rawFrom === "" ? null : (resolveStationId(rawFrom) ?? null);
  const to = rawTo === "" ? null : (resolveStationId(rawTo) ?? null);

  // Compact op/dp first, legacy oPlat/oPlng/oPlabel second (old links).
  const originPin = parsePlaceParam(sp, "oP");
  const destPin = parsePlaceParam(sp, "dP");

  // Rejects naive (timezone-less) timestamps -> now-mode. Same contract as
  // the planner (lib/route-planning parseTimeModeParams).
  const { mode, at } = parseTimeModeParams(sp);

  // Minute-floor the instant: planner input is minute-precision, so seconds
  // carry no display meaning — but every distinct `at` is a distinct OG
  // image URL (CDN cache key). Flooring keeps canonical share URLs stable
  // and raises edge hit rates without changing any rendered time phrase.
  const atMs = at ? Math.floor(at.getTime() / 60000) * 60000 : null;

  return {
    city,
    cityKnown,
    from,
    to,
    originPin,
    destPin,
    timeMode: mode,
    atMs,
  };
}

/** A share state is previewable when the city is known and two distinct
 *  stations resolve. Boardability/topology are routing concerns, not
 *  preview concerns. */
export function isPreviewableState(s: ShareTripState): boolean {
  return (
    s.cityKnown && s.from !== null && s.to !== null && s.from !== s.to
  );
}

function truncateLabel(s: string, max: number = SHARE_MAX_LABEL): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

function stationFaName(slug: string): string {
  return getStation(slug)?.name.fa ?? slug;
}

/**
 * Build the FA-only (v1) presentation for a share state. Invalid states get
 * generic copy + the static image — never routed through the dynamic image
 * endpoint just to bounce back. `nowMs` is injectable for deterministic
 * tests (Action: pass Date.now() at request time).
 */
export function buildSharePresentation(
  sp: URLSearchParams,
  nowMs: number,
): SharePresentation {
  const state = parseShareParams(sp);
  const sharePath = serializeShareParams(state);

  if (!isPreviewableState(state)) {
    return {
      valid: false,
      state,
      originDisplay: "",
      destDisplay: "",
      title: SHARE_GENERIC_TITLE,
      timePhrase: "",
      description: SHARE_GENERIC_DESC,
      locale: "fa_IR",
      imagePath: SHARE_STATIC_IMAGE,
      sharePath,
      canonical: SHARE_PLANNER_ROOT,
    };
  }

  // from/to are non-null here (narrowed by isPreviewableState).
  const fromSlug = state.from as string;
  const toSlug = state.to as string;
  const originDisplay = truncateLabel(
    state.originPin?.label ?? stationFaName(fromSlug),
  );
  const destDisplay = truncateLabel(
    state.destPin?.label ?? stationFaName(toSlug),
  );

  // Selected-time phrase only; now-mode carries no time (a cached "now"
  // preview would go stale and mislead). Today shows bare time, other dates
  // prefix the date part — same parts as the in-app travel-time card.
  let timePhrase = "";
  if (state.timeMode !== "now" && state.atMs !== null) {
    const t = STRINGS.fa;
    const { dateLabel, timeLabel } = formatPlanSummary(
      "fa",
      state.atMs,
      nowMs,
    );
    const when =
      dateLabel === t.today ? timeLabel : `${dateLabel}، ${timeLabel}`;
    const verb = state.timeMode === "depart" ? t.leaveAt : t.arriveShort;
    timePhrase = `${verb} ${when}`;
  }

  const title =
    timePhrase === ""
      ? `${originDisplay} ← ${destDisplay}`
      : `${originDisplay} ← ${destDisplay} · ${timePhrase}`;

  // Selection statement + CTA. Deliberately no computed claims (no "best
  // route", no arrival times, no next trains — Level 1 computes nothing).
  const description =
    `این لینک، مسیر ${originDisplay} تا ${destDisplay} را در متو باز می‌کند. ` +
    `جزئیات مسیر و زمان‌بندی را همان‌جا ببینید.`;

  return {
    valid: true,
    state,
    originDisplay,
    destDisplay,
    title,
    timePhrase,
    description,
    locale: "fa_IR",
    imagePath: `${SHARE_OG_PATH}${sharePath.slice(SHARE_PATH.length)}`,
    sharePath,
    canonical: SHARE_PLANNER_ROOT,
  };
}

/**
 * Serialize share state to a canonical `/share?...` path+query. Always
 * emits `city` (new links are multi-city-safe from day one); `at` stays UTC
 * ISO Z; pins re-encode compactly (coords normalized, labels preserved).
 */
export function serializeShareParams(s: ShareTripState): string {
  const p = new URLSearchParams();
  p.set("city", s.city);
  if (s.from) p.set("from", s.from);
  if (s.to) p.set("to", s.to);
  if (s.originPin) p.set("op", encodePlacePin(s.originPin));
  if (s.destPin) p.set("dp", encodePlacePin(s.destPin));
  if (s.timeMode !== "now" && s.atMs !== null) {
    p.set("timeMode", s.timeMode);
    p.set("at", new Date(s.atMs).toISOString());
  }
  return `${SHARE_PATH}?${p.toString()}`;
}

/**
 * Normalize a planner/current URL into its canonical share URL when it
 * carries a route; otherwise return the input unchanged (preserves existing
 * copy behavior for routeless pages). Never throws.
 */
export function buildCopyShareUrl(href: string): string {
  try {
    const url = new URL(href);
    const state = parseShareParams(url.searchParams);
    if (!state.from || !state.to) return href;
    return new URL(serializeShareParams(state), url.origin).href;
  } catch {
    return href;
  }
}

/** Convert Next generateMetadata `searchParams` record to URLSearchParams. */
export function searchRecordToParams(
  record: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(record)) {
    const first = Array.isArray(v) ? v[0] : v;
    if (typeof first === "string") sp.append(k, first);
  }
  return sp;
}

/** Persian-digit guard for tests/docs (digits already localized upstream). */
export function shareDigits(s: string): string {
  return persianDigits(s, "fa");
}
