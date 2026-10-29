import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { candidatePreviewAllowed } from "@/lib/isfahan-preview";
import { IsfahanReview } from "./review";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Isfahan review preview | Metto",
  robots: { index: false, follow: false },
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!candidatePreviewAllowed()) notFound();
  const params = await searchParams;
  return <IsfahanReview initialLang={params.lang === "en" ? "en" : "fa"} />;
}
