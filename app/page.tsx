"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowUpDown, Route as RouteIcon, TrainFront, Globe } from "lucide-react"
import { MetroMap } from "@/components/metro-map"
import { StationCombobox } from "@/components/station-combobox"
import { RoutePanel } from "@/components/route-panel"
import { StationDetail } from "@/components/station-detail"
import { InstallButton } from "@/components/pwa"
import { LINE_COLORS, STATIONS } from "@/lib/metro-data"
import { STATION_MAP, findRoute } from "@/lib/route"
import { STRINGS, persianDigits, type Lang } from "@/lib/i18n"
import { cn } from "@/lib/utils"

type MapMode = "geographic" | "schematic"

const LINE_NUMBERS = Object.keys(LINE_COLORS).map(Number).sort((a, b) => a - b)

export default function Page() {
  const [lang, setLang] = useState<Lang>("en")
  const [mode, setMode] = useState<MapMode>("geographic")
  const [originId, setOriginId] = useState<string | null>(null)
  const [destId, setDestId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const t = STRINGS[lang]
  const isFa = lang === "fa"

  const route = useMemo(() => {
    if (!originId || !destId || originId === destId) return null
    return findRoute(originId, destId)
  }, [originId, destId])

  useEffect(() => {
    document.documentElement.lang = isFa ? "fa" : "en"
    document.documentElement.dir = isFa ? "rtl" : "ltr"
  }, [isFa])

  function swap() {
    setOriginId(destId)
    setDestId(originId)
  }

  const selected = selectedId ? STATION_MAP.get(selectedId) : null

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="z-10 flex items-center justify-between gap-3 border-b border-border bg-card/80 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <TrainFront className="size-5" />
          </span>
          <div className="leading-tight">
            <h1 className="text-base font-bold">{t.appTitle}</h1>
            <p className="text-xs text-muted-foreground">{t.appSubtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <InstallButton label={t.install} />
          <button
            type="button"
            onClick={() => setLang((l) => (l === "en" ? "fa" : "en"))}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-2 text-sm font-medium transition-colors hover:bg-accent"
            aria-label="Toggle language"
          >
            <Globe className="size-4" />
            {lang === "en" ? "فارسی" : "EN"}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Sidebar */}
        <aside className="flex max-h-[45dvh] shrink-0 flex-col gap-3 overflow-y-auto border-b border-border bg-background p-4 md:max-h-none md:w-[380px] md:border-b-0 md:border-e">
          {/* planner */}
          <div className="flex flex-col gap-2">
            <div className="flex items-end gap-2">
              <div className="flex flex-1 flex-col gap-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.from}</label>
                <StationCombobox
                  value={originId}
                  onChange={setOriginId}
                  placeholder={t.origin}
                  lang={lang}
                  accentClass="bg-primary"
                />
                <label className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.to}</label>
                <StationCombobox
                  value={destId}
                  onChange={setDestId}
                  placeholder={t.destination}
                  lang={lang}
                  accentClass="bg-foreground"
                />
              </div>
              <button
                type="button"
                onClick={swap}
                aria-label={t.swap}
                className="mb-0.5 flex size-9 items-center justify-center rounded-lg border border-border bg-background transition-colors hover:bg-accent"
              >
                <ArrowUpDown className="size-4" />
              </button>
            </div>
          </div>

          {/* result / detail / hint */}
          <div className="flex flex-col gap-3">
            {selected ? (
              <StationDetail
                station={selected}
                lang={lang}
                onClose={() => setSelectedId(null)}
                onSetOrigin={() => {
                  setOriginId(selected.id)
                  setSelectedId(null)
                }}
                onSetDest={() => {
                  setDestId(selected.id)
                  setSelectedId(null)
                }}
              />
            ) : null}

            {route ? (
              <RoutePanel route={route} lang={lang} />
            ) : !selected ? (
              <p className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground">
                {originId && destId && originId === destId ? t.sameStation : t.pickBoth}
              </p>
            ) : null}

            {originId && destId && originId !== destId && !route && (
              <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
                {t.noRoute}
              </p>
            )}
          </div>

          {/* legend */}
          <div className="mt-auto pt-2">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.lines}</p>
            <div className="flex flex-wrap gap-1.5">
              {LINE_NUMBERS.map((l) => (
                <span key={l} className="flex items-center gap-1.5 rounded-full bg-muted px-2 py-1 text-xs">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: LINE_COLORS[l] }} />
                  {t.line} {persianDigits(l, lang)}
                </span>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {persianDigits(STATIONS.length, lang)} {isFa ? "ایستگاه" : "stations"}
            </p>
          </div>
        </aside>

        {/* Map */}
        <main className="relative min-h-0 flex-1 p-3">
          <div className="absolute left-5 top-5 z-10 flex rounded-lg border border-border bg-background/90 p-1 shadow-sm backdrop-blur">
            <ModeBtn active={mode === "geographic"} onClick={() => setMode("geographic")} icon={<Globe className="size-4" />}>
              {t.geographic}
            </ModeBtn>
            <ModeBtn active={mode === "schematic"} onClick={() => setMode("schematic")} icon={<RouteIcon className="size-4" />}>
              {t.schematic}
            </ModeBtn>
          </div>
          <MetroMap
            mode={mode}
            lang={lang}
            route={route}
            originId={originId}
            destId={destId}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </main>
      </div>
    </div>
  )
}

function ModeBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      <span className="hidden sm:inline">{children}</span>
    </button>
  )
}
