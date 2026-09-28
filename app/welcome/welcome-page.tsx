"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpDown,
  Clock3,
  Download,
  LocateFixed,
  Map,
  MapPinned,
  Search,
  Share2,
  TrainFront,
  WifiOff,
} from "lucide-react";
import { useMetro } from "@/app/providers";

const content = {
  fa: {
    dir: "rtl", eyebrow: "متو | METTO", hero: "مسیریاب مترو، ساده و سریع", sub: "مبدأ و مقصد را بزن — بهترین مسیر، زمان رسیدن و قطار بعدی را ببین.", start: "شروع مسیریابی", map: "دیدن نقشه", trust: "رایگان · بدون ثبت‌نام · آفلاین کار می‌کند", demo: "یک مسیر را امتحان کن", try: "امتحان در اپ", origin: "تجریش", destination: "صادقیه", features: "همه‌چیز برای یک سفر راحت", featureSub: "اطلاعاتی که در مسیر لازم داری، بدون شلوغی.", how: "چطور کار می‌کند؟", pwa: "روی گوشی نصب کن، توی مترو بدون اینترنت باز می‌شود", install: "از منوی مرورگر، افزودن به صفحه اصلی را بزن.", faq: "سؤال‌های متداول", footer: "ساخته‌شده توسط aliinreallife · داده‌های مترو از mostafa-kheibary", more: "بیشتر ببین", steps: ["مبدأ و مقصد را انتخاب کن", "مسیر و زمان را ببین", "لینک را به اشتراک بگذار"], faqs: [["آیا رایگان است؟", "بله، متو رایگان است و برای استفاده نیازی به ثبت‌نام نداری."], ["کدام شهرها را پوشش می‌دهد؟", "متو از تهران شروع کرده و برای چند شهر ساخته شده است."], ["آیا آفلاین کار می‌کند؟", "بله، پوسته برنامه و اطلاعات اصلی مسیرها روی گوشی در دسترس می‌ماند."], ["داده‌ها از کجا می‌آیند؟", "اطلاعات ایستگاه‌ها و زمان‌بندی‌ها از داده‌های عمومی مترو تهیه می‌شوند."]],
  },
  en: {
    dir: "ltr", eyebrow: "METTO | متو", hero: "A metro planner, simple and fast", sub: "Pick your start and destination — see the best route, arrival time, and next train.", start: "Start planning", map: "View map", trust: "Free · No sign-up · Works offline", demo: "Try a route", try: "Try in app", origin: "Tajrish", destination: "Sadeghiyeh", features: "Everything for an easier trip", featureSub: "The details you need on the way, without the clutter.", how: "How it works", pwa: "Install it on your phone. Open it in the metro without internet.", install: "Use your browser menu and choose Add to Home Screen.", faq: "Frequently asked questions", footer: "Made by aliinreallife · Metro data by mostafa-kheibary", more: "Explore more", steps: ["Choose your start and destination", "See your route and timing", "Share the link"], faqs: [["Is it free?", "Yes. metto is free and needs no sign-up."], ["Which cities are covered?", "metto starts with Tehran and is built to support more cities."], ["Does it work offline?", "Yes. The app shell and core route data stay available on your phone."], ["Where does the data come from?", "Station and timetable information comes from public metro data."]],
  },
} as const;

const features = [
  [Search, "مسیریابی هوشمند", "جست‌وجوی مکان، پیدا کردن نزدیک‌ترین ایستگاه و لینک قابل اشتراک.", "Place search finds the nearest station, with swap and shareable links."],
  [Clock3, "زمان رسیدن واقعی", "زمان‌بندی، زمان تعویض، قطار سریع خط ۵ و سرویس روزهای تعطیل.", "Timetable-aware ETA with transfer walks, express trains, and holiday service."],
  [TrainFront, "۱۵۱ ایستگاه، ۷ خط", "فهرست قابل فیلتر، حرکت‌های بعدی و جدول کامل ساعت‌ها.", "Filter stations, see departures, and browse the full-day timesheet."],
  [Map, "نقشه واقعی", "نقشه مینیمال Leaflet با حالت ماهواره‌ای و نمایش خطوط دلخواه.", "A minimalist Leaflet map with satellite view and line toggles."],
  [LocateFixed, "نزدیک من", "ایستگاه‌های نزدیک، امکانات و لینک مسیر تا ایستگاه را پیدا کن.", "Find nearby stations, amenities, and walking directions."],
  [WifiOff, "آفلاین و فارسی", "نصب‌پذیر، راست‌چین، با تاریخ‌های جلالی و پوسته آفلاین.", "Installable PWA with RTL, Jalali dates, and an offline shell."],
] as const;

