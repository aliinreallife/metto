"use client";

import Link from "next/link";
import { Globe, TrainFront } from "lucide-react";
import { useMetro } from "@/app/providers";
import { InstallButton } from "@/components/pwa";
import { STRINGS } from "@/lib/i18n";
import { WELCOME_CONTENT } from "../content";

// Slim standalone header for the landing page: brand, install entry and
// the language toggle (the app header that used to provide both is not
// rendered on / anymore).
export function TopBar() {
  const { lang, setLang } = useMetro();
  const t = STRINGS[lang];
  const isFa = lang === "fa";

  function toggleLang() {
    setLang(lang === "en" ? "fa" : "en");
  }

  return (
    <header className="z-20 flex items-center justify-between gap-3 border-b border-border bg-card/80 px-4 py-3 backdrop-blur md:px-6 md:py-4">
      <Link href="/" className="flex items-center gap-2.5 md:gap-3" aria-label={isFa ? "متو" : "metto"}>
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground md:size-10">
          <TrainFront className="size-5 md:size-6" />
        </span>
        <div className="leading-tight">
          <p className="text-base font-bold md:text-lg">{t.appTitle}</p>
          <p className="text-xs text-muted-foreground md:text-sm">
            {WELCOME_CONTENT[lang].hero.eyebrow} · {WELCOME_CONTENT[lang].hero.city}
          </p>
        </div>
      </Link>

      <div className="flex items-center gap-2 md:gap-3">
        <Link
          href="/route"
          className="hidden h-10 items-center rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground transition hover:brightness-110 active:scale-[0.98] sm:inline-flex"
        >
          {WELCOME_CONTENT[lang].hero.ctaPrimary}
        </Link>
        <InstallButton label={t.install} iosHintLabel={t.installIosHint} iosHintSteps={t.installIosSteps} />
        <button
          type="button"
          onClick={toggleLang}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-2 text-sm font-medium transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:px-3 md:py-2.5 md:text-base"
          aria-label={lang === "en" ? "فارسی — Toggle language" : "EN — تغییر زبان"}
        >
          <Globe className="size-4 md:size-5" />
          {lang === "en" ? "فارسی" : "EN"}
        </button>
      </div>
    </header>
  );
}
