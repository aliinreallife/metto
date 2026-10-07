"use client";

import { useMemo } from "react";
import { STATIONS } from "@/lib/metro/stations";
import { ROUTES } from "@/lib/metro/routes";
import { LINES, LINE_COLORS } from "@/lib/metro/lines";
import {
  getStationLines,
  isInterchange,
} from "@/lib/metro/selectors";

/* ------------------------------------------------------------------ */
/* Canvas + projection (same nonlinear compression as the design mock:  */
/* the dense core keeps its proportions, regional tails are squeezed).  */
/* ------------------------------------------------------------------ */

export const CANVAS = { width: 680, height: 420, pad: 18 };

const X_CORE: [number, number] = [51.26, 51.56];
const X_WEST_MIN = 50.7;
const X_EAST_MAX = 51.62;

const Y_CORE: [number, number] = [35.575, 35.815];
const LAT_SOUTH_MIN = 35.38;
const LAT_NORTH_MAX = 35.88;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function projectX(lng: number): number {
  const inner = CANVAS.width - CANVAS.pad * 2;
  const [lo, hi] = X_CORE;
  let norm: number;
  if (lng < lo) {
    const r = clamp((lng - X_WEST_MIN) / (lo - X_WEST_MIN), 0, 1);
    norm = 0.2 * Math.sqrt(r);
  } else if (lng > hi) {
    const r = clamp((lng - hi) / (X_EAST_MAX - hi), 0, 1);
    norm = 0.95 + r * 0.05;
  } else {
    norm = 0.2 + ((lng - lo) / (hi - lo)) * 0.75;
  }
  return CANVAS.pad + norm * inner;
}

function projectY(lat: number): number {
  const inner = CANVAS.height - CANVAS.pad * 2;
  const [minLat, maxLat] = Y_CORE;
  let norm: number;
  if (lat > maxLat) {
    const r = clamp((lat - maxLat) / (LAT_NORTH_MAX - maxLat), 0, 1);
    norm = 0.1 - r * 0.05;
  } else if (lat < minLat) {
    const r = clamp((lat - LAT_SOUTH_MIN) / (minLat - LAT_SOUTH_MIN), 0, 1);
    norm = 0.9 + Math.pow(r, 0.75) * 0.1;
  } else {
    norm = 0.9 - ((lat - minLat) / (maxLat - minLat)) * 0.8;
  }
  return CANVAS.pad + norm * inner;
}

/* ------------------------------------------------------------------ */
/* Schematic model built from the real metro dataset                   */
/* ------------------------------------------------------------------ */

export type MapStation = {
  id: string;
  fa: string;
  en: string;
  x: number;
  y: number;
  lines: number[];
  isTransfer: boolean;
};

export type MapRoute = {
  kind: "main" | "branch";
  stationIds: string[];
  d: string;
};

export type MapLine = {
  id: number;
  routes: MapRoute[];
  stationIds: Set<string>;
};