export function WelcomePage() {
  const { lang } = useMetro();
  const t = content[lang];
  const isFa = lang === "fa";
  return (
    <div dir={t.dir} className="h-full overflow-y-auto bg-background">
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        <section className="grid items-center gap-10 py-10 md:grid-cols-[1.1fr_0.9fr] md:py-20">
          <div className="max-w-2xl">
            <p className="mb-5 text-sm font-semibold tracking-wide text-primary">{t.eyebrow}</p>
            <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">{t.hero}</h1>
            <p className="mt-6 max-w-xl text-lg leading-9 text-muted-foreground sm:text-xl">{t.sub}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/" className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-primary px-5 font-semibold text-primary-foreground transition hover:opacity-90">{t.start} {isFa ? <ArrowLeft data-icon="inline-end" /> : <ArrowRight data-icon="inline-end" />}</Link>
              <Link href="/map" className="inline-flex min-h-12 items-center gap-2 rounded-lg border border-border px-5 font-semibold transition hover:bg-accent">{t.map}</Link>
            </div>
            <p className="mt-5 text-sm text-muted-foreground">{t.trust}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-7">
            <div className="mb-5 flex items-center justify-between"><span className="text-sm font-semibold">{t.demo}</span><span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">metto</span></div>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 rounded-lg border border-border bg-background p-4"><span className="size-2 rounded-full bg-primary" /><span className="flex-1 text-sm">{t.origin}</span><span className="text-xs text-muted-foreground">{isFa ? "مبدأ" : "Start"}</span></div>
              <div className="flex justify-center"><ArrowUpDown className="size-4 text-muted-foreground" /></div>
              <div className="flex items-center gap-3 rounded-lg border border-border bg-background p-4"><span className="size-2 rounded-full border-2 border-primary" /><span className="flex-1 text-sm">{t.destination}</span><span className="text-xs text-muted-foreground">{isFa ? "مقصد" : "End"}</span></div>
            </div>
            <Link href="/?from=tajrish&to=tehran-sadeghiyeh" className="mt-5 flex min-h-11 items-center justify-center rounded-lg bg-secondary font-medium transition hover:bg-accent">{t.try} {isFa ? <ArrowLeft className="mr-2 size-4" /> : <ArrowRight className="ml-2 size-4" />}</Link>
          </div>
        </section>

        <section className="border-t border-border py-16 sm:py-20"><div className="mb-10 max-w-xl"><h2 className="text-3xl font-bold">{t.features}</h2><p className="mt-3 text-muted-foreground">{t.featureSub}</p></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{features.map(([Icon, title, desc, en]) => <article key={title} className="rounded-lg border border-border bg-card p-5"><div className="mb-6 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="size-5" /></div><h3 className="font-bold">{isFa ? title : en.split(".")[0]}</h3><p className="mt-2 text-sm leading-7 text-muted-foreground">{isFa ? desc : en}</p>{isFa && <p className="mt-3 text-xs leading-5 text-muted-foreground/80" dir="ltr">{en}</p>}</article>)}</div></section>

        <section className="grid gap-8 border-t border-border py-16 sm:grid-cols-2 sm:py-20"><div><h2 className="text-3xl font-bold">{t.how}</h2><div className="mt-8 flex flex-col gap-6">{t.steps.map((step, i) => <div key={step} className="flex items-center gap-4"><span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{isFa ? ["۱", "۲", "۳"][i] : i + 1}</span><span className="font-medium">{step}</span></div>)}</div></div><div className="rounded-xl bg-primary p-7 text-primary-foreground"><Download className="size-6" /><h2 className="mt-8 text-2xl font-bold">{t.pwa}</h2><p className="mt-3 leading-7 text-primary-foreground/80">{t.install}</p></div></section>

        <section className="border-t border-border py-16 sm:py-20"><h2 className="mb-8 text-3xl font-bold">{t.faq}</h2><div className="grid gap-4 sm:grid-cols-2">{t.faqs.map(([q, a]) => <details key={q} className="group rounded-lg border border-border bg-card p-5"><summary className="cursor-pointer list-none font-semibold">{q}<span className="float-end text-primary">+</span></summary><p className="mt-4 text-sm leading-7 text-muted-foreground">{a}</p></details>)}</div></section>

        <footer className="flex flex-col gap-6 border-t border-border pt-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><p>{t.footer}</p><nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label={t.more}><Link href="/" className="hover:text-foreground">{isFa ? "مسیر" : "Route"}</Link><Link href="/stations" className="hover:text-foreground">{isFa ? "ایستگاه‌ها" : "Stations"}</Link><Link href="/nearby" className="hover:text-foreground">{isFa ? "نزدیک من" : "Nearby"}</Link><a href="https://github.com/aliinreallife/metto" target="_blank" rel="noreferrer" className="hover:text-foreground">GitHub</a></nav></footer>
      </main>
    </div>
  );
}
