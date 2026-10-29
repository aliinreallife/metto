import { expect, it } from "vitest";
import {
  candidatePreviewAllowed,
  candidateTrack,
  isfahanCandidate,
} from "./isfahan-preview";
it("serves the review only on previews or local development", () => {
  expect(
    candidatePreviewAllowed({ VERCEL_ENV: "preview", NODE_ENV: "production" }),
  ).toBe(true);
  expect(candidatePreviewAllowed({ NODE_ENV: "development" })).toBe(true);
  for (const env of [
    { VERCEL_ENV: "production", NODE_ENV: "production" },
    { VERCEL_ENV: "production", NODE_ENV: "development" },
    { NODE_ENV: "production" },
    {},
  ])
    expect(candidatePreviewAllowed(env)).toBe(false);
});
it("keeps the pinned candidate scoped to 20 core identities and original rail shapes", () => {
  expect(isfahanCandidate.reviewOnly).toBe(true);
  expect(isfahanCandidate.readyForProduction).toBe(false);
  expect(isfahanCandidate.stations).toHaveLength(20);
  expect(isfahanCandidate.tracks).toHaveLength(19);
  expect(isfahanCandidate.source.commit).toBe(
    "1e83f67df3b3dd8e599eb416c42ed93a2a2bee7f",
  );
  expect(
    isfahanCandidate.stations
      .filter((s) => s.boardingReview === "conflicting-reports")
      .map((s) => s.names.fa),
  ).toEqual(["دانشگاه", "کارگر"]);
  for (const e of isfahanCandidate.tracks) {
    expect(e.geometry.length).toBeGreaterThan(1);
    for (const p of e.geometry) {
      expect(p.lat).toBeGreaterThan(32.58);
      expect(p.lat).toBeLessThan(32.73);
    }
  }
});
it("shows reversible track selections while rejecting foreign or incomplete endpoints", () => {
  const ids = isfahanCandidate.stations.map((s) => s.id),
    forward = candidateTrack(ids[0], ids[19])!,
    reverse = candidateTrack(ids[19], ids[0])!;
  expect(forward.stationIds).toHaveLength(20);
  expect(forward.tracks).toHaveLength(19);
  expect(reverse.stationIds).toEqual([...forward.stationIds].reverse());
  expect(candidateTrack(ids[3], ids[8])?.tracks).toHaveLength(5);
  for (const [a, b] of [
    [null, ids[0]],
    [ids[0], ids[0]],
    ["tehran:station:qods", ids[0]],
    ["isfahan:station:extension", ids[0]],
  ])
    expect(candidateTrack(a, b)).toBeNull();
});
