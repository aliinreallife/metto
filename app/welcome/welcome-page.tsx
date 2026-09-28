"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMetro } from "@/app/providers";
import { WELCOME_CONTENT } from "./content";
import { cn } from "@/lib/utils";
import { Hero } from "./components/Hero";
import { DemoStrip } from "./components/DemoStrip";
import { Donate } from "./components/Donate";
import { Features } from "./components/Features";
import { HowItWorks } from "./components/HowItWorks";
import { PwaStrip } from "./components/PwaStrip";
import { Faq } from "./components/Faq";
import { WelcomeFooter } from "./components/WelcomeFooter";

const FAQ_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "آیا متو رایگان است؟",
      acceptedAnswer: {
        "@type": "Answer",
        text: "بله. همه چیز رایگان است و نیازی به ثبت‌نام یا پرداخت نیست. هیچ تبلیغی هم نمایش داده نمی‌شود.",
      },
    },
    {
      "@type": "Question",
      name: "کدام شهرها پشتیبانی می‌شوند؟",
      acceptedAnswer: {
        "@type": "Answer",
        text: "در حال حاضر مترو تهران با ۱۵۱ ایستگاه و ۷ خط. شهرهای دیگر به‌مرور اضافه می‌شوند.",
      },
    },
    {
      "@type": "Question",
      name: "آیا آفلاین کار می‌کند؟",
      acceptedAnswer: {
        "@type": "Answer",
        text: "بله. متو روی گوشی نصب می‌شود و پوسته برنامه و داده ایستگاه‌ها ذخیره می‌شود، بنابراین داخل مترو بدون اینترنت هم باز می‌شود.",
      },
    },
    {
      "@type": "Question",
      name: "داده‌ها از کجاست؟",
      acceptedAnswer: {
        "@type": "Answer",
        text: "داده ایستگاه‌ها و خط‌ها از مجموعه داده باز mostafa-kheibary گرفته شده و زمان‌بندی‌ها بر اساس اطلاعات اعلام‌شده شرکت مترو است.",
      },
    },
  ],
};

function MobileCta() {
  const { lang } = useMetro();
  const t = WELCOME_CONTENT[lang].hero;
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 620);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 backdrop-blur-md transition-transform duration-300 sm:hidden",
        show ? "translate-y-0" : "translate-y-full",
      )}
      style={{ bottom: "calc(56px + env(safe-area-inset-bottom))" }}
    >
      <div className="grid grid-cols-[1fr_auto] gap-2 p-3">
        <Link
          href="/"
          className="inline-flex h-11 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground active:scale-[0.98]"
        >
          {t.ctaPrimary}
        </Link>
        <Link
          href="/map"
          className="inline-flex h-11 items-center justify-center rounded-lg border border-border px-4 text-sm font-bold"
        >
          {t.ctaSecondary}
        </Link>
      </div>
    </div>
  );
}

export function WelcomePage() {
  const { lang } = useMetro();
  const t = WELCOME_CONTENT[lang];
  const dir = lang === "fa" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  return (
    <div dir={dir} className="h-full overflow-y-auto bg-background text-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }} />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-primary-foreground"
      >
        {t.misc.skip}
      </a>
      <main id="main" className="flex min-h-0 flex-1 flex-col">
        <Hero />
        <DemoStrip />
        <Donate />
        <Features />
        <HowItWorks />
        <PwaStrip />
        <Faq />
      </main>
      <WelcomeFooter />
      <MobileCta />
      <div className="h-16 sm:hidden" aria-hidden />
    </div>
  );
}
