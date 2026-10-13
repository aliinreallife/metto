"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useMetro } from "@/app/providers";

const REPO_URL = "https://github.com/aliinreallife/metto";
const DATA_URL = "https://github.com/mostafa-kheibary/tehran-metro-data";
const REYMIT_URL = "https://reymit.ir/aliinreallife";

type Section = { h: string; ps: string[] };

const COPY: Record<"fa" | "en", { title: string; intro: string; back: string; sections: Section[] }> = {
  fa: {
    title: "حریم خصوصی",
    intro:
      "متو بدون ثبت‌نام کار می‌کند و داده‌ای درباره شما روی سرور نگه نمی‌دارد. این صفحه دقیقاً می‌گوید چه چیزی کجا می‌رود.",
    back: "بازگشت به مسیریاب",
    sections: [
      {
        h: "موقعیت مکانی",
        ps: [
          "موقعیت مکانی فقط برای پیدا کردن ایستگاه‌های نزدیک و تعیین مبدأ استفاده می‌شود؛ محاسبه نزدیک‌ترین ایستگاه روی خود گوشی انجام می‌شود.",
          "می‌توانید به‌جای دادن دسترسی، ایستگاه را دستی انتخاب کنید.",
        ],
      },
      {
        h: "جستجوی مکان",
        ps: [
          "وقتی نام یک مکان را جستجو می‌کنید، متن جستجو به سرویس Nominatim اوپن‌استریت‌مپ فرستاده می‌شود. وقتی موقعیت GPS به نام محله تبدیل می‌شود، مختصات به همین سرویس فرستاده می‌شود.",
        ],
      },
      {
        h: "نقشه",
        ps: ["تصویرهای نقشه از CARTO و Esri بارگذاری می‌شوند. نام و نشان آن‌ها روی نقشه دیده می‌شود."],
      },
      {
        h: "آمار فنی",
        ps: [
          "در نسخه نهایی، آمار پایه استفاده و عملکرد از طریق Vercel Analytics و Speed Insights جمع می‌شود.",
        ],
      },
      {
        h: "داده‌های برنامه",
        ps: [
          "زمان‌بندی‌ها و اطلاعات تعطیلات از خود metto.ir دانلود می‌شوند و بررسی اتصال اینترنت هم با سرویس خود برنامه انجام می‌شود.",
          "تقویم تعطیلات در سمت سرور به‌روز می‌شود؛ هیچ اطلاعاتی درباره شما به آن سرویس فرستاده نمی‌شود.",
        ],
      },
      {
        h: "ذخیره‌سازی روی گوشی شما",
        ps: [
          "زبان، انتخاب‌های مسیر و حافظه نصب فقط در مرورگر شما می‌ماند. پوسته برنامه و داده‌ها برای استفاده آفلاین روی گوشی ذخیره می‌شوند.",
          "حساب کاربری وجود ندارد. با پاک کردن داده‌های سایت، همه‌چیز پاک می‌شود؛ چیزی روی سرور برای حذف کردن نیست.",
        ],
      },
      {
        h: "حمایت مالی",
        ps: [
          "حمایت کاملاً اختیاری است و از طریق سایت ریمیت انجام می‌شود؛ هیچ قابلیت یا محتوایی در ازای پرداخت باز نمی‌شود.",
        ],
      },
      {
        h: "منبع و تماس",
        ps: [
          "متو متن‌باز است و داده‌های مترو از مجموعه mostafa-kheibary گرفته شده است. گزارش خطا و پیشنهاد در گیت‌هاب انجام می‌شود.",
        ],
      },
    ],
  },
  en: {
    title: "Privacy",
    intro:
      "metto works with no sign-up and keeps no data about you on a server. This page states exactly what goes where.",
    back: "Back to route planner",
    sections: [
      {
        h: "Location",
        ps: [
          "Your location is only used to find nearby stations and to set your origin; the nearest-station math runs on your own device.",
          "You can pick a station manually instead of granting access.",
        ],
      },
      {
        h: "Place search",
        ps: [
          "When you search for a place name, the search text is sent to OpenStreetMap's Nominatim service. When a GPS fix is turned into a neighborhood name, the coordinates are sent to the same service.",
        ],
      },
      {
        h: "Map",
        ps: ["Map imagery loads from CARTO and Esri. Their attribution is shown on the map."],
      },
      {
        h: "Analytics",
        ps: [
          "In production, basic usage and performance telemetry is collected through Vercel Analytics and Speed Insights.",
        ],
      },
      {
        h: "App data",
        ps: [
          "Timetables and holiday data download from metto.ir itself, and connectivity is checked with the app's own endpoint.",
          "The holiday calendar refreshes server-side; nothing about you is sent to that service.",
        ],
      },
      {
        h: "On-device storage",
        ps: [
          "Language, route selections and install memory stay only in your browser. The app shell and data are cached on the device for offline use.",
          "There is no account. Clearing site data removes everything; there is nothing on a server to delete.",
        ],
      },
      {
        h: "Donations",
        ps: [
          "Donating is fully voluntary and goes through the Reymit website — no feature or content is unlocked by paying.",
        ],
      },
      {
        h: "Source & contact",
        ps: [
          "metto is open source and the metro data comes from mostafa-kheibary's dataset. Bug reports and ideas live on GitHub.",
        ],
      },
    ],
  },
};

