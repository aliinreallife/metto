"use client";

import { useEffect, useState } from "react";
import { useConnectivity } from "../offline/use-connectivity";
import { haversineKm, estimateWalkMinutes } from "../geo";
import { getWalkingRoute, type WalkResult } from "./repository";
import { walkingKey, type WalkPoint } from "./route";
import { shouldRequestDirectWalk, type WalkingMetroPlan } from "./request-policy";

export function useWalkingRoute(from: WalkPoint | null | undefined, to: WalkPoint | null | undefined) {
  const { online } = useConnectivity();
  const key = walkingKey(from, to);
  const [result, setResult] = useState<{ key: string; online: boolean; value: WalkResult } | null>(null);
  useEffect(() => {
    if (!key || !from || !to) return;
    let cancelled = false;
    // Avoid sending requests for intermediate selections while a person types/swaps.
    const timer = setTimeout(() => {
      void getWalkingRoute(from, to, online).then((value) => {
        if (!cancelled) setResult({ key, online, value });
      });
    }, online ? 350 : 0);
    return () => { cancelled = true; clearTimeout(timer); };
    // Points with the same rounded coordinates are the same walking request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, online]);
  return {
    route: result?.key === key ? result.value?.route ?? null : null,
    saved: result?.key === key && result.value?.saved === true,
    loading: key !== null && online && (result?.key !== key || result.online !== online),
  };
}

export function useTripWalking(origin: WalkPoint | null | undefined, dest: WalkPoint | null | undefined,
  originStation: WalkPoint | null | undefined, destStation: WalkPoint | null | undefined,
  metro: WalkingMetroPlan) {
  const requestDirect = shouldRequestDirectWalk(origin, dest, originStation, destStation, metro);
  const direct = useWalkingRoute(requestDirect ? origin : null, requestDirect ? dest : null);
  const sameStation = !!originStation && !!destStation &&
    originStation.lat === destStation.lat && originStation.lng === destStation.lng;
  // A same-station journey is a direct walk; do not spend two extra requests
  // on station approaches that will never be offered as a metro journey.
  const access = useWalkingRoute(sameStation ? null : origin, originStation);
  const egress = useWalkingRoute(destStation, sameStation ? null : dest);
  const minutes = (from: WalkPoint | null | undefined, to: WalkPoint | null | undefined,
    route: typeof access.route) => {
    if (!from || !to) return 0;
    return route ? route.durationSeconds / 60 : estimateWalkMinutes(haversineKm(from.lat, from.lng, to.lat, to.lng));
  };
  const needsWalk = (from: WalkPoint | null | undefined, to: WalkPoint | null | undefined) =>
    !!from && !!to && haversineKm(from.lat, from.lng, to.lat, to.lng) >= 0.005;
  const accessApproximate = (needsWalk(origin, originStation) && !access.route) ||
    (needsWalk(destStation, dest) && !egress.route);
  return {
    direct, access, egress,
    accessMinutes: minutes(origin, originStation, access.route) + minutes(destStation, dest, egress.route),
    accessApproximate,
  };
}