function toPath(points: { x: number; y: number }[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

export function lineColor(id: number): string {
  return LINE_COLORS[id] ?? "#cc0e2d";
}

export function useWelcomeMap() {
  return useMemo(() => {
    const byId = new Map<string, MapStation>();
    for (const s of STATIONS) {
      byId.set(s.id, {
        id: s.id,
        fa: s.name.fa,
        en: s.name.en,
        x: Math.round(projectX(s.location.lng) * 10) / 10,
        y: Math.round(projectY(s.location.lat) * 10) / 10,
        lines: getStationLines(s.id),
        isTransfer: isInterchange(s.id),
      });
    }

    const lines: MapLine[] = LINES.map((meta) => {
      const routes = ROUTES.filter((r) => r.lineId === meta.id);
      const mapRoutes: MapRoute[] = [];
      for (const r of routes) {
        const pts = r.stops
          .map((stop) => byId.get(stop.stationId))
          .filter((s): s is MapStation => Boolean(s))
          .map((s) => ({ x: s.x, y: s.y }));
        if (pts.length < 2) continue;
        mapRoutes.push({
          kind: r.branchId ? "branch" : "main",
          stationIds: r.stops.map((s) => s.stationId),
          d: toPath(pts),
        });
      }
      // The first route of a line is the trunk; extra routes are branches.
      mapRoutes.forEach((r, i) => {
        if (i > 0) r.kind = "branch";
      });
      const stationIds = new Set<string>();
      for (const r of mapRoutes) for (const id of r.stationIds) stationIds.add(id);
      return { id: meta.id, routes: mapRoutes, stationIds };
    });

    const all = [...byId.values()];
    const transfers = all.filter((s) => s.isTransfer);

    return { stations: all, byId, lines, transfers };
  }, []);
}

export type MapLabel = {
  station: MapStation;
  anchor: "start" | "middle" | "end";
  dx: number;
  dy: number;
  fa: string;
  en: string;
};

/** Termini and major interchanges, matched by canonical station id. */
const LABEL_SPEC: {
  id: string;
  anchor: MapLabel["anchor"];
  dx: number;
  dy: number;
  fa?: string;
  en?: string;
}[] = [
  { id: "tajrish", anchor: "end", dx: -9, dy: 3 },
  { id: "qaem", anchor: "end", dx: -9, dy: -8 },
  { id: "farhangsara", anchor: "end", dx: -9, dy: 13 },
  { id: "shahid-kolahdooz", anchor: "end", dx: -9, dy: -8 },
  { id: "varzeshgah-e-takhti", anchor: "end", dx: -9, dy: 13 },
  { id: "basij", anchor: "start", dx: 9, dy: 3 },
  { id: "kouhsar", anchor: "start", dx: 9, dy: 3 },
  { id: "meydan-e-ketab", anchor: "start", dx: 9, dy: 3 },
  { id: "karaj", anchor: "start", dx: 9, dy: 3 },
  { id: "shahid-sepahbod-qasem-soleimani", anchor: "start", dx: 8, dy: 3, fa: "هشتگرد", en: "Hashtgerd" },
  { id: "chaharbagh", anchor: "end", dx: -9, dy: 3 },
  { id: "tehran-sadeghiyeh", anchor: "start", dx: 10, dy: -8 },
  { id: "imam-khomeini", anchor: "end", dx: -10, dy: 4 },
  { id: "shahid-beheshti", anchor: "start", dx: 9, dy: -8 },
  { id: "azadegan", anchor: "start", dx: 10, dy: 4 },
  { id: "haram-e-hazrat-e-abdol-azim", anchor: "start", dx: 10, dy: 4 },
  { id: "emam-khomeini-airport", anchor: "end", dx: -9, dy: 4, fa: "فرودگاه", en: "Airport" },
];

export function buildLabels(byId: Map<string, MapStation>): MapLabel[] {
  const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const out: MapLabel[] = [];

  for (const spec of LABEL_SPEC) {
    const station = byId.get(spec.id);
    if (!station) continue;

    const text = spec.fa ?? station.fa;
    const w = Math.max(28, text.length * 5.4);
    const x = station.x + spec.dx;
    const y = station.y + spec.dy;
    const x0 = spec.anchor === "end" ? x - w : spec.anchor === "middle" ? x - w / 2 : x;
    const box = { x0, y0: y - 7, x1: x0 + w, y1: y + 7 };

    const clipped = x0 < CANVAS.pad - 4 || box.x1 > CANVAS.width - CANVAS.pad + 8;
    const overlaps = placed.some((p) => box.x0 < p.x1 && box.x1 > p.x0 && box.y0 < p.y1 && box.y1 > p.y0);
    if (clipped || overlaps) continue;

    placed.push(box);
    out.push({
      station,
      anchor: spec.anchor,
      dx: spec.dx,
      dy: spec.dy,
      fa: spec.fa ?? station.fa,
      en: spec.en ?? station.en,
    });
  }
  return out;
}
