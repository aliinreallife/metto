import { buildTabHref, type PlacePinParam } from "./geo";
import { applyTimeParams, parseTimeModeParams } from "./route-planning";

/**
 * Build a top-level app-tab URL while preserving the planner state that is
 * meaningful across pages. Route/place state is supplied by MetroContext;
 * advanced travel time is read from the current URL because `/route` already
 * keeps that pair canonical via applyTimeParams.
 *
 * Invalid/partial time params intentionally collapse to Now through
 * parseTimeModeParams, so broken URLs are never propagated between tabs.
 */
export function buildStatefulTabHref(
  base: string,
  args: {
    from?: string | null;
    to?: string | null;
    originPlace?: PlacePinParam;
    destPlace?: PlacePinParam;
  },
  currentSearchParams: URLSearchParams,
): string {
  const baseHref = buildTabHref(base, args);
  const separator = baseHref.indexOf("?");
  const pathname = separator === -1 ? baseHref : baseHref.slice(0, separator);
  const params = new URLSearchParams(
    separator === -1 ? "" : baseHref.slice(separator + 1),
  );
  const { mode, at } = parseTimeModeParams(currentSearchParams);
  applyTimeParams(params, mode, at);
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
