import manifest from "../data/previews/mashhad/manifest.json";

// Server boundary. Production authorization covers the pinned Lines 1/2
// station/path projection, not certification of the full candidate dataset.
export function mashhadEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return manifest.publicRelease.productionAuthorized &&
    env.METTO_MASHHAD_ENABLED !== "0" && env.METTO_MASHHAD_PREVIEW !== "0";
}
