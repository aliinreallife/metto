"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMetro } from "@/app/providers";
import { mashhadPreview } from "@/lib/mashhad-preview";
import { STRINGS, persianDigits, type Lang } from "@/lib/i18n";
import { AppSkipLink } from "../(app)/skip-link";
import { useSearchParams } from "next/navigation";

const byId = new Map(mashhadPreview.stations.map(s => [s.id, s]));
const normalize = (text: string) => text.toLowerCase().replace(/ك/g, "ک").replace(/ي/g, "ی").replace(/\u200c/g, " ").trim();
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
  const [query, setQuery] = useState("");
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
  const stations = useMemo(() => [...mashhadPreview.stations].sort((a, b) => a.names[lang].localeCompare(b.names[lang], lang)), [lang]);
  const found = useMemo(() => stations.filter(s => normalize(s.names.fa).includes(normalize(query)) || normalize(s.names.en).includes(normalize(query))), [stations, query]);
  const result = useMemo(() => mashhadPreview.findPath(from, to), [from, to]);
  const number = (value: string | number) => persianDigits(value, lang);
  const lineName = (id: string) => `${t.line} ${number(id.split(":").at(-1)!)}`;
  const name = (id: string) => byId.get(id)?.names[lang] ?? id;
  const routeHref = `/mashhad/route?${new URLSearchParams({ from, to, lang })}`;
  const Container = embedded ? "div" : "main";

  return <>
    {!embedded && <AppSkipLink />}
    <Container id={embedded ? undefined : "main-content"} tabIndex={-1} data-testid="city-path-preview" className="min-h-0 flex-1 overflow-y-auto" lang={lang} dir={lang === "fa" ? "rtl" : "ltr"}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 pb-12">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div><h1 className="text-xl font-bold">{t.cityPreviewTitle}</h1><p className="mt-2 text-sm">{t.cityPreviewScope}</p></div>
          <button type="button" className={control} onClick={() => {
            const next = lang === "fa" ? "en" : "fa";
            setSelectedLang(next); setLang(next);
          }}
            lang={lang === "fa" ? "en" : "fa"} dir={lang === "fa" ? "ltr" : "rtl"}>{lang === "fa" ? "English" : "فارسی"}</button>
        </header>
        <aside className="rounded-xl border border-amber-600 bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">
          <p>{t.cityPreviewNotice}</p><p className="mt-2" data-testid="city-no-times">{t.cityPreviewNoTimes}</p>
        </aside>
        <section aria-labelledby="path-form-title" className="rounded-xl border p-4">
          <h2 id="path-form-title" className="font-bold">{t.findRoute}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><label htmlFor="city-from">{t.from}</label>
              <select id="city-from" className={control} value={from} onChange={e => { setFrom(e.target.value); setInvalidLink(false); }}>
                <option value="">{t.from}</option>{stations.map(s => <option key={s.id} value={s.id}>{s.names[lang]}</option>)}
              </select>
            </div>
            <div className="grid gap-2"><label htmlFor="city-to">{t.to}</label>
              <select id="city-to" className={control} value={to} onChange={e => { setTo(e.target.value); setInvalidLink(false); }}>
                <option value="">{t.to}</option>{stations.map(s => <option key={s.id} value={s.id}>{s.names[lang]}</option>)}
              </select>
            </div>
          </div>
          <button type="button" className={`${control} mt-4`} onClick={() => { setFrom(to); setTo(from); setInvalidLink(false); }}>{t.swap}</button>
          {invalidLink ? <p role="alert" className="mt-4">{t.cityPreviewInvalidLink}</p>
            : from && to && from === to ? <p role="alert" className="mt-4">{t.sameStation}</p>
              : from && to && !result ? <p role="alert" className="mt-4">{t.noRoute}</p>
                : !result ? <p className="mt-4 text-sm">{t.pickBoth}</p> : null}
        </section>
        {result && <section aria-labelledby="city-route-title" data-testid="city-route-result" className="rounded-xl border p-4">
          <h2 id="city-route-title" className="font-bold">{t.routeOverview}</h2>
          <p role="status" aria-live="polite" className="mt-2">{number(result.stops)} {t.stops} · {number(result.transfers.length)} {t.transfers}</p>
          <ol className="mt-4 grid gap-5">
            {result.legs.map((leg, i) => <li key={`${leg.lineId}:${i}`}>
              {i > 0 && <p className="mb-2 font-medium">{t.cityPreviewTransfer} {name(leg.stationIds[0])}</p>}
              <h3 className="font-bold">{lineName(leg.lineId)}</h3>
              <ol className="mt-2 grid gap-1 border-s-2 ps-4">
                {leg.stationIds.map(id => <li key={id}>{name(id)}</li>)}
              </ol>
            </li>)}
          </ol>
          <a href={routeHref} className={`${control} mt-5 inline-flex items-center underline`}>{t.cityPreviewShare}</a>
          <Link href={`/mashhad/map?${new URLSearchParams({ from, to, lang })}`} className={`${control} ms-2 mt-5 inline-flex items-center underline`}>{t.tabMap}</Link>
        </section>}
        <section aria-labelledby="city-stations-title">
          <h2 id="city-stations-title" className="font-bold">{t.cityPreviewStationList} ({number(mashhadPreview.stations.length)})</h2>
          <label htmlFor="city-station-search" className="mt-3 block text-sm">{t.searchStations}</label>
          <input id="city-station-search" type="search" className={`${control} mt-2 w-full`} value={query} onChange={e => setQuery(e.target.value)} />
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">{found.map(s => <li key={s.id} className="rounded-lg border p-3">
            <span>{s.names[lang]}</span>
            <p className="mt-1 text-sm">{mashhadPreview.getStationLineIds(s.id).map(lineName).join(" · ")}</p>
          </li>)}</ul>
          {found.length === 0 && <p role="status" className="mt-3">{t.noResults}</p>}
        </section>
        <footer>
          <Link href="/route" className={`${control} inline-flex items-center underline`}>{t.cityPreviewBack}</Link>
          <p className="mt-3 text-sm">{t.cityPreviewDataSource}: {" "}
            <a className="inline-flex min-h-[44px] items-center underline focus-visible:outline-2" href="https://github.com/shahriaarrr/mashhad-metro-data">shahriaarrr/mashhad-metro-data</a>
            {" · "}<a className="inline-flex min-h-[44px] items-center underline focus-visible:outline-2" href="https://www.openstreetmap.org/copyright">{t.cityPreviewOsmCredit}</a>
            {" · "}<a className="inline-flex min-h-[44px] items-center underline focus-visible:outline-2" href="https://opendatacommons.org/licenses/odbl/1-0/">ODbL 1.0</a>
            {" · "}<a className="inline-flex min-h-[44px] items-center underline focus-visible:outline-2" href="https://github.com/aliinreallife/metto-data/tree/af057821dee7cbd5fcd2bf9ebde079070d8ac20c/data/cities/mashhad">{t.cityPreviewDataDownload}</a>
          </p>
        </footer>
      </div>
    </Container>
  </>;
}

