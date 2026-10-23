// Server boundary only: do not import this module into client components.
export function mashhadPreviewEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env.VERCEL_ENV === "production" || env.METTO_MASHHAD_PREVIEW === "0") return false;
  return env.VERCEL_ENV === "preview" || env.VERCEL_ENV === "development" ||
    env.NODE_ENV === "development" || env.METTO_MASHHAD_PREVIEW === "1";
}
