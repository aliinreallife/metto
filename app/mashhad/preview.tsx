"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMetro } from "@/app/providers";
import { mashhadPreview } from "@/lib/mashhad-preview";
import { STRINGS, persianDigits, type Lang } from "@/lib/i18n";
import { AppSkipLink } from "../(app)/skip-link";
import { useSearchParams } from "next/navigation";
import { ArrowUpDown, Map as MapIcon, Link2 } from "lucide-react";
import { CityStationPicker } from "@/components/city-station-picker";
import { catalogStations } from "@/lib/city-catalog";

const byId = new Map(mashhadPreview.stations.map(s => [s.id, s]));
const stations = catalogStations(["mashhad"]);
const control = "min-h-[44px] rounded-lg border bg-background px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export function MashhadPreview({ initialFrom: fromProp, initialTo: toProp, initialLang: langProp, embedded = false }: {
  initialFrom?: string; initialTo?: string; initialLang?: Lang; embedded?: boolean;
}) {
  const params = useSearchParams();
  const initialFrom = fromProp ?? params.get("from") ?? undefined;
  const initialTo = toProp ?? params.get("to") ?? undefined;
  const requestedLang = params.get("lang");
  const initialLang = langProp ?? (requestedLang === "fa" || requestedLang === "en" ? requestedLang : undefined);
  const { lang: preferredLang, setLang } = useMetro();
  // A shared URL's language must also win on the server/first render, before
  // the provider hydrates the saved preference. This avoids rewriting it.
  const [selectedLang, setSelectedLang] = useState<Lang | undefined>(initialLang);
  const languageReady = useRef(!initialLang);
  const lang = embedded ? preferredLang : selectedLang ?? preferredLang;
  const t = STRINGS[lang];
  const [from, setFrom] = useState(byId.has(initialFrom ?? "") ? initialFrom! : "");
  const [to, setTo] = useState(byId.has(initialTo ?? "") ? initialTo! : "");
  const [invalidLink, setInvalidLink] = useState(Boolean(
    (initialFrom && !byId.has(initialFrom)) || (initialTo && !byId.has(initialTo)),
  ));
  useEffect(() => { if (initialLang) setLang(initialLang); }, [initialLang, setLang]);
  useEffect(() => {
    let active = true;
    try {
      const savedFrom = localStorage.getItem("mashhad.route.from");
      const savedTo = localStorage.getItem("mashhad.route.to");
      queueMicrotask(() => {
        if (!active) return;
        if (!initialFrom && savedFrom && byId.has(savedFrom)) setFrom(savedFrom);
        if (!initialTo && savedTo && byId.has(savedTo)) setTo(savedTo);
      });
    } catch { /* storage optional */ }
    return () => { active = false; };
    // Restore only on mount; explicit city-scoped URLs win.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!languageReady.current) {
      if (preferredLang !== initialLang) return;
      languageReady.current = true;
    }
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries({ from, to, lang })) {
      if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
    }
    if (url.href !== window.location.href) window.history.replaceState(null, "", url);
    try {
      if (from) localStorage.setItem("mashhad.route.from", from);
      if (to) localStorage.setItem("mashhad.route.to", to);
    } catch { /* storage optional */ }
  }, [from, to, lang, initialLang, preferredLang]);
  const result = useMemo(() => mashhadPreview.findPath(from, to), [from, to]);
  const number = (value: string | number) => persianDigits(value, lang);
  const lineName = (id: string) => `${t.line} ${number(id.split(":").at(-1)!)}`;
  const name = (id: string) => byId.get(id)?.names[lang] ?? id;
  const routeHref = `/mashhad/route?${new URLSearchParams({ from, to, lang })}`;
  const Container = embedded ? "div" : "main";

  return <>
    {!embedded && <AppSkipLink />}
    <Container id={embedded ? undefined : "main-content"} tabIndex={-1} data-testid="city-path-preview"
      className="no-scrollbar flex size-full flex-col overflow-y-auto overflow-x-hidden overscroll-contain p-4 md:items-center md:p-8 lg:p-10"
      lang={lang} dir={lang === "fa" ? "rtl" : "ltr"}>
      <div className="flex w-full max-w-xl flex-col gap-4 md:max-w-2xl md:gap-5">
        <h1 className="sr-only">{t.cityPreviewTitle}</h1>
        <p className="text-xs leading-relaxed text-muted-foreground" data-testid="city-no-times">
          <span className="me-2 rounded bg-muted px-1.5 py-0.5 font-medium text-foreground/80">{t.cityPreviewBadge}</span>
          {t.cityPathOnly}
        </p>
        {!embedded && <button type="button" className={control} onClick={() => {
          const next = lang === "fa" ? "en" : "fa"; setSelectedLang(next); setLang(next);
        }}>{lang === "fa" ? "English" : "فارسی"}</button>}
        <section aria-label={t.findRoute} className="flex flex-col gap-2.5">
          <label htmlFor="city-from" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground md:text-sm">{t.from}</label>
          <CityStationPicker id="city-from" stations={stations} value={from} lang={lang} placeholder={t.searchStations} accentClass="bg-primary"
            onChange={id => { setFrom(id); setInvalidLink(false); }} />
          <label htmlFor="city-to" className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:text-sm">{t.to}</label>
          <div className="flex gap-2">
            <CityStationPicker id="city-to" stations={stations} value={to} lang={lang} placeholder={t.searchStations} accentClass="bg-foreground"
              onChange={id => { setTo(id); setInvalidLink(false); }} />
            <button type="button" aria-label={t.swap} className="flex min-h-[44px] w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary"
              onClick={() => { setFrom(to); setTo(from); setInvalidLink(false); }}><ArrowUpDown aria-hidden="true" className="size-4" /></button>
          </div>
          {invalidLink ? <p role="alert" className="mt-3 text-sm">{t.cityPreviewInvalidLink}</p>
            : from && to && from === to ? <p role="alert" className="mt-3 text-sm">{t.sameStation}</p>
              : from && to && !result ? <p role="alert" className="mt-3 text-sm">{t.noRoute}</p>
                : !result ? <p className="mt-4 rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">{t.pickBoth}</p> : null}
        </section>
        {result && <section aria-labelledby="city-route-title" data-testid="city-route-result" className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h2 id="city-route-title" className="text-sm font-bold">{t.routeOverview}</h2>
            <p role="status" aria-live="polite" className="mt-1 text-xs text-muted-foreground">{number(result.stops)} {t.stops} · {number(result.transfers.length)} {t.transfers}</p>
          </div>
          <ol className="grid gap-5 p-4">
            {result.legs.map((leg, i) => <li key={`${leg.lineId}:${i}`}>
              {i > 0 && <p className="mb-3 text-sm font-medium">{t.cityPreviewTransfer} {name(leg.stationIds[0])}</p>}
              <h3 className="text-xs font-semibold text-muted-foreground">{lineName(leg.lineId)}</h3>
              <ol className="ms-1 mt-3 grid gap-2 border-s-2 border-primary/50 ps-4 text-sm">
                {leg.stationIds.map(id => <li key={id}>{name(id)}</li>)}
              </ol>
            </li>)}
          </ol>
          <div className="flex border-t border-border">
            <a href={routeHref} className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 text-xs text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary"><Link2 aria-hidden="true" className="size-3.5" />{t.cityPreviewShare}</a>
            <Link href={`/mashhad/map?${new URLSearchParams({ from, to, lang })}`} className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 border-s border-border text-xs font-semibold text-primary hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary"><MapIcon aria-hidden="true" className="size-3.5" />{t.tabMap}</Link>
          </div>
        </section>}
        <Link href={`/mashhad/stations?lang=${lang}`} className="inline-flex min-h-[44px] items-center self-start text-xs font-medium text-muted-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-primary">
          {t.cityPreviewStationList} ({number(stations.length)})
        </Link>
        <details className="text-xs leading-relaxed text-muted-foreground">
          <summary className="cursor-pointer py-2 focus-visible:outline-2 focus-visible:outline-primary">{t.cityPreviewDataSource}</summary>
          <p className="mt-2">{t.cityPreviewNotice} {t.cityPreviewNoTimes}</p>
          <p className="mt-2">
            <a className="inline-flex min-h-[44px] items-center underline" href="https://github.com/shahriaarrr/mashhad-metro-data">shahriaarrr/mashhad-metro-data</a>
            {" · "}<a className="inline-flex min-h-[44px] items-center underline" href="https://www.openstreetmap.org/copyright">{t.cityPreviewOsmCredit}</a>
            {" · "}<a className="inline-flex min-h-[44px] items-center underline" href="https://opendatacommons.org/licenses/odbl/1-0/">ODbL 1.0</a>
            {" · "}<a className="inline-flex min-h-[44px] items-center underline" href="https://github.com/aliinreallife/metto-data/tree/af057821dee7cbd5fcd2bf9ebde079070d8ac20c/data/cities/mashhad">{t.cityPreviewDataDownload}</a>
          </p>
        </details>
      </div>
    </Container>
  </>;
}
