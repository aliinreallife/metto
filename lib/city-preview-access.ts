/** Server-side release boundary, shared by every candidate city. */
export function cityPreviewsEnabled(
  env: Record<string, string | undefined> = process.env,
) {
  if (env.METTO_CITY_PREVIEWS === "0") return false;
  return env.VERCEL_ENV === "preview" ||
    (!env.VERCEL_ENV && env.NODE_ENV === "development");
}
