import data from "@/data/reference/isfahan-candidate-preview.json";
export const isfahanCandidate = data;
export function candidatePreviewAllowed(
  env: { VERCEL_ENV?: string; NODE_ENV?: string } = process.env,
) {
  return (
    env.VERCEL_ENV === "preview" ||
    (!env.VERCEL_ENV && env.NODE_ENV === "development")
  );
}
export function candidateTrack(from: string | null, to: string | null) {
  const ids = data.stations.map((s) => s.id),
    a = from ? ids.indexOf(from) : -1,
    b = to ? ids.indexOf(to) : -1;
  if (a < 0 || b < 0 || a === b) return null;
  const low = Math.min(a, b),
    high = Math.max(a, b),
    stations = ids.slice(low, high + 1);
  return {
    stationIds: a < b ? stations : stations.reverse(),
    tracks: data.tracks.slice(low, high),
  };
}
