import { STRINGS, type Lang } from "@/lib/i18n";

export function TimetableHelpNotice({ lang }: { lang: Lang }) {
  const t = STRINGS[lang];
  const params = new URLSearchParams({ title: t.cityTimetableIssueTitle, body: t.cityTimetableIssueBody });
  return <p className="text-xs leading-relaxed text-muted-foreground" data-testid="city-no-times">
    {t.cityPathOnly}{" "}
    <a href={`https://github.com/aliinreallife/metto/issues/new?${params}`} target="_blank" rel="noopener noreferrer"
      className="inline-flex min-h-11 items-center rounded-sm font-medium text-primary underline underline-offset-4 hover:decoration-primary/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
      {t.cityTimetableHelp}<span className="sr-only"> — {t.opensInNewTab}</span>
    </a>
  </p>;
}
