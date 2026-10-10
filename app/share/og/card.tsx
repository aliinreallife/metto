// OG card element tree (host elements only — Satori-compatible).
// Rendered by app/share/og/route.ts via ImageResponse. Not a component:
// exported as a builder returning the element so the route handler stays
// JSX-free TypeScript.
//
// Layout: horizontal split — text column on the right (RTL leading side),
// dedicated map panel on the left. The map NEVER sits behind text: each
// section owns its box (text 520px, gap 48px, panel 512x534 — see OG_PANEL).
//
// RTL note (verified against real renders): Satori implements no RTL
// *paragraph* order — neither dir="rtl" nor direction:"rtl" changes word
// order inside a text node. True RTL *visual* order is achieved structurally
// instead: every line is a flex row-reverse whose children are individual
// word nodes in logical order, so the first word lands rightmost. The outer
// split itself is explicit LTR row order [map, text] so the section
// placement never depends on Satori's direction handling.

import type { CSSProperties, ReactNode } from "react";
import { lineOnColor } from "@/lib/metro/lines";
import { persianDigits } from "@/lib/i18n";
import { OG_PANEL, type ShareLineLeg, type ShareMapModel } from "./map";

const BRAND_RED = "#cc0e2d";
const TEXT_COL_W = 520;

function RtlRow({
  children,
  gap = 0,
  style,
}: {
  children: ReactNode;
  gap?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      dir="rtl"
      style={{
        display: "flex",
        flexDirection: "row-reverse",
        alignItems: "center",
        gap,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// Schematic strip: origin dot — line-colored legs (width ∝ stops ridden)
// — interchange dots — destination dot. Travel order reads right-to-left,
// mirroring the names above. Widths are computed in JS against the known
// column width (no flex-grow reliance — Satori-safe fixed boxes).
function LineStrip({ legs, width }: { legs: ShareLineLeg[]; width: number }) {
  if (legs.length === 0) return null;
  const total = legs.reduce((a, l) => a + Math.max(l.stops, 1), 0);
  const dotsSpace = 2 * 14 + Math.max(legs.length - 1, 0) * 10;
  const avail = Math.max(width - dotsSpace, legs.length * 24);
  let widths = legs.map((l) =>
    Math.max(24, (avail * Math.max(l.stops, 1)) / total),
  );
  const sum = widths.reduce((a, w) => a + w, 0);
  if (sum > avail) {
    widths = widths.map((w) => Math.max(12, (w * avail) / sum));
  }
  const barH = 6;
  const children: ReactNode[] = [
    <div
      key="o"
      style={{
        width: "14px",
        height: "14px",
        borderRadius: "50%",
        background: BRAND_RED,
        flexShrink: 0,
      }}
    />,
  ];
  legs.forEach((leg, i) => {
    children.push(
      <div
        key={`b${i}`}
        style={{
          width: `${Math.round(widths[i])}px`,
          height: `${barH}px`,
          borderRadius: `${barH / 2}px`,
          background: leg.color,
          flexShrink: 0,
        }}
      />,
    );
    if (i < legs.length - 1) {
      children.push(
        <div
          key={`x${i}`}
          style={{
            width: "10px",
            height: "10px",
            borderRadius: "50%",
            background: "#e4e4e7",
            flexShrink: 0,
          }}
        />,
      );
    }
  });
  children.push(
    <div
      key="d"
      style={{
        width: "14px",
        height: "14px",
        borderRadius: "50%",
        background: BRAND_RED,
        flexShrink: 0,
      }}
    />,
  );
  return <RtlRow>{children}</RtlRow>;
}

// Line chips in travel order (deduped): colored pills with audited
// foreground contrast (lineOnColor). Labels come from the model (LINES
// names, FA-only v1).
function LineChips({ legs }: { legs: ShareLineLeg[] }) {
  const seen = new Set<number>();
  const unique = legs.filter((l) => {
    if (seen.has(l.line)) return false;
    seen.add(l.line);
    return true;
  });
  if (unique.length === 0) return null;
  return (
    <RtlRow gap={10}>
      {unique.map((l) => (
        <div
          key={l.line}
          style={{
            background: l.color,
            color: lineOnColor(l.line),
            borderRadius: "12px",
            padding: "8px 16px",
            fontSize: 26,
            fontWeight: 700,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {l.label}
        </div>
      ))}
    </RtlRow>
  );
}

// Trip meta: boardable-stop and physical-transfer counts from the static
// topology (never times or ETAs). Zero transfers reads as "بدون تعویض".
function TripMeta({
  numStops,
  numTransfers,
}: {
  numStops: number;
  numTransfers: number;
}) {
  const words: string[] = [
    ...`${persianDigits(numStops, "fa")} ایستگاه`.split(" "),
    "•",
    ...(numTransfers === 0
      ? ["بدون", "تعویض"]
      : `${persianDigits(numTransfers, "fa")} تعویض`.split(" ")),
  ];
  return (
    // Wide gaps: at card scale a tight "• ۱" merges into a "۱۰" lookalike.
    <RtlRow gap={18}>
      {words.map((w, i) => (
        <div key={i} style={{ fontSize: 28, color: "#a1a1aa" }}>
          {w}
        </div>
      ))}
    </RtlRow>
  );
}

// Left-pointing arrow drawn from boxes, not a glyph: Vazirmatn ships no
// arrow codepoints (U+2190 etc. are absent from both weights), so a "←"
// character only renders via system-font fallback — which exists on dev
// machines but NOT on the production function runtime. A missing glyph
// renders as nothing (verified: the arrow silently vanished from the
// split-layout card). Boxes render identically everywhere.
//
// Head is a 45°-rotated square inside an overflow-hidden box, so only its
// left half (a triangle) shows. (The classic zero-size border-triangle
// trick does NOT work in Satori — it paints a solid square.) Rotation +
// overflow-hidden are the same primitives the map panel already relies on.
function LeftArrow({ size }: { size: number }) {
  const r1 = (n: number): number => Math.round(n * 10) / 10;
  const barH = Math.max(6, Math.round(size * 0.15));
  const barW = Math.round(size * 0.55);
  const headH = Math.max(8, Math.round(size * 0.22));
  const headW = headH * 2;
  const sq = headH * Math.SQRT2;
  const sqOff = headH - sq / 2;
  return (
    <RtlRow style={{ flexShrink: 0 }}>
      <div
        style={{
          width: `${barW}px`,
          height: `${barH}px`,
          background: "#fafafa",
          borderRadius: `${r1(barH / 2)}px`,
          flexShrink: 0,
        }}
      />
      <div
        style={{
          width: `${headW}px`,
          height: `${headH * 2}px`,
          position: "relative",
          overflow: "hidden",
          flexShrink: 0,
          display: "flex",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: `${r1(sqOff)}px`,
            top: `${r1(sqOff)}px`,
            width: `${r1(sq)}px`,
            height: `${r1(sq)}px`,
            background: "#fafafa",
            transform: "rotate(45deg)",
          }}
        />
      </div>
    </RtlRow>
  );
}

export function renderShareCard(
  originDisplay: string,
  destDisplay: string,
  timePhrase: string,
  map: ShareMapModel | null,
) {
  // Text column is ~half the old full-bleed width: a single line only fits
  // ~460px of type at ~0.6em average advance for Vazirmatn bold Persian.
  // Short pairs stay commanding on one line; longer pairs stack origin over
  // destination on two full-width lines (below ~40px a single line would
  // look weak next to the time phrase). Adversarial lengths still hit the
  // builder cap + ellipsis as a backstop.
  const combined = originDisplay.length + destDisplay.length;
  const singleSize = Math.min(
    64,
    Math.floor(450 / (0.68 * Math.max(combined, 1))),
  );
  const stacked = singleSize < 40;
  const maxLine = Math.max(originDisplay.length, destDisplay.length);
  const stackSize = maxLine <= 10 ? 56 : maxLine <= 16 ? 46 : 38;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "row",
        direction: "ltr",
        background: "#0a0a0a",
        color: "#fafafa",
        padding: "48px 60px",
        gap: "48px",
        fontFamily: "Vazirmatn",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Map panel: its own section (left). All geometry is panel-local
          (see buildShareMap viewport) — nothing here can cover the text. */}
      <div
        style={{
          width: `${OG_PANEL.w}px`,
          height: `${OG_PANEL.h}px`,
          position: "relative",
          // Required by Satori for multi-child nodes (children are all
          // absolutely positioned, so flex layout itself is a no-op).
          display: "flex",
          background: "#131316",
          borderRadius: "24px",
          borderWidth: "2px",
          borderStyle: "solid",
          borderColor: "#26262b",
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        {map && (
          <div style={{ display: "flex" }}>
            {map.edges.map((e, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: e.cx - e.len / 2,
                  top: e.cy - e.thick / 2,
                  width: e.len,
                  height: e.thick,
                  background: e.color,
                  opacity: e.opacity,
                  borderRadius: e.thick / 2,
                  transform: `rotate(${e.deg}deg)`,
                  ...(e.glow ? { boxShadow: e.glow } : {}),
                }}
              />
            ))}
            {map.connectors.map((e, i) => (
              <div
                key={`c${i}`}
                style={{
                  position: "absolute",
                  left: e.cx - e.len / 2,
                  top: e.cy - e.thick / 2,
                  width: e.len,
                  height: e.thick,
                  background: e.color,
                  opacity: e.opacity,
                  borderRadius: e.thick / 2,
                  transform: `rotate(${e.deg}deg)`,
                }}
              />
            ))}
            {map.dots.map((d, i) => (
              <div
                key={`d${i}`}
                style={{
                  position: "absolute",
                  left: d.x - d.r,
                  top: d.y - d.r,
                  width: d.r * 2,
                  height: d.r * 2,
                  borderRadius: "50%",
                  background: d.fill,
                  ...(d.glow ? { boxShadow: d.glow } : {}),
                }}
              />
            ))}
            {map.pins.map((d, i) => (
              <div
                key={`p${i}`}
                style={{
                  position: "absolute",
                  left: d.x - d.r,
                  top: d.y - d.r,
                  width: d.r * 2,
                  height: d.r * 2,
                  borderRadius: "50%",
                  background: d.fill,
                  ...(d.glow ? { boxShadow: d.glow } : {}),
                }}
              />
            ))}
          </div>
        )}
      </div>
      {/* Text column (right = RTL leading side). */}
      <div
        dir="rtl"
        style={{
          width: `${TEXT_COL_W}px`,
          height: `${OG_PANEL.h}px`,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <RtlRow gap={14}>
          <div
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "8px",
              background: BRAND_RED,
            }}
          />
          <div style={{ fontSize: 40, fontWeight: 700 }}>متو</div>
          <div style={{ fontSize: 28, color: "#a1a1aa" }}>metto.ir</div>
        </RtlRow>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "18px",
          }}
        >
          {/* Names split into word nodes: a multi-word name in ONE text node
              lays out LTR internally ("عبدل آباد" would scan as "اباد عبدل").
              Nested row-reverse sub-rows keep intra-name spacing tight while
              the outer row separates origin / arrow / destination. Stacked
              mode puts the full origin (+ arrow, pointing at the line below)
              on line 1 and the destination on line 2. */}
          {!stacked && (
            <RtlRow
              gap={20}
              style={{
                fontSize: singleSize,
                fontWeight: 700,
                lineHeight: 1.25,
                whiteSpace: "nowrap",
                overflow: "hidden",
                maxWidth: "100%",
              }}
            >
              <RtlRow gap={12} style={{ overflow: "hidden", minWidth: 0 }}>
                {originDisplay.split(" ").map((w, i) => (
                  <div
                    key={i}
                    style={{
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      minWidth: 0,
                    }}
                  >
                    {w}
                  </div>
                ))}
              </RtlRow>
              <LeftArrow size={singleSize} />
              <RtlRow gap={12} style={{ overflow: "hidden", minWidth: 0 }}>
                {destDisplay.split(" ").map((w, i) => (
                  <div
                    key={i}
                    style={{
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      minWidth: 0,
                    }}
                  >
                    {w}
                  </div>
                ))}
              </RtlRow>
            </RtlRow>
          )}
          {stacked && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <RtlRow
                gap={12}
                style={{
                  fontSize: stackSize,
                  fontWeight: 700,
                  lineHeight: 1.3,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  maxWidth: "100%",
                }}
              >
                {originDisplay.split(" ").map((w, i) => (
                  <div
                    key={i}
                    style={{
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      minWidth: 0,
                    }}
                  >
                    {w}
                  </div>
                ))}
                <LeftArrow size={stackSize} />
              </RtlRow>
              <RtlRow
                gap={12}
                style={{
                  fontSize: stackSize,
                  fontWeight: 700,
                  lineHeight: 1.3,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  maxWidth: "100%",
                }}
              >
                {destDisplay.split(" ").map((w, i) => (
                  <div
                    key={i}
                    style={{
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      minWidth: 0,
                    }}
                  >
                    {w}
                  </div>
                ))}
              </RtlRow>
            </div>
          )}
          {/* Brand underline: anchors the route block to the RTL edge. */}
          <RtlRow>
            <div
              style={{
                width: "72px",
                height: "8px",
                borderRadius: "4px",
                background: BRAND_RED,
              }}
            />
          </RtlRow>
          {/* Journey substance: schematic strip, line chips, stop/transfer
              counts — all static topology from the map model. Skipped when
              unroutable (legs empty): the card falls back to names + time. */}
          {map && map.legs.length > 0 && (
            <LineStrip legs={map.legs} width={TEXT_COL_W} />
          )}
          {map && map.legs.length > 0 && <LineChips legs={map.legs} />}
          {map && map.legs.length > 0 && (
            <TripMeta
              numStops={map.numStops}
              numTransfers={map.numTransfers}
            />
          )}
          {timePhrase !== "" && (
            <RtlRow
              gap={14}
              style={{
                background: "#2b0d14",
                borderRadius: "16px",
                padding: "10px 18px",
                borderWidth: "2px",
                borderStyle: "solid",
                borderColor: "#661c2a",
              }}
            >
              {timePhrase.split(" ").map((w, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 40,
                    fontWeight: 700,
                    color: "#f4a3b2",
                    whiteSpace: "nowrap",
                  }}
                >
                  {w}
                </div>
              ))}
            </RtlRow>
          )}
        </div>
        <RtlRow gap={10}>
          {"نقشه و مسیریابی مترو".split(" ").map((w, i) => (
            <div key={i} style={{ fontSize: 28, color: "#8e8e96" }}>
              {w}
            </div>
          ))}
        </RtlRow>
      </div>
      {/* Leading-edge accent (right edge in RTL reading). */}
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          right: 0,
          width: "12px",
          background: BRAND_RED,
        }}
      />
    </div>
  );
}
