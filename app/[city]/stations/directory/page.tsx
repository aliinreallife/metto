import { notFound, permanentRedirect } from "next/navigation";

// Keep the proposed preview URL working, but do not create a second
// user-visible station directory. The original /stations list stays primary.
export const dynamicParams = false;
export function generateStaticParams() {
  return [{ city: "tehran" }];
}
export default async function StationDirectoryAlias({
  params,
}: { params: Promise<{ city: string }> }) {
  const { city } = await params;
  if (city !== "tehran") notFound();
  permanentRedirect("/stations");
}
