"use client";

// TWA-tolerant wrapper around navigator.geolocation.getCurrentPosition.
//
// Why this exists: in the installed Android TWA, location comes through
// Chrome location delegation (native prompt -> Play Services fix). A cold
// high-accuracy fix often takes longer than the 10 s timeout the app used
// before, surfacing as TIMEOUT while the PWA in Chrome (warm browser fix)
// succeeded. This helper tries high accuracy first with a longer timeout
// and a cached-fix allowance, then falls back once to low accuracy before
// giving up — so underground/cold-start TWA users get a fix instead of an
// instant error. Callers keep their existing denied/unavailable messaging.

export type GeoFix = { lat: number; lng: number };

const HIGH_ACCURACY_OPTS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 20000,
  maximumAge: 60000,
};

const LOW_ACCURACY_OPTS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 20000,
  maximumAge: 60000,
};

function once(options: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("geolocation-unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

function errorCode(err: unknown): number | null {
  if (typeof err === "object" && err !== null && "code" in err) {
    const code = (err as { code?: unknown }).code;
    if (code === 1 || code === 2 || code === 3) return code;
  }
  return null;
}

export async function getCurrentPositionTolerant(): Promise<GeoFix> {
  let pos: GeolocationPosition;
  try {
    pos = await once(HIGH_ACCURACY_OPTS);
  } catch (err) {
    // Only a high-accuracy TIMEOUT is worth a low-accuracy retry: denied or
    // unavailable would fail the same way again (and re-prompting is wrong).
    if (errorCode(err) === 3) {
      pos = await once(LOW_ACCURACY_OPTS);
    } else {
      throw err;
    }
  }
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}

export function isPermissionDenied(err: unknown): boolean {
  return errorCode(err) === 1;
}

// Classified geolocation failure. The web API cannot prove *why* a fix is
// unavailable (in particular it cannot prove the device Location master
// switch is OFF — POSITION_UNAVAILABLE also covers no-fix situations like
// being underground). Callers must word "unavailable"/"timeout" messages as
// *possible* Location-off guidance, never as a certainty, and only the
// native wrapper (LocationManager.isLocationEnabled) may claim certainty.
export type GeoErrorKind = "denied" | "unavailable" | "timeout" | "unsupported";

export function classifyGeoError(err: unknown): GeoErrorKind {
  if (err instanceof Error && err.message === "geolocation-unsupported") {
    return "unsupported";
  }
  const code = errorCode(err);
  if (code === 1) return "denied";
  if (code === 3) return "timeout";
  // code === 2, or anything unrecognized: generic "couldn't get a fix"
  // guidance. Never claim "GPS is off" here — see the note above.
  return "unavailable";
}
