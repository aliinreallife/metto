"use client";
import type { ReactNode } from "react";
import { ArrowUpDown } from "lucide-react";
import { STRINGS, type Lang } from "@/lib/i18n";

/** One planner form for every city; callers supply their station data/actions. */
export function RouteFields({ lang, originId, destinationId, origin, destination, originAction, afterOrigin, afterDestination, onSwap }: {
  lang: Lang; originId: string; destinationId: string; origin: ReactNode; destination: ReactNode;
  originAction?: ReactNode; afterOrigin?: ReactNode; afterDestination?: ReactNode; onSwap: () => void;
}) {
  const t = STRINGS[lang];
  return <>
    <label htmlFor={originId} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground md:text-sm">{t.from}</label>
    <div className="flex gap-2"><div className="min-w-0 flex-1">{origin}</div>{originAction}</div>
    {afterOrigin}
    <label htmlFor={destinationId} className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:text-sm">{t.to}</label>
    <div className="flex gap-2">
      <div className="min-w-0 flex-1">{destination}</div>
      <button type="button" onClick={onSwap} aria-label={t.swap}
        className="flex w-9 shrink-0 self-stretch items-center justify-center rounded-lg border border-border bg-background transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
        <ArrowUpDown aria-hidden="true" className="size-4" />
      </button>
    </div>
    {afterDestination}
  </>;
}
