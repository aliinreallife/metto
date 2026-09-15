"use client";

import { useEffect, useState } from "react";
import { MapPin, RotateCcw } from "lucide-react";
import { STRINGS, type Lang } from "@/lib/i18n";
import type { GeoErrorKind } from "@/lib/geolocation";
import { isAndroidTwa, openAndroidLocationSettings } from "@/lib/twa";

function messageFor(lang: Lang, kind: GeoErrorKind): string {
  const t = STRINGS[lang];
  if (kind === "denied") return t.gpsDenied;
  if (kind === "timeout") return t.gpsTimeout;
  return t.gpsUnavailable;
}

// One error box for every "my location" button (route origin, nearby,
// map locate). Shows the classified message, a Retry action, and — only
// inside the Android TWA after an unavailable/timeout failure — the native
// "Turn on location" action. Plain browsers/PWAs never see that button.
export function LocationErrorActions({
  lang,
  kind,
  onRetry,
}: {
  lang: Lang;
  kind: GeoErrorKind;
  onRetry: () => void;
}) {
  const t = STRINGS[lang];
  const [inTwa, setInTwa] = useState(false);

  useEffect(() => {
    let live = true;
    void isAndroidTwa().then((v) => {
      if (live) setInTwa(v);
    });
    return () => {
      live = false;
    };
  }, []);

  const showTurnOn =
    inTwa && (kind === "unavailable" || kind === "timeout");
  const showRetry = kind !== "unsupported";

  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive md:text-sm"
    >
      <p>{messageFor(lang, kind)}</p>
      {(showRetry || showTurnOn) && (
        <div className="flex flex-wrap gap-2">
          {showTurnOn && (
            <button
              type="button"
              onClick={openAndroidLocationSettings}
              className="flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:text-sm"
            >
              <MapPin aria-hidden="true" className="size-3.5" />
              {t.turnOnLocation}
            </button>
          )}
          {showRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="flex items-center gap-1.5 rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-destructive/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:text-sm"
            >
              <RotateCcw aria-hidden="true" className="size-3.5" />
              {t.retry}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
