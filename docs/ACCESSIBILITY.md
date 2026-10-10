# Accessibility guide (metto)

Short checklist for anyone adding or changing anything users see or operate.
The best working example in this repo is `components/station-combobox.tsx`.

## When to think about accessibility

- New interactive UI: buttons, inputs, comboboxes, chips, tabs, links.
- Dialogs / sheets / bottom cards (timetable sheet, station detail).
- Map / visual UI (`components/real-map.tsx`, `app/(app)/map/client.tsx`).
- Live status / messages: loading, results count, warnings, errors, copy feedback.
- Language / direction changes (FA/EN, RTL/LTR).
- Animation / motion (ticker, rail, pulse, drift).
- Color / contrast choices.

## Checklist

- Every control has an accessible name. Use a real `<label>` where a
  visible label makes sense; use `aria-label` when it does not.
  `placeholder` is never the accessible name on its own.
- Keyboard support: Enter / Space activate, Escape closes/dismisses,
  Arrow keys move within listbox / radio / tabs where appropriate.
  Focus must return to the trigger after close
  (see `closeAndRefocusTrigger` in `station-combobox.tsx`).
- Visible `focus-visible` state on every interactive element
  (`focus-visible:ring-2 ...`). Never remove outline without a replacement.
- Semantic HTML first: `button`, `a`, `ul`/`ol`+`li`, `fieldset`+`legend`,
  `h1`-`h3`, `main`, `header`/`footer`+`nav`. Add ARIA only when HTML
  cannot say it.
- State attributes, only where true:
  - `aria-expanded` + `aria-controls` for disclosures/comboboxes
    (`route-panel.tsx`, `travel-time-card.tsx`).
  - `aria-pressed={active}` for toggle buttons / filter chips.
  - `aria-selected` for `role=option` (`station-combobox.tsx`).
  - `aria-current="page"` only for real navigation/current-location
    (mobile tabs in `app/nav.tsx`). Do not use it for filter chips.
- Live regions: `role="status"` + `aria-live="polite"` for loading /
  counts / results; `role="alert"` for errors / blocking warnings
  (`route-panel.tsx:217,289`, `location-error.tsx:47`).
- FA/EN `lang` and `dir`: `document.documentElement.lang/dir` follows app
  language (central in `app/providers.tsx`); per-node `dir="rtl"/"ltr"`
  for mixed content.
- RTL-safe CSS: logical Tailwind (`ms-/me-`, `ps-/pe-`, `start-/end-`,
  `rtl:rotate-180`), never physical `ml-/mr-`/`left-/right-` for layout.
- Touch targets around 44px where practical (`min-h-[44px]`, `size-9`,
  `min-h-[56px]` bottom tabs).
- Contrast awareness: small `muted-foreground` text is a known risk;
  do not make it worse. Palette redesign is out of scope here.
- `prefers-reduced-motion`: decorative infinite animations respect it
  (see `app/globals.css`). Do not add new infinite motion without it.

## Anti-patterns (seen in this repo, do not copy)

- Placeholder-only search input — `components/stations-tab.tsx` used to
  rely on `placeholder={t.searchStations}` alone. Fixed with
  `aria-label={t.searchStations}`, mirroring `station-combobox.tsx:195`.
- Visually selected chip without programmatic state — filter chips used
  `bg-primary` alone. Fixed with `aria-pressed={active}` in
  `stations-tab.tsx`, `station-timesheet.tsx`, `nearby-tab.tsx`, and the
  map mode toggle in `app/(app)/map/client.tsx`.
- Dialog without dialog semantics / focus handling — timetable sheet
  (`stations-tab.tsx:159-175`) and map `StationDetail`
  (`map/client.tsx:307-314`) have backdrop-click + Escape but no
  `role="dialog"`, no focus trap, no background `inert`. Left as-is
  (out of scope); do not add new dialogs in this style.
- Click-only Leaflet marker — `CircleMarker` dots in `real-map.tsx:571-585`
  handle `click/mouseover` only, with `keyboard:false` labels. Left as-is
  (out of scope); new map interactions need a keyboard path from day one.

## Bilingual guidance

- Accessible strings come from `lib/i18n.ts` (`STRINGS[lang]`). Support
  both FA and EN; never hardcode one language.
- Keep copy plain, no jargon, city-neutral (see `AGENTS.md`).
- Preserve direction handling for numeric/time values: `dir="ltr"` on
  times plus `persianDigits(value, lang)` (see `travel-time-card.tsx:334`).

## Verification

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `npx playwright test tests/a11y.spec.ts` when touching `/route`,
  `/stations`, `/nearby`, or `/map`.

Axe policy stays: `serious`/`critical` block, `moderate`/`minor` report
only (`tests/a11y.spec.ts:5-7`). Do not tighten thresholds in a feature PR.
