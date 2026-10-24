import { STRINGS, type Lang } from "@/lib/i18n";

export function TimetableHelpNotice({ lang }: { lang: Lang }) {
  const t = STRINGS[lang];
  const params = new URLSearchParams({ title: t.cityTimetableIssueTitle, body: t.cityTimetableIssueBody });
  let href = `https://github.com/aliinreallife/metto/issues/new?${params}`;
  // Enable only after the anonymous contribution backend has been deployed and checked.
  if (process.env.NEXT_PUBLIC_DATA_CONTRIBUTIONS_URL) {
    try {
      const portal = new URL(process.env.NEXT_PUBLIC_DATA_CONTRIBUTIONS_URL);
      if (portal.protocol === "https:" && !portal.username && !portal.password) {
        portal.searchParams.set("city", "mashhad");
        portal.searchParams.set("kind", "timetable");
        portal.searchParams.set("lang", lang);
        href = portal.href;
      }
    } catch { /* Keep the existing contribution link if configuration is invalid. */ }
  }
  return <p className="text-xs leading-relaxed text-muted-foreground" data-testid="city-no-times">
    {t.cityPathOnly}{" "}
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="rounded-sm font-medium text-primary underline underline-offset-4 hover:decoration-primary/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
      {t.cityTimetableHelp}<span className="sr-only"> — {t.opensInNewTab}</span>
    </a>.
  </p>;
}
