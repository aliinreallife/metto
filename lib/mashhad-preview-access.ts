// Server boundary only: do not import this module into client components.
export function mashhadPreviewEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.METTO_MASHHAD_PREVIEW === "1" && env.VERCEL_ENV !== "production";
}
