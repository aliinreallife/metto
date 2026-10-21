import { Check, PlusSquare, Share, Smartphone } from "lucide-react";
import { STRINGS, persianDigits, type Lang } from "@/lib/i18n";

/** Shared by the install section and the app header's iOS guide. */
export function IosInstallGuide({
  lang,
  titleId,
  headingLevel = 3,
}: {
  lang: Lang;
  titleId: string;
  headingLevel?: 2 | 3;
}) {
  const t = STRINGS[lang];
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const steps = [
    { Icon: Share, title: t.installIosShare, hint: t.installIosShareHint },
    { Icon: PlusSquare, title: t.installIosChoose, hint: t.installIosChooseHint },
    { Icon: Check, title: t.installIosConfirm, hint: t.installIosConfirmHint },
  ];

  return (
    <div>
      <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
        <Smartphone className="size-4 text-primary" aria-hidden="true" />
        <span dir="ltr">iPhone &amp; iPad</span>
      </div>
      <Heading id={titleId} className="mt-3 text-xl font-black leading-snug text-foreground">
        {t.installIosHint}
      </Heading>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{t.installIosSafari}</p>
      <ol role="list" className="mt-5 space-y-3">
        {steps.map(({ Icon, title, hint }, index) => (
          <li key={title} className="flex items-start gap-3 rounded-xl border border-border bg-background p-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden="true">
              <Icon className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold leading-6 text-foreground">{title}</p>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{hint}</p>
            </div>
            <span className="pt-0.5 text-xs font-bold leading-6 text-muted-foreground" aria-hidden="true">
              {persianDigits(index + 1, lang)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
