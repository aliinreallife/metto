import { notFound, redirect } from "next/navigation";
import { availableCityIds } from "@/lib/city-availability";
export const dynamic = "force-dynamic";
// Keep the first shared preview link working inside the normal app.
export default async function Page({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!availableCityIds().includes("isfahan")) notFound();
  const params = await searchParams;
  redirect(`/isfahan/map?lang=${params.lang === "en" ? "en" : "fa"}`);
}