function Links({ lang }: { lang: "fa" | "en" }) {
  const cls =
    "font-medium text-primary underline decoration-primary/30 underline-offset-4 hover:decoration-primary";
  return (
    <>
      {lang === "fa" ? (
        <p className="mt-6 border-t border-border pt-4 text-sm leading-8 text-muted-foreground">
          <a href={REPO_URL} target="_blank" rel="noreferrer noopener" className={cls}>
            گیت‌هاب متو
          </a>
          {" · "}
          <a href={DATA_URL} target="_blank" rel="noreferrer noopener" className={cls}>
            داده‌های مترو
          </a>
          {" · "}
          <a href={REYMIT_URL} target="_blank" rel="noreferrer noopener" className={cls}>
            ریمیت
          </a>
        </p>
      ) : (
        <p className="mt-6 border-t border-border pt-4 text-sm leading-8 text-muted-foreground">
          <a href={REPO_URL} target="_blank" rel="noreferrer noopener" className={cls}>
            metto on GitHub
          </a>
          {" · "}
          <a href={DATA_URL} target="_blank" rel="noreferrer noopener" className={cls}>
            metro dataset
          </a>
          {" · "}
          <a href={REYMIT_URL} target="_blank" rel="noreferrer noopener" className={cls}>
            Reymit
          </a>
        </p>
      )}
    </>
  );
}

export function PrivacyPage() {
  const { lang } = useMetro();
  const c = COPY[lang];
  const isFa = lang === "fa";

  useEffect(() => {
    const suffix = isFa ? " | متو" : " | metto";
    document.title = c.title + suffix;
  }, [c.title, isFa]);

  return (
    <main className="flex size-full flex-col bg-background text-foreground">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <article className="mx-auto w-full max-w-xl px-4 py-6 md:py-8">
          <div className="flex items-center gap-3">
            <Link
              href="/route"
              aria-label={c.back}
              title={c.back}
              className="group inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-sm transition hover:border-primary/40 hover:bg-primary/5 hover:text-primary active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {isFa ? (
                <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-0.5" />
              ) : (
                <ArrowLeft aria-hidden="true" className="size-4 transition-transform group-hover:-translate-x-0.5" />
              )}
            </Link>
            <h1 className="text-xl font-black tracking-tight md:text-2xl">{c.title}</h1>
          </div>
          <p className="mt-3 text-sm leading-8 text-muted-foreground">{c.intro}</p>
          {c.sections.map((s) => (
            <section key={s.h} className="mt-6">
              <h2 className="text-base font-bold">{s.h}</h2>
              {s.ps.map((p) => (
                <p key={p} className="mt-2 text-sm leading-8 text-muted-foreground">
                  {p}
                </p>
              ))}
            </section>
          ))}
          <Links lang={lang} />
        </article>
      </div>
    </main>
  );
}
